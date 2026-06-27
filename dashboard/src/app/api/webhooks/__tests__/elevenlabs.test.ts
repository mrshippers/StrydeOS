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
  // The call_facts block reads getTrace() to thread the request trace onto the
  // emitted fact event; undefined → the route falls back to makeRootTrace.
  getTrace: () => undefined,
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
  /** Atomic create — throws { code: 6 } (ALREADY_EXISTS) if the doc exists. */
  create: (data: Record<string, unknown>) => Promise<void>;
  delete: () => Promise<void>;
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
      create: async (data) => {
        if (docs.has(path)) {
          // Mirror Firestore's ALREADY_EXISTS gRPC code 6.
          throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
        }
        docs.set(path, { ref: makeDocRef(path), data });
      },
      delete: async () => {
        docs.delete(path);
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

    // P0-11: the human-readable `description` must NOT leak the caller phone —
    // the number lives only in the structured metadata.callerPhone field.
    expect(insight?.data.description).toBe("Ava: callback requested");
    expect(String(insight?.data.description)).not.toContain("+447700900001");

    // P0-11: call_log carries a purgeAfter TTL stamp for scheduled erasure.
    expect(typeof callLog?.data.purgeAfter).toBe("number");
    expect(callLog?.data.purgeAfter as number).toBeGreaterThan(Date.now());
  });

  it("de-duplicates a replayed conversation.ended: SMS + insight side effects fire only once (P0-10)", async () => {
    const { db, docs } = makeFakeDb();

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { sendCallbackNotification } = await import("@/lib/ava/notify-callback");
    const { POST } = await import("../elevenlabs/route");

    const body = {
      event: "conversation.ended",
      conversation_id: "conv-replay",
      agent_id: "agent-abc",
      summary: "I need someone to call me back",
      caller_phone: "+447700900002",
      call_duration: 30,
      reason_for_call: "callback",
      timestamp: Math.floor(Date.now() / 1000),
    };

    // First delivery: side effects fire, claim doc written.
    const res1 = await POST(makeRequest(body));
    expect(res1.status).toBe(200);
    const claim = docs.get(
      "clinics/clinic-spires/_ava_processed_events/conv-replay__conversation.ended",
    );
    expect(claim).toBeDefined();
    expect(vi.mocked(sendCallbackNotification)).toHaveBeenCalledTimes(1);

    // Replay the exact same event: must short-circuit as deduplicated and NOT
    // re-fire the callback SMS.
    const res2 = await POST(makeRequest(body));
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.deduplicated).toBe(true);
    expect(vi.mocked(sendCallbackNotification)).toHaveBeenCalledTimes(1);
  });

  // ─── DEFECT 1: outcome-ladder drift ──────────────────────────────────────────
  it("keeps a terminal live-call outcome (transferred) and does NOT downgrade it from the post-call summary classifier", async () => {
    const { db, docs } = makeFakeDb();

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    // The live-call transfer handler (transfer-call.ts) already wrote the
    // authoritative outcome to the SAME call_log doc BEFORE the post-call
    // webhook lands.
    await db
      .collection("clinics")
      .doc("clinic-spires")
      .collection("call_log")
      .doc("conv-transfer")
      .set({
        transferredAt: new Date().toISOString(),
        transferredTo: "+447700900500",
        transferReason: "complaint",
        outcome: "transferred",
      });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    // The graph mock classifies this summary as callback_request ->
    // follow_up_required, which WOULD clobber "transferred" without the guard.
    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-transfer",
      agent_id: "agent-abc",
      summary: "I need someone to call me back",
      caller_phone: "+447700900003",
      call_duration: 60,
      reason_for_call: "callback",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    // The authoritative live outcome must survive the post-call update.
    const callLog = docs.get("clinics/clinic-spires/call_log/conv-transfer");
    expect(callLog?.data.outcome).toBe("transferred");
    expect(callLog?.data.transferredAt).toBeDefined();

    // Preserved outcome must flow through the whole pipeline: a transferred
    // call must NOT raise a callback insight event.
    const insight = docs.get(
      "clinics/clinic-spires/insight_events/ava-conv-transfer-AVA_CALLBACK_REQUESTED",
    );
    expect(insight).toBeUndefined();
  });

  // ─── DEFECT 1b: a REAL live booking must not be downgraded, and must surface
  //     its PMS id on the Intelligence call_fact ───────────────────────────────
  it("promotes a live booking (bookingExternalId on call_log) to outcome=booked, ignoring the summary classifier, and emits appointmentExternalId on the call_fact", async () => {
    const { db, docs } = makeFakeDb();

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    // The live booking tool (/api/ava/tools) already created the PMS appointment
    // and stamped its id on the SAME call_log doc before the call ended.
    await db
      .collection("clinics")
      .doc("clinic-spires")
      .collection("call_log")
      .doc("conv-booked")
      .set({ bookingExternalId: "appt_PMS_777" });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    // The graph mock classifies the summary as callback_request ->
    // follow_up_required, which WOULD bury a real booking without the guard.
    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-booked",
      agent_id: "agent-abc",
      summary: "thanks, can someone call me back to confirm",
      caller_phone: "+447700900007",
      call_duration: 90,
      reason_for_call: "booking",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    // 1. Outcome ladder: a real live booking wins over the summary classifier.
    const callLog = docs.get("clinics/clinic-spires/call_log/conv-booked");
    expect(callLog?.data.outcome).toBe("booked");

    // 2. The Intelligence call_fact carries the real PMS id so booking-conversion
    //    KPIs can join voice bookings to the PMS record.
    const fact = docs.get("clinics/clinic-spires/call_facts/ava-fact-conv-booked");
    expect(fact).toBeDefined();
    const payload = fact?.data.payload as Record<string, unknown>;
    expect(payload.appointmentExternalId).toBe("appt_PMS_777");
    expect(payload.booked).toBe(true);
    expect(payload.outcome).toBe("booked");

    // 3. A booked call must raise the booking insight, not a callback insight.
    expect(
      docs.get("clinics/clinic-spires/insight_events/ava-conv-booked-AVA_CALL_BOOKED"),
    ).toBeDefined();
    expect(
      docs.get("clinics/clinic-spires/insight_events/ava-conv-booked-AVA_CALLBACK_REQUESTED"),
    ).toBeUndefined();
  });

  // ─── Red-flag escalation: a clinical red flag must escalate, not transfer ─────
  it("escalates a red-flag handoff (transfer_call + metadata.escalate) to outcome=escalated, raising the critical insight and the escalation SMS", async () => {
    const { db, docs } = makeFakeDb();

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    // Red-flag detector routes to human_handoff, which warm-transfers BUT flags
    // the call for escalation. Without the mapping this lands as "transferred"
    // and no owner alert / escalation SMS ever fires for a cauda-equina call.
    const { processCallerInput } = await import("@/lib/ava/graph");
    vi.mocked(processCallerInput).mockResolvedValueOnce({
      action: "transfer_call",
      message:
        "Some of what you've described needs urgent attention. If this feels like an emergency, please call 999 or go to A&E.",
      metadata: { escalate: true, flagsFound: ["chest pain", "radiating to arm"] },
    } as never);

    const { sendCallbackNotification } = await import("@/lib/ava/notify-callback");

    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-redflag",
      agent_id: "agent-abc",
      summary: "caller reported chest pain radiating to the arm",
      caller_phone: "+447700900009",
      call_duration: 40,
      reason_for_call: "clinical",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callLog = docs.get("clinics/clinic-spires/call_log/conv-redflag");
    expect(callLog?.data.outcome).toBe("escalated");

    // Critical owner-facing insight must fire (not a routine transfer record).
    expect(
      docs.get("clinics/clinic-spires/insight_events/ava-conv-redflag-AVA_CALL_ESCALATED"),
    ).toBeDefined();

    // The real-time escalation SMS must fire for an escalated call.
    expect(vi.mocked(sendCallbackNotification)).toHaveBeenCalledTimes(1);
  });

  // ─── DEFECT 2: SMS notification durability ────────────────────────────────────
  it("does NOT finalise the dedup claim when the callback SMS send rejects, so an ElevenLabs retry can re-attempt", async () => {
    const { db, docs } = makeFakeDb();

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { sendCallbackNotification } = await import("@/lib/ava/notify-callback");
    const { POST } = await import("../elevenlabs/route");

    const body = {
      event: "conversation.ended",
      conversation_id: "conv-sms-fail",
      agent_id: "agent-abc",
      summary: "I need someone to call me back",
      caller_phone: "+447700900004",
      call_duration: 25,
      reason_for_call: "callback",
      timestamp: Math.floor(Date.now() / 1000),
    };

    const claimPath =
      "clinics/clinic-spires/_ava_processed_events/conv-sms-fail__conversation.ended";

    // First delivery: the SMS send rejects (Twilio outage / frozen function).
    vi.mocked(sendCallbackNotification).mockRejectedValueOnce(new Error("twilio 500"));

    const res1 = await POST(makeRequest(body));
    // Transient failure -> 500 so ElevenLabs retries the whole webhook.
    expect(res1.status).toBe(500);

    // CRITICAL: a failed send must NOT leave a finalised dedup claim, else the
    // retry below is dedup-blocked and the notification is lost forever.
    expect(docs.get(claimPath)).toBeUndefined();

    // Retry: the send now succeeds. The webhook must process cleanly and fire
    // the SMS once more on this attempt.
    vi.mocked(sendCallbackNotification).mockResolvedValueOnce(undefined);
    const res2 = await POST(makeRequest(body));
    expect(res2.status).toBe(200);
    expect(docs.get(claimPath)).toBeDefined();
    expect(vi.mocked(sendCallbackNotification)).toHaveBeenCalledTimes(2);
  });
});
