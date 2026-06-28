/**
 * Booking → post-call handoff: the live tool must leave a DURABLE marker.
 *
 * The real PMS appointment id is created here, on the live-call path
 * (handleBookAppointment → pmsResult.externalId). The post-call webhook
 * (/api/webhooks/elevenlabs) runs LATER and needs that id to (a) emit
 * appointmentExternalId on the Intelligence call_fact and (b) protect the
 * "booked" outcome from being downgraded by the LLM summary classifier.
 *
 * The arrayUnion `toolCalls` entry is not enough — it's an opaque array the
 * webhook can't cheaply read. The booking path must also write a TOP-LEVEL
 * `bookingExternalId` field on the call_log doc so the webhook can read it
 * straight off `existing`.
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
const CONV_ID = "conv_marker_1";
const PMS_APPT_ID = "appt_PMS_777";

/** Records every set() applied to the call_log/{CONV_ID} doc for assertion. */
function makeDb() {
  const callLogSets: Record<string, unknown>[] = [];

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

  const callLogDocRef = {
    set: vi.fn(async (data: Record<string, unknown>) => {
      callLogSets.push(data);
    }),
  };
  const callLogColRef = { doc: vi.fn().mockReturnValue(callLogDocRef) };

  const claimStore = new Map<string, Record<string, unknown>>();
  const claimDocRef = (key: string) => ({
    create: vi.fn(async (data: Record<string, unknown>) => {
      if (claimStore.has(key)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
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

  const db = {
    collection: vi.fn((name: string) => {
      if (name === "_") return { doc: vi.fn().mockReturnValue({ id: "generated_id" }) };
      return clinicsColRef;
    }),
  };
  return { db, callLogSets };
}

function bookingRequest() {
  return new NextRequest("http://localhost/api/ava/tools", {
    method: "POST",
    body: JSON.stringify({
      agent_id: AGENT_ID,
      conversation_id: CONV_ID,
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

describe("POST /api/ava/tools — durable booking marker on call_log", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVA_ENGINE_URL;
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("writes the PMS appointment id as a top-level bookingExternalId on the call_log doc", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db, callLogSets } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      createAppointment: vi.fn().mockResolvedValue({ externalId: PMS_APPT_ID }),
      findPatientByPhone: vi.fn().mockResolvedValue(null),
      createPatient: vi.fn().mockResolvedValue({ externalId: "pat_ext_1" }),
    } as never);

    const { POST } = await import("../route");
    const res = await POST(bookingRequest());
    expect(res.status).toBe(200);

    // The webhook reads `existing.bookingExternalId` straight off the doc — so a
    // top-level field (not just the opaque toolCalls array) is required.
    const markerWrite = callLogSets.find(
      (d) => (d as Record<string, unknown>).bookingExternalId === PMS_APPT_ID,
    );
    expect(markerWrite).toBeDefined();
  });
});
