import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

// ─── Env ─────────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-webhook-secret";

// ─── Firestore mock ───────────────────────────────────────────────────────────

const writtenDocs: Record<string, unknown> = {};

const mockSet = vi.fn(async (data: Record<string, unknown>) => {
  Object.assign(writtenDocs, data);
});

function makeClinicQuerySnap(clinicId: string | null) {
  if (!clinicId) return { empty: true, docs: [] };
  return {
    empty: false,
    docs: [{ id: clinicId }],
  };
}

let clinicIdForAgent: string | null = "clinic-spires";

const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === "clinics") {
      return {
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(async () => makeClinicQuerySnap(clinicIdForAgent)),
          })),
        })),
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({ set: mockSet })),
          })),
        })),
      };
    }
    return {};
  }),
};

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => mockDb,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__SERVER_TIMESTAMP__",
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSignature(secret: string, rawBody: string): string {
  const timestamp = "1700000000";
  const hmac = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v0=${hmac}`;
}

function makeRequest(
  body: unknown,
  opts: { secret?: string; badSignature?: boolean; noSignature?: boolean } = {}
): NextRequest {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (!opts.noSignature && (opts.secret || process.env.ELEVENLABS_WEBHOOK_SECRET)) {
    const secret = opts.secret ?? process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";
    if (opts.badSignature) {
      headers["elevenlabs-signature"] = "t=1700000000,v0=deadbeef";
    } else {
      headers["elevenlabs-signature"] = makeSignature(secret, rawBody);
    }
  }

  return new NextRequest("http://localhost/api/ava/post-call", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "post_call_transcription",
    event_timestamp: 1700000000,
    data: {
      conversation_id: "conv_test123",
      agent_id: "agent_spires",
      status: "done",
      transcript: [
        { role: "agent", message: "Hello, Spires Physiotherapy." },
        { role: "user", message: "Hi, I need to book an appointment." },
      ],
      metadata: {
        start_time_unix_secs: 1700000000,
        call_duration_secs: 45,
        termination_reason: "user_hangup",
        phone_call: { caller_id: "+447700900001", callee_id: "+442045727044" },
      },
      analysis: {
        call_successful: "success",
        transcript_summary: "Caller requested appointment booking.",
      },
      ...overrides,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/ava/post-call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(writtenDocs).forEach((k) => delete writtenDocs[k]);
    clinicIdForAgent = "clinic-spires";
    // The route fails closed without a secret, so the suite runs configured;
    // the config_missing test below deletes it explicitly.
    process.env.ELEVENLABS_WEBHOOK_SECRET = TEST_SECRET;
  });

  // ── Normal path ────────────────────────────────────────────────────────────

  it("writes voiceInteraction for a completed call with full transcript", async () => {
    const { POST } = await import("../route");
    const body = makePayload();
    const res = await POST(makeRequest(body));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.clinicId).toBe("clinic-spires");
    expect(json.conversationId).toBe("conv_test123");
    expect(mockSet).toHaveBeenCalled();
  });

  // ── Edge case A: caller hangs up immediately ───────────────────────────────

  it("A: writes doc when caller hangs up (empty transcript, status failed)", async () => {
    const { POST } = await import("../route");
    const body = makePayload({
      status: "failed",
      transcript: [],
      metadata: {
        start_time_unix_secs: 1700000000,
        call_duration_secs: 2,
        termination_reason: "user_hangup",
        phone_call: { caller_id: "+447700900001" },
      },
      analysis: null,
    });

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalled();

    const [docData] = mockSet.mock.calls[0] as [Record<string, unknown>];
    expect(docData.callStatus).toBe("failed");
    expect(docData.transcript).toBeNull();
    expect(docData.callSuccessful).toBe(false);
    expect(docData.durationSeconds).toBe(2);
    expect(docData.disconnectionReason).toBe("user_hangup");
  });

  it("A: writes doc when analysis field is completely absent", async () => {
    const { POST } = await import("../route");
    const body = makePayload({ analysis: undefined });
    // Remove analysis key entirely from data
    delete (body.data as Record<string, unknown>).analysis;

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalled();
    const [docData] = mockSet.mock.calls[0] as [Record<string, unknown>];
    expect(docData.callSuccessful).toBe(false);
    expect(docData.callSummary).toBeNull();
  });

  it("A: writes doc when call duration is zero (immediate hangup)", async () => {
    const { POST } = await import("../route");
    const body = makePayload({
      status: "interrupted",
      transcript: [],
      metadata: {
        start_time_unix_secs: 1700000000,
        call_duration_secs: 0,
        termination_reason: "user_hangup",
        phone_call: null,
      },
      analysis: null,
    });

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalled();
    const [docData] = mockSet.mock.calls[0] as [Record<string, unknown>];
    expect(docData.callStatus).toBe("interrupted");
    expect(docData.durationSeconds).toBe(0);
    expect(docData.callerPhone).toBeNull();
    expect(docData.endTimestamp).toBeNull();
  });

  it("A: writes doc when phone_call metadata is null (no caller ID available)", async () => {
    const { POST } = await import("../route");
    const body = makePayload({
      metadata: {
        start_time_unix_secs: 1700000000,
        call_duration_secs: 3,
        termination_reason: "user_hangup",
        phone_call: null,
      },
    });

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(200);
    const [docData] = mockSet.mock.calls[0] as [Record<string, unknown>];
    expect(docData.callerPhone).toBeNull();
  });

  // ── HMAC validation ────────────────────────────────────────────────────────

  it("rejects with 403 when HMAC signature is invalid", async () => {
    process.env.ELEVENLABS_WEBHOOK_SECRET = TEST_SECRET;
    const { POST } = await import("../route");
    const body = makePayload();
    const res = await POST(makeRequest(body, { badSignature: true }));

    expect(res.status).toBe(403);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("rejects with 403 when signature header is missing and secret is configured", async () => {
    process.env.ELEVENLABS_WEBHOOK_SECRET = TEST_SECRET;
    const { POST } = await import("../route");
    const body = makePayload();
    const res = await POST(makeRequest(body, { noSignature: true }));

    expect(res.status).toBe(403);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("fails closed (config_missing, no write) when ELEVENLABS_WEBHOOK_SECRET is not set", async () => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    const { POST } = await import("../route");
    const body = makePayload();
    const res = await POST(makeRequest(body, { noSignature: true }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ error: "config_missing" });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("accepts request with valid HMAC signature", async () => {
    process.env.ELEVENLABS_WEBHOOK_SECRET = TEST_SECRET;
    const { POST } = await import("../route");
    const body = makePayload();
    const res = await POST(makeRequest(body, { secret: TEST_SECRET }));

    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalled();
  });

  // ── Event type filter ──────────────────────────────────────────────────────

  it("skips non-post_call_transcription events without writing to Firestore", async () => {
    const { POST } = await import("../route");
    const body = { type: "agent_response", data: { conversation_id: "conv_x", agent_id: "agent_x" } };
    const res = await POST(makeRequest(body));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.skipped).toBe(true);
    expect(mockSet).not.toHaveBeenCalled();
  });

  // ── Missing required fields ────────────────────────────────────────────────

  it("returns 400 when conversation_id is missing", async () => {
    const { POST } = await import("../route");
    const body = makePayload({ conversation_id: undefined });
    delete (body.data as Record<string, unknown>).conversation_id;
    const res = await POST(makeRequest(body));

    expect(res.status).toBe(400);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not valid JSON", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/ava/post-call", {
        method: "POST",
        body: "not json",
        headers: { "elevenlabs-signature": makeSignature(TEST_SECRET, "not json") },
      })
    );
    expect(res.status).toBe(400);
    expect(mockSet).not.toHaveBeenCalled();
  });

  // ── Clinic resolution ──────────────────────────────────────────────────────

  it("returns ok:true with clinicId:null if no clinic has this agent_id", async () => {
    clinicIdForAgent = null;
    const { POST } = await import("../route");
    const body = makePayload();
    const res = await POST(makeRequest(body));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.clinicId).toBeNull();
    expect(mockSet).not.toHaveBeenCalled();
  });
});
