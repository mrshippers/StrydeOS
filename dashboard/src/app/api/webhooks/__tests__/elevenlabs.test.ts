/**
 * Tests for POST /api/webhooks/elevenlabs
 *
 * On `conversation.ended`, the webhook handler must:
 *   1. Update the call_log doc with the classified outcome.
 *   2. Write a row to /clinics/{clinicId}/insight_events so Pulse's
 *      insight-event-consumer (and Intelligence's insight UI) can pick it up.
 *
 * The two writes must both happen for a single inbound webhook event.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (fn: unknown) => fn,
}));

// Always-pass signature so we don't have to compute a real HMAC in the test.
vi.mock("@/lib/ava/verify-signature", () => ({
  verifyElevenLabsSignature: vi.fn().mockResolvedValue(true),
  isWebhookSecretConfigured: vi.fn().mockReturnValue(true),
}));

// Stub out the SMS-side notify-callback module so the test doesn't try to
// open Twilio sockets — the SMS path is covered separately and is explicitly
// out-of-scope per the task brief.
vi.mock("@/lib/ava/notify-callback", () => ({
  sendCallbackNotification: vi.fn().mockResolvedValue(undefined),
  sendBookingAcknowledgement: vi.fn().mockResolvedValue(undefined),
}));

// LangGraph: classify "call me back" summaries as a callback_request action,
// which the route maps to outcome = "follow_up_required".
vi.mock("@/lib/ava/graph", () => ({
  processCallerInput: vi.fn().mockResolvedValue({
    action: "callback_request",
    metadata: { callbackType: "general", reason: "caller asked for callback" },
  }),
}));

// ─── In-memory Firestore fake ─────────────────────────────────────────────────

interface FakeDocRecord {
  ref: FakeDocRef;
  data: Record<string, unknown>;
}

interface FakeDocRef {
  id: string;
  path: string;
  set: (data: Record<string, unknown>, opts?: { merge?: boolean }) => Promise<void>;
  update: (data: Record<string, unknown>) => Promise<void>;
  get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
}

interface FakeCollectionRef {
  path: string;
  doc: (id: string) => FakeDocRef;
  where: (...args: unknown[]) => FakeQueryRef;
  limit: (n: number) => FakeQueryRef;
  get: () => Promise<{ empty: boolean; docs: { id: string; data: () => Record<string, unknown> }[] }>;
}

interface FakeQueryRef {
  where: (...args: unknown[]) => FakeQueryRef;
  limit: (n: number) => FakeQueryRef;
  get: () => Promise<{ empty: boolean; docs: { id: string; data: () => Record<string, unknown> }[] }>;
}

function makeFakeDb() {
  const docs = new Map<string, FakeDocRecord>();

  const makeDocRef = (path: string): FakeDocRef => {
    const segments = path.split("/");
    const id = segments[segments.length - 1];
    return {
      id,
      path,
      set: async (data, opts) => {
        const existing = docs.get(path)?.data ?? {};
        const merged = opts?.merge ? { ...existing, ...data } : data;
        docs.set(path, { ref: makeDocRef(path), data: merged });
      },
      update: async (data) => {
        const existing = docs.get(path)?.data ?? {};
        docs.set(path, { ref: makeDocRef(path), data: { ...existing, ...data } });
      },
      get: async () => {
        const rec = docs.get(path);
        return {
          exists: !!rec,
          data: () => rec?.data,
        };
      },
    };
  };

  const makeCollectionRef = (path: string): FakeCollectionRef => {
    const queryGet = async () => {
      // Match docs whose path starts with `${path}/` and have no further `/`.
      const matching: { id: string; data: () => Record<string, unknown> }[] = [];
      for (const [key, rec] of docs.entries()) {
        const prefix = `${path}/`;
        if (key.startsWith(prefix)) {
          const remainder = key.slice(prefix.length);
          if (!remainder.includes("/")) {
            matching.push({ id: rec.ref.id, data: () => rec.data });
          }
        }
      }
      return { empty: matching.length === 0, docs: matching };
    };

    const query: FakeQueryRef = {
      where: () => query,
      limit: () => query,
      get: queryGet,
    };

    return {
      path,
      doc: (id: string) => {
        const docPath = `${path}/${id}`;
        // Augment the returned ref with collection() for nested traversal.
        const ref = makeDocRef(docPath) as FakeDocRef & {
          collection: (sub: string) => FakeCollectionRef;
        };
        ref.collection = (sub: string) => makeCollectionRef(`${docPath}/${sub}`);
        return ref;
      },
      where: query.where,
      limit: query.limit,
      get: queryGet,
    };
  };

  // Top-level db.collection(name)
  const db = {
    collection: (name: string) => makeCollectionRef(name),
  };

  return { db, docs };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/webhooks/elevenlabs", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "elevenlabs-signature": "stub-sig",
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/elevenlabs — conversation.ended", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes BOTH a call_log doc (outcome=follow_up_required) AND an insight_events doc (AVA_CALLBACK_REQUESTED) for a callback request", async () => {
    const { db, docs } = makeFakeDb();

    // Seed clinic so the agent_id lookup resolves.
    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-123",
      agent_id: "agent-abc",
      summary: "I need someone to call me back",
      caller_phone: "+447700900001",
      call_duration: 47,
      reason_for_call: "callback",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);

    expect(res.status).toBe(200);

    // 1. call_log doc exists with outcome = follow_up_required
    const callLog = docs.get("clinics/clinic-spires/call_log/conv-123");
    expect(callLog).toBeDefined();
    expect(callLog?.data.outcome).toBe("follow_up_required");
    expect(callLog?.data.conversationId).toBe("conv-123");

    // 2. insight_events doc written with the right shape for Pulse to consume
    const insightDocId = "ava-conv-123-AVA_CALLBACK_REQUESTED";
    const insight = docs.get(`clinics/clinic-spires/insight_events/${insightDocId}`);
    expect(insight).toBeDefined();
    expect(insight?.data.type).toBe("AVA_CALLBACK_REQUESTED");
    expect(insight?.data.actionTarget).toBe("patient");
    expect(insight?.data.severity).toBe("warning");
    expect(insight?.data.clinicId).toBe("clinic-spires");
    expect(insight?.data.id).toBe(insightDocId);
    expect(insight?.data.consumedBy).toEqual([]);

    const metadata = insight?.data.metadata as Record<string, unknown>;
    expect(metadata.conversationId).toBe("conv-123");
    expect(metadata.callerPhone).toBe("+447700900001");
    expect(metadata.callbackType).toBe("general");
    expect(metadata.callDurationSeconds).toBe(47);
  });
});
