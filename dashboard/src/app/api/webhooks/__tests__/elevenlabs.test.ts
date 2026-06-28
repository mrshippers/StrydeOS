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

function makeFakeDb(hooks?: { failSet?: (path: string) => boolean }) {
  const docs = new Map<string, FakeDocRecord>();

  const makeDocRef = (path: string): FakeDocRef => {
    const segments = path.split("/");
    const id = segments[segments.length - 1];
    return {
      id,
      path,
      set: async (data, opts) => {
        // Inject a transient write failure on a targeted path (e.g. an
        // insight_events or call_facts doc) so durability behaviour can be
        // exercised without touching the call_log / dedup-claim writes.
        if (hooks?.failSet?.(path)) throw new Error(`firestore unavailable: ${path}`);
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

  // ─── DEFECT 4: a confirmed live cancel must classify as follow_up_required ─────
  it("classifies a live cancel (cancelledAt, no bookingExternalId) as follow_up_required, not resolved, so Pulse chases the freed slot", async () => {
    const { db, docs } = makeFakeDb();

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    // The live cancel tool (/api/ava/tools) stamped a cancel marker on the SAME
    // call_log doc during the call. There is no bookingExternalId — a pure cancel.
    await db
      .collection("clinics")
      .doc("clinic-spires")
      .collection("call_log")
      .doc("conv-cancel")
      .set({ cancelledAt: new Date().toISOString(), cancellationExternalId: "appt_old_1" });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    // The summary classifier would call this resolved (end_call). The durable
    // cancel marker must override that to follow_up_required.
    const { processCallerInput } = await import("@/lib/ava/graph");
    vi.mocked(processCallerInput).mockResolvedValueOnce({
      action: "end_call",
      metadata: {},
    } as never);

    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-cancel",
      agent_id: "agent-abc",
      summary: "ok great, thanks, bye",
      caller_phone: "+447700900010",
      call_duration: 20,
      reason_for_call: "cancel",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callLog = docs.get("clinics/clinic-spires/call_log/conv-cancel");
    expect(callLog?.data.outcome).toBe("follow_up_required");

    // A freed slot must raise the callback insight so Pulse can chase it.
    expect(
      docs.get("clinics/clinic-spires/insight_events/ava-conv-cancel-AVA_CALLBACK_REQUESTED"),
    ).toBeDefined();
  });

  // ─── DEFECT 4 guard: bookingExternalId still wins over a cancel marker ─────────
  it("classifies booked when bookingExternalId is present even if a cancelledAt marker also exists (reschedule never downgrades)", async () => {
    const { db, docs } = makeFakeDb();

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    // A booking id present AND a cancel marker present: the booking must win, the
    // new cancel branch must not interfere with the established booked outcome.
    await db
      .collection("clinics")
      .doc("clinic-spires")
      .collection("call_log")
      .doc("conv-both")
      .set({ bookingExternalId: "appt_new_1", cancelledAt: new Date().toISOString() });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { processCallerInput } = await import("@/lib/ava/graph");
    vi.mocked(processCallerInput).mockResolvedValueOnce({
      action: "end_call",
      metadata: {},
    } as never);

    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-both",
      agent_id: "agent-abc",
      summary: "ok great, thanks, bye",
      caller_phone: "+447700900011",
      call_duration: 30,
      reason_for_call: "reschedule",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callLog = docs.get("clinics/clinic-spires/call_log/conv-both");
    expect(callLog?.data.outcome).toBe("booked");
    expect(
      docs.get("clinics/clinic-spires/insight_events/ava-conv-both-AVA_CALL_BOOKED"),
    ).toBeDefined();
    expect(
      docs.get("clinics/clinic-spires/insight_events/ava-conv-both-AVA_CALLBACK_REQUESTED"),
    ).toBeUndefined();
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

  // ─── FIX 2: escalated must override a prior live "transferred" outcome ─────────
  it("upgrades a doc already marked transferred (transferredAt + outcome=transferred) to escalated when the post-call graph flags escalate, firing the critical insight and escalation SMS", async () => {
    const { db, docs } = makeFakeDb();

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    // A red-flag warm transfer (transfer-call.ts) wrote {transferredAt, outcome:
    // "transferred"} to the SAME call_log doc DURING the call. The post-call graph
    // then resolves the call as an escalation — escalated is strictly higher than
    // transferred and MUST win, or the clinical red flag is buried as a routine
    // transfer (no AVA_CALL_ESCALATED insight, no escalation SMS).
    await db
      .collection("clinics")
      .doc("clinic-spires")
      .collection("call_log")
      .doc("conv-tx-escalate")
      .set({
        transferredAt: new Date().toISOString(),
        transferredTo: "+447700900500",
        outcome: "transferred",
      });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { processCallerInput } = await import("@/lib/ava/graph");
    vi.mocked(processCallerInput).mockResolvedValueOnce({
      action: "transfer_call",
      message: "Some of what you've described needs urgent attention.",
      metadata: { escalate: true, callbackType: "clinician", reason: "red_flag", flagsFound: ["chest pain"] },
    } as never);

    const { sendCallbackNotification } = await import("@/lib/ava/notify-callback");

    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-tx-escalate",
      agent_id: "agent-abc",
      summary: "caller reported chest pain mid-call, warm transferred",
      caller_phone: "+447700900012",
      call_duration: 55,
      reason_for_call: "clinical",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    // escalated wins over the prior transferred marker.
    const callLog = docs.get("clinics/clinic-spires/call_log/conv-tx-escalate");
    expect(callLog?.data.outcome).toBe("escalated");

    // Critical insight fires (not buried as a transfer with no insight).
    expect(
      docs.get("clinics/clinic-spires/insight_events/ava-conv-tx-escalate-AVA_CALL_ESCALATED"),
    ).toBeDefined();
    // And it must NOT be quietly recorded as a plain transfer.
    expect(
      docs.get("clinics/clinic-spires/insight_events/ava-conv-tx-escalate-AVA_CALLBACK_REQUESTED"),
    ).toBeUndefined();

    // Real-time escalation SMS fires.
    expect(vi.mocked(sendCallbackNotification)).toHaveBeenCalledTimes(1);
  });

  // ─── FIX 2 regression: an existing escalated outcome is never downgraded ───────
  it("never downgrades an existing escalated outcome even if the post-call graph returns a plain transfer", async () => {
    const { db, docs } = makeFakeDb();

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    await db
      .collection("clinics")
      .doc("clinic-spires")
      .collection("call_log")
      .doc("conv-already-esc")
      .set({ outcome: "escalated" });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    // A plain reception transfer (no escalate marker) must not pull escalated down.
    const { processCallerInput } = await import("@/lib/ava/graph");
    vi.mocked(processCallerInput).mockResolvedValueOnce({
      action: "transfer_call",
      metadata: {},
    } as never);

    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-already-esc",
      agent_id: "agent-abc",
      summary: "transferred to reception",
      caller_phone: "+447700900013",
      call_duration: 35,
      reason_for_call: "general",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const callLog = docs.get("clinics/clinic-spires/call_log/conv-already-esc");
    expect(callLog?.data.outcome).toBe("escalated");
  });

  // ─── FIX 11: red-flag detail (flagsFound) threaded into the escalation insight ─
  it("carries flagsFound from graphMetadata into the AVA_CALL_ESCALATED insight metadata as a structured array", async () => {
    const { db, docs } = makeFakeDb();

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { processCallerInput } = await import("@/lib/ava/graph");
    vi.mocked(processCallerInput).mockResolvedValueOnce({
      action: "transfer_call",
      message: "Some of what you've described needs urgent attention.",
      metadata: {
        escalate: true,
        callbackType: "clinician",
        reason: "red_flag",
        flagsFound: ["chest pain", "radiating to arm"],
      },
    } as never);

    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-flags",
      agent_id: "agent-abc",
      summary: "caller reported chest pain radiating to the arm",
      caller_phone: "+447700900014",
      call_duration: 42,
      reason_for_call: "clinical",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const insight = docs.get(
      "clinics/clinic-spires/insight_events/ava-conv-flags-AVA_CALL_ESCALATED",
    );
    expect(insight).toBeDefined();
    const metadata = insight?.data.metadata as Record<string, unknown>;
    expect(metadata.flagsFound).toEqual(["chest pain", "radiating to arm"]);
    // The structured array must NOT be interpolated into the free-text description.
    expect(String(insight?.data.description)).not.toContain("chest pain");
  });

  // ─── FIX 3: insight_events / call_facts durability ────────────────────────────
  // The dedup claim is committed BEFORE the side effects, so a swallowed
  // insight_events or call_facts write permanently dropped the AVA insight /
  // Intelligence call_fact while the claim blocked any redelivery. The writes are
  // reordered to run BEFORE the SMS (idempotent set/merge on deterministic ids)
  // and given the same release-claim-and-rethrow treatment the SMS block has, so
  // an earlier-write failure 500s and the retry re-runs them then sends the SMS
  // exactly once.
  it("releases the dedup claim and 500s when the insight_events write throws, so ElevenLabs redelivers", async () => {
    const { db, docs } = makeFakeDb({ failSet: (path) => path.includes("/insight_events/") });

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { sendCallbackNotification } = await import("@/lib/ava/notify-callback");

    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-insight-fail",
      agent_id: "agent-abc",
      summary: "I need someone to call me back",
      caller_phone: "+447700900020",
      call_duration: 25,
      reason_for_call: "callback",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);

    // Transient failure -> 500 so ElevenLabs retries the whole webhook.
    expect(res.status).toBe(500);
    // The dedup claim must NOT survive, else the retry is blocked and the insight
    // is lost forever.
    expect(
      docs.get("clinics/clinic-spires/_ava_processed_events/conv-insight-fail__conversation.ended"),
    ).toBeUndefined();
    // The SMS runs LAST, so a failed insight write must not have texted anyone.
    expect(vi.mocked(sendCallbackNotification)).not.toHaveBeenCalled();
  });

  it("releases the dedup claim and 500s when the call_facts write throws, so ElevenLabs redelivers", async () => {
    const { db, docs } = makeFakeDb({ failSet: (path) => path.includes("/call_facts/") });

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { sendCallbackNotification } = await import("@/lib/ava/notify-callback");

    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-fact-fail",
      agent_id: "agent-abc",
      summary: "I need someone to call me back",
      caller_phone: "+447700900021",
      call_duration: 25,
      reason_for_call: "callback",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(
      docs.get("clinics/clinic-spires/_ava_processed_events/conv-fact-fail__conversation.ended"),
    ).toBeUndefined();
    // SMS is the last side effect, so a call_facts failure must precede it.
    expect(vi.mocked(sendCallbackNotification)).not.toHaveBeenCalled();
  });

  it("on the happy path fires the callback SMS exactly once AND writes the insight + the call_fact", async () => {
    const { db, docs } = makeFakeDb();

    await db.collection("clinics").doc("clinic-spires").set({
      name: "Spires Physiotherapy",
      ava: { agent_id: "agent-abc" },
    });

    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { sendCallbackNotification } = await import("@/lib/ava/notify-callback");

    const req = makeRequest({
      event: "conversation.ended",
      conversation_id: "conv-happy-order",
      agent_id: "agent-abc",
      summary: "I need someone to call me back",
      caller_phone: "+447700900022",
      call_duration: 25,
      reason_for_call: "callback",
      timestamp: Math.floor(Date.now() / 1000),
    });

    const { POST } = await import("../elevenlabs/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Insight + fact both persisted...
    expect(
      docs.get("clinics/clinic-spires/insight_events/ava-conv-happy-order-AVA_CALLBACK_REQUESTED"),
    ).toBeDefined();
    expect(docs.get("clinics/clinic-spires/call_facts/ava-fact-conv-happy-order")).toBeDefined();
    // ...and the SMS fired exactly once.
    expect(vi.mocked(sendCallbackNotification)).toHaveBeenCalledTimes(1);
  });

  it("dedup-blocks a redelivery after a successful run, firing no second SMS", async () => {
    const { db } = makeFakeDb();

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
      conversation_id: "conv-redeliver",
      agent_id: "agent-abc",
      summary: "I need someone to call me back",
      caller_phone: "+447700900023",
      call_duration: 25,
      reason_for_call: "callback",
      timestamp: Math.floor(Date.now() / 1000),
    };

    const res1 = await POST(makeRequest(body));
    expect(res1.status).toBe(200);
    expect(vi.mocked(sendCallbackNotification)).toHaveBeenCalledTimes(1);

    // Redelivery after success: dedup-blocked, no second SMS.
    const res2 = await POST(makeRequest(body));
    expect(res2.status).toBe(200);
    expect((await res2.json()).deduplicated).toBe(true);
    expect(vi.mocked(sendCallbackNotification)).toHaveBeenCalledTimes(1);
  });
});
