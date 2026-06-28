/**
 * A successful reschedule must not be reported as a failure — nor double-booked
 * on retry — when a post-write bookkeeping step throws.
 *
 * Second-order gap (harness re-run HIGH): handleUpdateBooking's reschedule Phase 2
 * awaited the NEW-appointment Firestore mirror `.set` with NO try/catch. Once
 * createAppointment has succeeded the reschedule is authoritative, but a transient
 * Firestore error on that mirror threw out of the handler, so the caller heard the
 * generic trouble script (a committed reschedule reported as a failure), the
 * old-slot cancel was skipped, and the idempotency claim was never settled —
 * leaving it 'pending' so a retry could double-book (new PMS appt exists, old
 * never cancelled).
 *
 * Correct behaviour mirrors handleBookAppointment's Step 2: once createAppointment
 * succeeds the new-appointment mirror is best-effort (logged, swallowed), the
 * old-slot cancel is still attempted, the claim is SETTLED, and the caller hears
 * the "moved" confirmation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/request-logger", () => ({ withRequestLog: (fn: unknown) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: vi.fn() }));
vi.mock("@/lib/integrations/pms/factory", () => ({ createPMSAdapter: vi.fn() }));

const AGENT_ID = "agent_spires_001";
const CLINIC_ID = "clinic_001";
const TOOLS_SECRET = "test_tools_secret";
const OLD_BOOKING_ID = "appt_old_1";
const NEW_APPT_ID = "appt_new_1";

function makeDb() {
  const apptDocs = new Map<string, Record<string, unknown>>([
    [OLD_BOOKING_ID, { clinicianId: "ext_clin_1", patientId: "pat_1", appointmentType: "follow_up" }],
  ]);
  // The NEW-appointment mirror `.set` REJECTS — modelling a transient Firestore
  // outage that lands AFTER the replacement PMS appointment is already created.
  // Every other appointment write (the old-slot cancel update) still resolves.
  const apptDocRef = (id: string) => ({
    get: vi.fn(async () => ({ exists: apptDocs.has(id), data: () => apptDocs.get(id) })),
    set: vi.fn(async (d: Record<string, unknown>) => {
      if (id === NEW_APPT_ID) throw new Error("firestore unavailable");
      apptDocs.set(id, { ...(apptDocs.get(id) ?? {}), ...d });
    }),
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

  const callLogSets: Record<string, unknown>[] = [];
  const callLogDocRef = {
    set: vi.fn(async (d: Record<string, unknown>) => { callLogSets.push(d); }),
  };
  const callLogColRef = { doc: vi.fn().mockReturnValue(callLogDocRef) };

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
      conversation_id: "conv_resched_pw_1",
      caller_phone: "+447700900123",
      tool_name: "update_booking",
      parameters: { action: "reschedule", booking_id: OLD_BOOKING_ID, new_datetime: "2099-07-02T10:00:00.000Z" },
    }),
    headers: { "Content-Type": "application/json", authorization: `Bearer ${TOOLS_SECRET}` },
  });
}

describe("POST /api/ava/tools — reschedule survives a new-appointment mirror failure", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVA_ENGINE_URL;
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("confirms the move, still cancels the old slot, and does NOT double-book on retry when the new-appointment Firestore mirror fails after the PMS write", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const createAppointment = vi.fn(async () => ({ externalId: NEW_APPT_ID }));
    const updateAppointmentStatus = vi.fn().mockResolvedValue(undefined);
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      createAppointment,
      updateAppointmentStatus,
    } as never);

    const { POST } = await import("../route");

    // First attempt: PMS create succeeds, the new-appointment mirror throws.
    const res1 = await POST(rescheduleRequest());
    const data1 = await res1.json();
    expect(res1.status).toBe(200);
    // (a) The caller hears the SUCCESS confirmation, not the trouble script.
    expect(data1.response).toMatch(/moved|confirmation text/i);
    expect(data1.response).not.toMatch(/trouble|sort this/i);
    // (b) The old slot is still cancelled despite the mirror failure.
    expect(updateAppointmentStatus).toHaveBeenCalledWith(OLD_BOOKING_ID, "cancelled");

    // (c) Retry the identical reschedule: the claim must have been SETTLED (not
    // left pending), so no second replacement appointment is created.
    const res2 = await POST(rescheduleRequest());
    expect(res2.status).toBe(200);
    expect(createAppointment).toHaveBeenCalledTimes(1);
  });
});
