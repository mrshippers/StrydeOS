/**
 * FIX 6 (harness HIGH): TOCTOU — re-validate the slot immediately before the
 * write.
 *
 * Between check_availability offering a slot and the booking write there is a
 * gap. The idempotency claim is per conversation+slot+caller, so it does NOT
 * stop a DIFFERENT caller (or a direct PMS booking) from taking the slot in the
 * interim. handleBookAppointment (and reschedule Phase 2) must re-query the
 * diary for the target clinician/slot and, if it is no longer free, NOT create —
 * returning a graceful "just taken" script instead.
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
const SLOT = "2099-07-01T14:00:00.000Z";
const SLOT_END = "2099-07-01T14:45:00.000Z";

/** Booking-path Firestore mock (claims + clinicians + patients + call_log). */
function makeBookingDb() {
  const claimStore = new Map<string, Record<string, unknown>>();
  const pmsConfigDoc = { data: vi.fn().mockReturnValue({ provider: "writeupp", apiKey: "wukey" }) };

  const clinicianActiveSnap = {
    empty: false,
    docs: [{ id: "clin_1", data: () => ({ active: true, name: "Andrew", pmsExternalId: "ext_clin_1" }) }],
  };
  const cliniciansColRef = {
    get: vi.fn().mockResolvedValue(clinicianActiveSnap),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  const patientsColRef = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    doc: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({ exists: false }),
      set: vi.fn().mockResolvedValue(undefined),
    }),
  };
  const apptColRef = { doc: vi.fn().mockReturnValue({ set: vi.fn().mockResolvedValue(undefined) }) };
  const callLogColRef = { doc: vi.fn().mockReturnValue({ set: vi.fn().mockResolvedValue(undefined) }) };

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
  const claimsColRef = { doc: vi.fn((key: string) => {
    if (!claimRefs.has(key)) claimRefs.set(key, claimDocRef(key));
    return claimRefs.get(key)!;
  }) };

  const clinicDocRef = {
    collection: vi.fn((name: string) => {
      if (name === "integrations_config")
        return { doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(pmsConfigDoc) }) };
      if (name === "clinicians") return cliniciansColRef;
      if (name === "patients") return patientsColRef;
      if (name === "appointments") return apptColRef;
      if (name === "call_log") return callLogColRef;
      if (name === "_ava_booking_claims") return claimsColRef;
      return {};
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
  return {
    collection: vi.fn((name: string) => {
      if (name === "_") return { doc: vi.fn().mockReturnValue({ id: "generated_id" }) };
      return clinicsColRef;
    }),
  };
}

function bookingRequest() {
  return new NextRequest("http://localhost/api/ava/tools", {
    method: "POST",
    body: JSON.stringify({
      agent_id: AGENT_ID,
      conversation_id: "conv_toctou_1",
      caller_phone: "+447700900123",
      tool_name: "book_appointment",
      parameters: {
        patient_first_name: "Jane",
        patient_last_name: "Doe",
        patient_phone: "+447700900123",
        slot_datetime: SLOT,
        appointment_type: "initial_assessment",
      },
    }),
    headers: { "Content-Type": "application/json", authorization: `Bearer ${TOOLS_SECRET}` },
  });
}

describe("POST /api/ava/tools — slot re-validation before booking write", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVA_ENGINE_URL;
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("does NOT create when the slot was taken in the interim, and returns a 'just taken' script", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(makeBookingDb() as never);

    const createAppointment = vi.fn().mockResolvedValue({ externalId: "appt_ext_1" });
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      // The re-check finds an appointment overlapping the requested slot.
      getAppointments: vi.fn().mockResolvedValue([
        { externalId: "other_1", dateTime: SLOT, endTime: SLOT_END, status: "scheduled" },
      ]),
      createAppointment,
      findPatientByPhone: vi.fn().mockResolvedValue(null),
      createPatient: vi.fn().mockResolvedValue({ externalId: "pat_ext_1" }),
    } as never);

    const { POST } = await import("../route");
    const res = await POST(bookingRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(createAppointment).not.toHaveBeenCalled();
    expect(data.response).toMatch(/just been taken|just taken|taken/i);
  });

  it("still books on the happy path (re-check returns no overlapping appointment)", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(makeBookingDb() as never);

    const createAppointment = vi.fn().mockResolvedValue({ externalId: "appt_ext_1" });
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      createAppointment,
      findPatientByPhone: vi.fn().mockResolvedValue(null),
      createPatient: vi.fn().mockResolvedValue({ externalId: "pat_ext_1" }),
    } as never);

    const { POST } = await import("../route");
    const res = await POST(bookingRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(createAppointment).toHaveBeenCalledTimes(1);
    expect(data.response).toMatch(/booked you in|set you up|welcome back/i);
  });
});

