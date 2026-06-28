/**
 * Reschedule must be a saga: book the NEW appointment before cancelling the OLD.
 *
 * Bug (harness HIGH): handleUpdateBooking Phase 2 cancelled the existing PMS
 * appointment FIRST, then created the replacement. If createAppointment threw,
 * the catch only returned a graceful script — leaving the patient with NO
 * appointment (old cancelled, new never made) and no rollback. The correct
 * ordering creates the new slot first; only once that succeeds is the old one
 * cancelled, so a create failure leaves the original booking intact.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (fn: unknown) => fn,
}));
vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: vi.fn(),
}));
vi.mock("@/lib/integrations/pms/factory", () => ({
  createPMSAdapter: vi.fn(),
}));

const AGENT_ID = "agent_spires_001";
const CLINIC_ID = "clinic_001";
const TOOLS_SECRET = "test_tools_secret";
const OLD_BOOKING_ID = "appt_old_1";

function makeDb() {
  const apptDocs = new Map<string, Record<string, unknown>>([
    [OLD_BOOKING_ID, { clinicianId: "ext_clin_1", patientId: "pat_1", appointmentType: "follow_up" }],
  ]);
  const apptDocRef = (id: string) => ({
    get: vi.fn(async () => ({ exists: apptDocs.has(id), data: () => apptDocs.get(id) })),
    set: vi.fn(async (d: Record<string, unknown>) => { apptDocs.set(id, { ...(apptDocs.get(id) ?? {}), ...d }); }),
    update: vi.fn(async (d: Record<string, unknown>) => { apptDocs.set(id, { ...(apptDocs.get(id) ?? {}), ...d }); }),
  });
  const apptRefs = new Map<string, ReturnType<typeof apptDocRef>>();
  const apptColRef = {
    doc: vi.fn((id: string) => {
      if (!apptRefs.has(id)) apptRefs.set(id, apptDocRef(id));
      return apptRefs.get(id)!;
    }),
  };

  const cliniciansColRef = {
    get: vi.fn().mockResolvedValue({
      docs: [{ id: "clin_1", data: () => ({ name: "Andrew", pmsExternalId: "ext_clin_1" }) }],
    }),
  };
  const pmsConfigDoc = { data: vi.fn().mockReturnValue({ provider: "writeupp", apiKey: "wukey" }) };

  // call_log docs keyed by conversationId — captures the durable markers the
  // reschedule (bookingExternalId) and cancel (cancelledAt) paths write.
  const callLogSets: Record<string, unknown>[] = [];
  const callLogDocRef = {
    set: vi.fn(async (d: Record<string, unknown>) => { callLogSets.push(d); }),
  };
  const callLogColRef = { doc: vi.fn().mockReturnValue(callLogDocRef) };

  // Booking idempotency claim store — real claimBooking/settleBooking/release
  // run against this. create() throws gRPC code 6 on a duplicate (retry).
  const claimStore = new Map<string, Record<string, unknown>>();
  const claimDocRef = (key: string) => ({
    create: vi.fn(async (d: Record<string, unknown>) => {
      if (claimStore.has(key)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
      claimStore.set(key, d);
    }),
    get: vi.fn(async () => ({ data: () => claimStore.get(key) })),
    set: vi.fn(async (d: Record<string, unknown>) => { claimStore.set(key, { ...(claimStore.get(key) ?? {}), ...d }); }),
    delete: vi.fn(async () => claimStore.delete(key)),
  });
  const claimRefs = new Map<string, ReturnType<typeof claimDocRef>>();
  const claimsColRef = {
    doc: vi.fn((key: string) => {
      if (!claimRefs.has(key)) claimRefs.set(key, claimDocRef(key));
      return claimRefs.get(key)!;
    }),
  };

  const clinicDocRef = {
    collection: vi.fn((name: string) => {
      if (name === "integrations_config")
        return { doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(pmsConfigDoc) }) };
      if (name === "clinicians") return cliniciansColRef;
      if (name === "appointments") return apptColRef;
      if (name === "call_log") return callLogColRef;
      if (name === "_ava_booking_claims") return claimsColRef;
      return { doc: vi.fn().mockReturnValue({ set: vi.fn(), update: vi.fn(), get: vi.fn() }) };
    }),
  };

  const clinicSnap = {
    empty: false,
    docs: [{ id: CLINIC_ID, data: vi.fn().mockReturnValue({ ava: { agent_id: AGENT_ID } }) }],
  };
  const clinicsColRef = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(clinicSnap),
    doc: vi.fn().mockReturnValue(clinicDocRef),
  };

  const db = {
    collection: vi.fn((name: string) => {
      if (name === "_") return { doc: vi.fn().mockReturnValue({ id: "generated_id" }) };
      return clinicsColRef;
    }),
  };
  return { db, apptDocs, callLogSets };
}

function rescheduleRequest() {
  return new NextRequest("http://localhost/api/ava/tools", {
    method: "POST",
    body: JSON.stringify({
      agent_id: AGENT_ID,
      conversation_id: "conv_resched_1",
      caller_phone: "+447700900123",
      tool_name: "update_booking",
      parameters: { action: "reschedule", booking_id: OLD_BOOKING_ID, new_datetime: "2099-07-02T10:00:00.000Z" },
    }),
    headers: { "Content-Type": "application/json", authorization: `Bearer ${TOOLS_SECRET}` },
  });
}

function cancelRequest() {
  return new NextRequest("http://localhost/api/ava/tools", {
    method: "POST",
    body: JSON.stringify({
      agent_id: AGENT_ID,
      conversation_id: "conv_cancel_1",
      caller_phone: "+447700900123",
      tool_name: "update_booking",
      parameters: { action: "cancel", booking_id: OLD_BOOKING_ID },
    }),
    headers: { "Content-Type": "application/json", authorization: `Bearer ${TOOLS_SECRET}` },
  });
}

describe("POST /api/ava/tools — reschedule is a saga (new before cancel)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVA_ENGINE_URL;
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("does NOT cancel the existing appointment when booking the new slot fails", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const updateAppointmentStatus = vi.fn().mockResolvedValue(undefined);
    const createAppointment = vi.fn().mockRejectedValue(new Error("PMS create failed"));
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      createAppointment,
      updateAppointmentStatus,
    } as never);

    const { POST } = await import("../route");
    const res = await POST(rescheduleRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    // New booking was attempted...
    expect(createAppointment).toHaveBeenCalledTimes(1);
    // ...and FAILED, so the old appointment must be left intact — never cancelled.
    expect(updateAppointmentStatus).not.toHaveBeenCalled();
    expect(data.response).toMatch(/trouble|sort this|someone/i);
  });

  it("on a successful reschedule, books the new slot BEFORE cancelling the old one", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const callOrder: string[] = [];
    const updateAppointmentStatus = vi.fn(async () => { callOrder.push("cancel"); });
    const createAppointment = vi.fn(async () => { callOrder.push("create"); return { externalId: "appt_new_1" }; });
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      createAppointment,
      updateAppointmentStatus,
    } as never);

    const { POST } = await import("../route");
    const res = await POST(rescheduleRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(callOrder).toEqual(["create", "cancel"]);
    expect(data.response).toMatch(/moved|confirmation text/i);
  });
});

describe("POST /api/ava/tools — reschedule idempotency claim (harness HIGH #3)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVA_ENGINE_URL;
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("does NOT create a second appointment when the same reschedule is retried (idempotency claim)", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const createAppointment = vi.fn(async () => ({ externalId: "appt_new_1" }));
    const updateAppointmentStatus = vi.fn().mockResolvedValue(undefined);
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      createAppointment,
      updateAppointmentStatus,
    } as never);

    const { POST } = await import("../route");
    // First reschedule wins the claim and creates the new slot.
    const res1 = await POST(rescheduleRequest());
    expect(res1.status).toBe(200);
    // A retried webhook (same conversation, booking, new time) must short-circuit
    // on the existing claim — never create a SECOND appointment on the new slot.
    const res2 = await POST(rescheduleRequest());
    expect(res2.status).toBe(200);

    expect(createAppointment).toHaveBeenCalledTimes(1);
  });

  it("writes a durable call_log.bookingExternalId marker on a successful reschedule", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db, callLogSets } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const createAppointment = vi.fn(async () => ({ externalId: "appt_new_99" }));
    const updateAppointmentStatus = vi.fn().mockResolvedValue(undefined);
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      createAppointment,
      updateAppointmentStatus,
    } as never);

    const { POST } = await import("../route");
    const res = await POST(rescheduleRequest());
    expect(res.status).toBe(200);

    // The post-call webhook reads `existing.bookingExternalId` to lock the
    // "booked" outcome — a reschedule must leave that marker just like a book.
    const marker = callLogSets.find(
      (d) => (d as Record<string, unknown>).bookingExternalId === "appt_new_99",
    );
    expect(marker).toBeDefined();
  });
});

describe("POST /api/ava/tools — cancel writes a durable call_log marker (harness HIGH #4)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVA_ENGINE_URL;
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("stamps cancelledAt + cancellationExternalId on the call_log doc when a cancel succeeds", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db, callLogSets } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const updateAppointmentStatus = vi.fn().mockResolvedValue(undefined);
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      createAppointment: vi.fn(),
      updateAppointmentStatus,
    } as never);

    const { POST } = await import("../route");
    const res = await POST(cancelRequest());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.response).toMatch(/cancelled/i);

    // Without the marker the webhook can't tell a confirmed cancel from a chat
    // that resolved itself, so Pulse never chases the freed slot.
    const marker = callLogSets.find((d) => {
      const r = d as Record<string, unknown>;
      return typeof r.cancelledAt === "string" && r.cancellationExternalId === OLD_BOOKING_ID;
    });
    expect(marker).toBeDefined();
  });
});
