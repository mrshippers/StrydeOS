/**
 * The PRODUCTION booking path is the Python engine (AVA_ENGINE_URL set). It must
 * leave the same durable booking marker the TS path does, or the post-call
 * webhook's outcome-lock + appointmentExternalId emission are silently bypassed
 * on the live path.
 *
 * Bug (harness HIGH, #3 portion): on an engine booking success the route settles
 * the idempotency claim with engineResult.booking_id but never writes a
 * top-level bookingExternalId to the call_log doc — so the webhook can't read it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/request-logger", () => ({ withRequestLog: (fn: unknown) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: vi.fn() }));
vi.mock("@/lib/integrations/pms/factory", () => ({ createPMSAdapter: vi.fn() }));
vi.mock("@/lib/ava/engine-proxy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ava/engine-proxy")>("@/lib/ava/engine-proxy");
  return { ...actual, proxyToEngine: vi.fn() };
});

const AGENT_ID = "agent_spires_001";
const CLINIC_ID = "clinic_001";
const TOOLS_SECRET = "test_tools_secret";
const CONV_ID = "conv_engine_1";
const ENGINE_BOOKING_ID = "ENG_appt_42";

function makeDb() {
  const callLogSets: Record<string, unknown>[] = [];
  const callLogDocRef = {
    get: vi.fn().mockResolvedValue({ data: () => ({}) }),
    set: vi.fn(async (data: Record<string, unknown>) => { callLogSets.push(data); }),
  };
  const callLogColRef = { doc: vi.fn().mockReturnValue(callLogDocRef) };

  const pmsConfigDoc = { data: vi.fn().mockReturnValue({ provider: "writeupp", apiKey: "wukey" }) };

  // Booking idempotency claim store (real claimBooking/settleBooking run against this).
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
      if (name === "call_log") return callLogColRef;
      if (name === "_ava_booking_claims") return claimsColRef;
      return { doc: vi.fn().mockReturnValue({ set: vi.fn(), get: vi.fn(), update: vi.fn() }) };
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
      parameters: { slot_datetime: "2099-07-01T14:00:00.000Z", patient_phone: "+447700900123" },
    }),
    headers: { "Content-Type": "application/json", authorization: `Bearer ${TOOLS_SECRET}` },
  });
}

describe("POST /api/ava/tools — engine booking writes the durable call_log marker", () => {
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

  it("stamps bookingExternalId on call_log when the engine books successfully", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { db, callLogSets } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const { proxyToEngine } = await import("@/lib/ava/engine-proxy");
    vi.mocked(proxyToEngine).mockResolvedValue({
      result: "All booked in for Wednesday at 2pm.",
      booking_id: ENGINE_BOOKING_ID,
    } as never);

    const { POST } = await import("../route");
    const res = await POST(bookingRequest());
    expect(res.status).toBe(200);

    const marker = callLogSets.find(
      (d) => (d as Record<string, unknown>).bookingExternalId === ENGINE_BOOKING_ID,
    );
    expect(marker).toBeDefined();
  });
});
