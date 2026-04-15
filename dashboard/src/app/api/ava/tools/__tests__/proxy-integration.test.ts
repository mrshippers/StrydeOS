/**
 * Tests for AVA_ENGINE_URL proxy integration in POST /api/ava/tools.
 *
 * Behaviour under test:
 *   1. AVA_ENGINE_URL set + engine responds  → return engine result directly, skip TS PMS
 *   2. AVA_ENGINE_URL set + engine returns null (timeout/error) → fall back to TS PMS handler
 *   3. AVA_ENGINE_URL not set                → use TS PMS handler directly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (fn: unknown) => fn,
}));

vi.mock("@/lib/ava/verify-signature", () => ({
  isWebhookSecretConfigured: vi.fn().mockReturnValue(true),
  verifyElevenLabsSignature: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/integrations/pms/factory", () => ({
  createPMSAdapter: vi.fn(),
}));

vi.mock("@/lib/ava/engine-proxy", () => ({
  proxyToEngine: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AGENT_ID = "agent_spires_001";
const CLINIC_ID = "clinic_001";

/** Build a minimal Firestore mock that resolves the clinic and PMS config. */
function makeDb(pmsConfig = { provider: "writeupp", apiKey: "wukey" }) {
  const callLogDoc = { get: vi.fn().mockResolvedValue({ data: () => ({ toolCalls: [] }) }) };
  const callLogColRef = {
    doc: vi.fn().mockReturnValue(callLogDoc),
    set: vi.fn().mockResolvedValue(undefined),
  };
  const pmsConfigDoc = { data: vi.fn().mockReturnValue(pmsConfig) };
  const clinicianSnap = { empty: true, docs: [] };
  const patientSnap = { empty: true, docs: [] };
  const apptColRef = { doc: vi.fn().mockReturnValue({ set: vi.fn().mockResolvedValue(undefined) }) };
  const patientsColRef = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(patientSnap),
    doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ exists: false }), set: vi.fn().mockResolvedValue(undefined) }),
  };
  const cliniciansColRef = {
    get: vi.fn().mockResolvedValue(clinicianSnap),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };

  const clinicDocRef = {
    collection: vi.fn((name: string) => {
      if (name === "integrations_config") return {
        doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(pmsConfigDoc) }),
      };
      if (name === "clinicians") return cliniciansColRef;
      if (name === "patients") return patientsColRef;
      if (name === "appointments") return apptColRef;
      if (name === "call_log") return callLogColRef;
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

  return { collection: vi.fn().mockReturnValue(clinicsColRef) };
}

function makeRequest(toolName = "check_availability", toolInput: Record<string, unknown> = {}) {
  const body = JSON.stringify({
    agent_id: AGENT_ID,
    conversation_id: "conv_001",
    tool_name: toolName,
    parameters: toolInput,
  });
  return new NextRequest("http://localhost/api/ava/tools", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "elevenlabs-signature": "v0=abc",
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AVA engine proxy — enabled", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.AVA_ENGINE_URL = "http://localhost:8000";
  });

  afterEach(() => {
    delete process.env.AVA_ENGINE_URL;
    vi.clearAllMocks();
  });

  it("returns the Python engine result directly when engine responds", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(makeDb() as never);

    const { proxyToEngine } = await import("@/lib/ava/engine-proxy");
    vi.mocked(proxyToEngine).mockResolvedValue({
      result: "Available: Monday 21 Apr at 2:00 PM",
      slots: ["2026-04-21T14:00:00"],
    });

    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");

    const { POST } = await import("../route");
    const res = await POST(makeRequest("check_availability"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.result).toBe("Available: Monday 21 Apr at 2:00 PM");
    // TypeScript PMS adapter should NOT have been instantiated
    expect(vi.mocked(createPMSAdapter)).not.toHaveBeenCalled();
  });

  it("calls proxyToEngine with correct payload including clinic_id and api_key", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(makeDb({ provider: "writeupp", apiKey: "secret_key" }) as never);

    const { proxyToEngine } = await import("@/lib/ava/engine-proxy");
    vi.mocked(proxyToEngine).mockResolvedValue({
      result: "ok",
      slots: [],
    });

    const { POST } = await import("../route");
    await POST(makeRequest("check_availability", { preferred_day: "Monday" }));

    expect(vi.mocked(proxyToEngine)).toHaveBeenCalledOnce();
    const [url, payload] = vi.mocked(proxyToEngine).mock.calls[0];
    expect(url).toBe("http://localhost:8000");
    expect(payload.clinic_id).toBe(CLINIC_ID);
    expect(payload.api_key).toBe("secret_key");
    expect(payload.tool_name).toBe("check_availability");
    expect(payload.pms_type).toBe("writeupp");
  });

  it("falls back to TypeScript PMS handler when engine returns null", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(makeDb() as never);

    const { proxyToEngine } = await import("@/lib/ava/engine-proxy");
    vi.mocked(proxyToEngine).mockResolvedValue(null);

    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      getPatient: vi.fn(),
    } as never);

    const { POST } = await import("../route");
    const res = await POST(makeRequest("check_availability"));
    const data = await res.json();

    expect(res.status).toBe(200);
    // Fell back to TS handler — PMS adapter was used
    expect(vi.mocked(createPMSAdapter)).toHaveBeenCalled();
    // Result should be the TS handler's fallback message
    expect(typeof data.result).toBe("string");
  });
});

describe("AVA engine proxy — disabled", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVA_ENGINE_URL;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses TypeScript PMS handler directly when AVA_ENGINE_URL is not set", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(makeDb() as never);

    const { proxyToEngine } = await import("@/lib/ava/engine-proxy");

    const { createPMSAdapter } = await import("@/lib/integrations/pms/factory");
    vi.mocked(createPMSAdapter).mockReturnValue({
      getAppointments: vi.fn().mockResolvedValue([]),
      getPatient: vi.fn(),
    } as never);

    const { POST } = await import("../route");
    const res = await POST(makeRequest("check_availability"));

    expect(res.status).toBe(200);
    // proxyToEngine should never be called if env var is absent
    expect(vi.mocked(proxyToEngine)).not.toHaveBeenCalled();
    // TS PMS adapter should have been used instead
    expect(vi.mocked(createPMSAdapter)).toHaveBeenCalled();
  });
});
