/**
 * Integration test for P0-1: POST /api/ava/tools book_appointment idempotency.
 *
 * The same conversation_id + slot + caller phone submitted twice must produce
 * exactly ONE PMS appointment (one createAppointment call). The second attempt
 * replays the prior confirmation instead of double-booking the patient.
 *
 * Exercises the TS-fallback booking path (AVA_ENGINE_URL unset).
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

/**
 * Firestore mock with a STATEFUL booking-claims subcollection so the second
 * create() on the same key throws ALREADY_EXISTS — modelling a real retry.
 */
function makeDb() {
  const claimStore = new Map<string, Record<string, unknown>>();

  const pmsConfigDoc = { data: vi.fn().mockReturnValue({ provider: "writeupp", apiKey: "wukey" }) };
  const patientSnap = { empty: true, docs: [] };

  const clinicianActiveSnap = {
    empty: false,
    docs: [{ id: "clin_1", data: () => ({ active: true, name: "Andrew", pmsExternalId: "ext_clin_1" }) }],
  };
  const cliniciansColRef = {
    get: vi.fn().mockResolvedValue({ docs: [] }),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  // .where(active).limit(1).get() → return an active clinician
  cliniciansColRef.get = vi.fn().mockResolvedValue(clinicianActiveSnap);

  const patientsColRef = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(patientSnap),
    doc: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({ exists: false }),
      set: vi.fn().mockResolvedValue(undefined),
    }),
  };
  const apptColRef = { doc: vi.fn().mockReturnValue({ set: vi.fn().mockResolvedValue(undefined) }) };
  const callLogColRef = { doc: vi.fn().mockReturnValue({ set: vi.fn().mockResolvedValue(undefined) }) };

  const claimDocRef = (key: string) => ({
    create: vi.fn(async (data: Record<string, unknown>) => {
      if (claimStore.has(key)) {
        const err = new Error("ALREADY_EXISTS") as Error & { code: number };
        err.code = 6;
        throw err;
      }
      claimStore.set(key, data);
    }),
    get: vi.fn(async () => ({ data: () => claimStore.get(key) })),
    set: vi.fn(async (data: Record<string, unknown>) => {
      claimStore.set(key, { ...(claimStore.get(key) ?? {}), ...data });
    }),
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
  const body = JSON.stringify({
    agent_id: AGENT_ID,
    conversation_id: "conv_dedup_1",
    caller_phone: "+447700900123",
    tool_name: "book_appointment",
    parameters: {
      patient_first_name: "Jane",
      patient_last_name: "Doe",
      patient_phone: "+447700900123",
      slot_datetime: "2099-07-01T14:00:00.000Z",
      appointment_type: "initial_assessment",
    },
  });
  return new NextRequest("http://localhost/api/ava/tools", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", authorization: `Bearer ${TOOLS_SECRET}` },
  });
}

describe("POST /api/ava/tools — booking idempotency (TS path)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVA_ENGINE_URL;
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("books exactly once when the same conversation+slot+phone is submitted twice", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const db = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const createAppointment = vi
      .fn()
      .mockResolvedValue({ externalId: "appt_ext_1" });
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      createAppointment,
      findPatientByPhone: vi.fn().mockResolvedValue(null),
      createPatient: vi.fn().mockResolvedValue({ externalId: "pat_ext_1" }),
    } as never);

    const { POST } = await import("../route");

    const res1 = await POST(bookingRequest());
    const data1 = await res1.json();
    const res2 = await POST(bookingRequest());
    const data2 = await res2.json();

    // Exactly ONE PMS write across both identical submissions.
    expect(createAppointment).toHaveBeenCalledTimes(1);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // The duplicate replays the original confirmation.
    expect(data2.response).toBe(data1.response);
  });
});
