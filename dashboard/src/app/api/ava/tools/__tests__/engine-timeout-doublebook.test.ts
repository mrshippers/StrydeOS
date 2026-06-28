/**
 * FIX 1 (harness HIGH): an engine TIMEOUT must not become a double-book.
 *
 * proxyToEngine returns a distinct ENGINE_TIMEOUT sentinel when the live-call
 * abort fires AFTER the engine may already have committed the PMS booking. For a
 * booking the route must then HOLD (leave the claim pending, return a safe line)
 * rather than release the claim and let the TS fallback create a SECOND real
 * appointment. A hard failure (null) still releases + falls back; a non-booking
 * timeout is side-effect-free and falls back.
 *
 * FIX 7 (harness HIGH): a successful engine booking must ALWAYS leave a
 * bookingExternalId marker, even when the engine returns an empty/absent
 * booking_id (cliniko.py coalesces a missing id to "").
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/request-logger", () => ({ withRequestLog: (fn: unknown) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: vi.fn() }));
vi.mock("@/lib/integrations/pms/factory", () => ({ createPMSAdapter: vi.fn() }));
// Keep the real ENGINE_TIMEOUT symbol + claim primitives; mock only proxyToEngine
// so the route's `=== ENGINE_TIMEOUT` identity comparison still holds.
vi.mock("@/lib/ava/engine-proxy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ava/engine-proxy")>("@/lib/ava/engine-proxy");
  return { ...actual, proxyToEngine: vi.fn() };
});

const AGENT_ID = "agent_spires_001";
const CLINIC_ID = "clinic_001";
const TOOLS_SECRET = "test_tools_secret";

/** Stateful Firestore mock: real claim primitives run against claimStore. */
function makeDb() {
  const callLogSets: Record<string, unknown>[] = [];
  const callLogDocRef = {
    get: vi.fn().mockResolvedValue({ data: () => ({}) }),
    set: vi.fn(async (d: Record<string, unknown>) => { callLogSets.push(d); }),
  };
  const callLogColRef = { doc: vi.fn().mockReturnValue(callLogDocRef) };

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
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "_") return { doc: vi.fn().mockReturnValue({ id: "generated_id" }) };
      return clinicsColRef;
    }),
  };
  return { db, callLogSets, claimStore };
}

function makeRequest(toolName: string, params: Record<string, unknown>, convId = "conv_to_1") {
  return new NextRequest("http://localhost/api/ava/tools", {
    method: "POST",
    body: JSON.stringify({
      agent_id: AGENT_ID,
      conversation_id: convId,
      caller_phone: "+447700900123",
      tool_name: toolName,
      parameters: params,
    }),
    headers: { "Content-Type": "application/json", authorization: `Bearer ${TOOLS_SECRET}` },
  });
}

const BOOKING_PARAMS = {
  patient_first_name: "Jane",
  patient_last_name: "Doe",
  patient_phone: "+447700900123",
  slot_datetime: "2099-07-01T14:00:00.000Z",
  appointment_type: "initial_assessment",
};

describe("POST /api/ava/tools — engine timeout vs hard failure", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.AVA_ENGINE_URL = "http://localhost:8000";
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });
  afterEach(() => {
    delete process.env.AVA_ENGINE_URL;
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("(i) booking + ENGINE_TIMEOUT: holds — claim NOT released, no TS createAppointment, holding line returned", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db, claimStore } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { proxyToEngine, ENGINE_TIMEOUT } = await import("@/lib/ava/engine-proxy");
    vi.mocked(proxyToEngine).mockResolvedValue(ENGINE_TIMEOUT as never);

    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");

    const { POST } = await import("../route");
    const res = await POST(makeRequest("book_appointment", BOOKING_PARAMS));
    const data = await res.json();

    expect(res.status).toBe(200);
    // A guaranteed-safe holding line — never a fresh confirmation or failure.
    expect(data.response).toMatch(/going through|confirmation text/i);
    // The TS adapter must NOT have been reached — a second create would double-book.
    expect(vi.mocked(createPMSAdapter)).not.toHaveBeenCalled();
    // The claim is LEFT pending (the engine may well have booked), not released.
    expect(claimStore.size).toBe(1);
    const claim = [...claimStore.values()][0];
    expect(claim.status).toBe("pending");
  });

  it("(ii) booking + hard null: releases the claim and the TS path books exactly once", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { proxyToEngine } = await import("@/lib/ava/engine-proxy");
    vi.mocked(proxyToEngine).mockResolvedValue(null);

    const createAppointment = vi.fn().mockResolvedValue({ externalId: "appt_ext_1" });
    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      createAppointment,
      findPatientByPhone: vi.fn().mockResolvedValue(null),
      createPatient: vi.fn().mockResolvedValue({ externalId: "pat_ext_1" }),
    } as never);

    const { POST } = await import("../route");
    const res = await POST(makeRequest("book_appointment", BOOKING_PARAMS));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(createAppointment).toHaveBeenCalledTimes(1);
    expect(data.response).toMatch(/booked you in|set you up|welcome back/i);
  });

  it("(iii) non-booking + timeout: side-effect-free, falls through to the TS handler", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { proxyToEngine, ENGINE_TIMEOUT } = await import("@/lib/ava/engine-proxy");
    vi.mocked(proxyToEngine).mockResolvedValue(ENGINE_TIMEOUT as never);

    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
    } as never);

    const { POST } = await import("../route");
    const res = await POST(makeRequest("check_availability", { preferred_day: "Monday" }));

    expect(res.status).toBe(200);
    // A read-only tool can safely retry on the TS path.
    expect(vi.mocked(createPMSAdapter)).toHaveBeenCalled();
  });
});

describe("POST /api/ava/tools — engine booking marker with empty booking_id (FIX 7)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.AVA_ENGINE_URL = "http://localhost:8000";
    process.env.ELEVENLABS_WEBHOOK_SECRET = TOOLS_SECRET;
  });
  afterEach(() => {
    delete process.env.AVA_ENGINE_URL;
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("stamps a non-empty bookingExternalId even when the engine returns booking_id ''", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db, callLogSets } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { proxyToEngine } = await import("@/lib/ava/engine-proxy");
    vi.mocked(proxyToEngine).mockResolvedValue({
      result: "All booked in for Wednesday at 2pm.",
      booking_id: "",
    } as never);

    const { POST } = await import("../route");
    const res = await POST(makeRequest("book_appointment", BOOKING_PARAMS, "conv_empty_id"));
    expect(res.status).toBe(200);

    const marker = callLogSets.find(
      (d) => typeof (d as Record<string, unknown>).bookingExternalId === "string"
        && ((d as Record<string, unknown>).bookingExternalId as string).length > 0,
    );
    expect(marker).toBeDefined();
    // Stable fallback keyed on the conversation id.
    expect((marker as Record<string, unknown>).bookingExternalId).toBe("engine_conv_empty_id");
  });
});