// ─── Reschedule Phase 2 ───────────────────────────────────────────────────────

function makeRescheduleDb() {
  const apptDocs = new Map<string, Record<string, unknown>>([
    [OLD_BOOKING_ID, { clinicianId: "ext_clin_1", patientId: "pat_1", appointmentType: "follow_up" }],
  ]);
  const apptDocRef = (id: string) => ({
    get: vi.fn(async () => ({ exists: apptDocs.has(id), data: () => apptDocs.get(id) })),
    set: vi.fn(async (d: Record<string, unknown>) => { apptDocs.set(id, { ...(apptDocs.get(id) ?? {}), ...d }); }),
    update: vi.fn(async (d: Record<string, unknown>) => { apptDocs.set(id, { ...(apptDocs.get(id) ?? {}), ...d }); }),
  });
  const apptRefs = new Map<string, ReturnType<typeof apptDocRef>>();
  const apptColRef = { doc: vi.fn((id: string) => {
    if (!apptRefs.has(id)) apptRefs.set(id, apptDocRef(id));
    return apptRefs.get(id)!;
  }) };
  const cliniciansColRef = {
    get: vi.fn().mockResolvedValue({
      docs: [{ id: "clin_1", data: () => ({ name: "Andrew", pmsExternalId: "ext_clin_1" }) }],
    }),
  };
  const pmsConfigDoc = { data: vi.fn().mockReturnValue({ provider: "writeupp", apiKey: "wukey" }) };
  const clinicDocRef = {
    collection: vi.fn((name: string) => {
      if (name === "integrations_config")
        return { doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(pmsConfigDoc) }) };
      if (name === "clinicians") return cliniciansColRef;
      if (name === "appointments") return apptColRef;
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
  return {
    collection: vi.fn((name: string) => {
      if (name === "_") return { doc: vi.fn().mockReturnValue({ id: "generated_id" }) };
      return clinicsColRef;
    }),
  };
}

function rescheduleRequest() {
  return new NextRequest("http://localhost/api/ava/tools", {
    method: "POST",
    body: JSON.stringify({
      agent_id: AGENT_ID,
      conversation_id: "conv_resched_toctou",
      caller_phone: "+447700900123",
      tool_name: "update_booking",
      parameters: { action: "reschedule", booking_id: OLD_BOOKING_ID, new_datetime: SLOT },
    }),
    headers: { "Content-Type": "application/json", authorization: `Bearer ${TOOLS_SECRET}` },
  });
}

describe("POST /api/ava/tools — slot re-validation before reschedule write", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVA_ENGINE_URL;
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("does NOT create the new slot and never cancels the old one when the target slot was just taken", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(makeRescheduleDb() as never);

    const updateAppointmentStatus = vi.fn().mockResolvedValue(undefined);
    const createAppointment = vi.fn().mockResolvedValue({ externalId: "appt_new_1" });
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([
        { externalId: "other_1", dateTime: SLOT, endTime: SLOT_END, status: "scheduled" },
      ]),
      createAppointment,
      updateAppointmentStatus,
    } as never);

    const { POST } = await import("../route");
    const res = await POST(rescheduleRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(createAppointment).not.toHaveBeenCalled();
    expect(updateAppointmentStatus).not.toHaveBeenCalled();
    expect(data.response).toMatch(/just been taken|just taken|taken/i);
  });
});
