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

  const db = {
    collection: vi.fn((name: string) => {
      if (name === "_") return { doc: vi.fn().mockReturnValue({ id: "generated_id" }) };
      return clinicsColRef;
    }),
  };
  return { db, apptDocs };
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
