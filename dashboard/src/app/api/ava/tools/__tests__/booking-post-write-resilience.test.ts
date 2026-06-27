/**
 * A successful PMS booking must not be reported as a failure — nor double-booked
 * on retry — when a post-write bookkeeping step throws.
 *
 * Bug (harness HIGH): handleBookAppointment wrapped the PMS createAppointment AND
 * the post-write steps (Firestore mirror, patient doc, call_log, settleBooking)
 * in ONE try. If a post-write step threw AFTER the PMS appointment was created,
 * the single catch released the idempotency claim and returned a booking-FAILURE
 * script. So: the patient is booked but told it failed, and because the claim was
 * released, the ElevenLabs retry books a SECOND appointment.
 *
 * Correct behaviour: once createAppointment succeeds the booking is authoritative.
 * Post-write failures are best-effort (logged, swallowed), the caller still hears
 * the confirmation, and the claim is SETTLED so a retry replays it instead of
 * re-booking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/request-logger", () => ({ withRequestLog: (fn: unknown) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: vi.fn() }));
vi.mock("@/lib/integrations/pms/factory", () => ({ createPMSAdapter: vi.fn() }));

const AGENT_ID = "agent_spires_001";
const CLINIC_ID = "clinic_001";
const TOOLS_SECRET = "test_tools_secret";

function makeDb() {
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
  // The post-write Firestore mirror REJECTS — modelling a transient Firestore
  // outage that lands AFTER the PMS appointment is already created.
  const apptColRef = {
    doc: vi.fn().mockReturnValue({ set: vi.fn().mockRejectedValue(new Error("firestore unavailable")) }),
  };
  const callLogColRef = { doc: vi.fn().mockReturnValue({ set: vi.fn().mockResolvedValue(undefined) }) };

  const claimDocRef = (key: string) => ({
    create: vi.fn(async (data: Record<string, unknown>) => {
      if (claimStore.has(key)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
      claimStore.set(key, data);
    }),
    get: vi.fn(async () => ({ data: () => claimStore.get(key) })),
    set: vi.fn(async (data: Record<string, unknown>) => { claimStore.set(key, { ...(claimStore.get(key) ?? {}), ...data }); }),
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
      conversation_id: "conv_pw_1",
      caller_phone: "+447700900123",
      tool_name: "book_appointment",
      parameters: {
        patient_first_name: "Jane",
        patient_last_name: "Doe",
        patient_phone: "+447700900123",
        slot_datetime: "2099-07-01T14:00:00.000Z",
        appointment_type: "initial_assessment",
      },
    }),
    headers: { "Content-Type": "application/json", authorization: `Bearer ${TOOLS_SECRET}` },
  });
}

describe("POST /api/ava/tools — booking survives a post-write failure", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVA_ENGINE_URL;
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("confirms the booking and does NOT double-book on retry when the Firestore mirror fails after the PMS write", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const db = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const createAppointment = vi.fn().mockResolvedValue({ externalId: "appt_ext_1" });
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      createAppointment,
      findPatientByPhone: vi.fn().mockResolvedValue(null),
      createPatient: vi.fn().mockResolvedValue({ externalId: "pat_ext_1" }),
    } as never);

    const { POST } = await import("../route");

    // First attempt: PMS write succeeds, Firestore mirror throws.
    const res1 = await POST(bookingRequest());
    const data1 = await res1.json();
    expect(res1.status).toBe(200);
    // The caller hears a SUCCESS confirmation, not the booking-system-failure script.
    expect(data1.response).toMatch(/booked you in|set you up|welcome back/i);
    expect(data1.response).not.toMatch(/trouble with the booking system/i);

    // Retry the identical request: the claim must have been SETTLED (not
    // released), so no second PMS appointment is created.
    const res2 = await POST(bookingRequest());
    expect(res2.status).toBe(200);
    expect(createAppointment).toHaveBeenCalledTimes(1);
  });
});
