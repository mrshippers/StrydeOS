import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Env ─────────────────────────────────────────────────────────────────────

process.env.TWILIO_AUTH_TOKEN = "test-twilio-token";
process.env.NEXT_PUBLIC_APP_URL = "https://portal.strydeos.com";

// ─── twilio mock ──────────────────────────────────────────────────────────────
// validateRequest is forced true by default so we exercise the routing logic;
// individual tests can flip it to false to assert the 403 path.

const mockValidateRequest = vi.fn(() => true);

vi.mock("twilio", () => ({
  default: {
    validateRequest: (...args: unknown[]) => mockValidateRequest(...args),
  },
}));

// ─── Firestore mock ───────────────────────────────────────────────────────────

const firestoreStore: Record<string, Record<string, unknown>> = {};

const mockDb = {
  collection: vi.fn((name: string) => ({
    doc: (id: string) => ({
      get: vi.fn(async () => {
        const data = firestoreStore[`${name}/${id}`];
        return { exists: !!data, id, data: () => data ?? undefined };
      }),
    }),
  })),
};

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => mockDb,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(clinicId: string, body = "CallSid=CA123&From=%2B447000000000") {
  return new NextRequest(
    `http://localhost/api/ava/inbound-call?clinicId=${clinicId}`,
    {
      method: "POST",
      headers: {
        "x-twilio-signature": "sig",
        "x-forwarded-host": "portal.strydeos.com",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
}

function seedClinic(clinicId: string, ava: Record<string, unknown>) {
  firestoreStore[`clinics/${clinicId}`] = { ava };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/ava/inbound-call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(firestoreStore).forEach((k) => delete firestoreStore[k]);
    mockValidateRequest.mockReturnValue(true);
  });

  it("dials Ava via SIP when the clinic is enabled", async () => {
    seedClinic("clinic-spires", { agent_id: "agent_abc", enabled: true });

    const { POST } = await import("../route");
    const res = await POST(makeRequest("clinic-spires"));
    const xml = await res.text();

    expect(res.status).toBe(200);
    expect(xml).toContain("<Dial>");
    expect(xml).toContain("sip:agent_abc@sip.rtc.elevenlabs.io");
    expect(xml).not.toContain("<Record");
  });

  it("returns voicemail (non-Ava) TwiML when the clinic is PAUSED", async () => {
    seedClinic("clinic-spires", { agent_id: "agent_abc", enabled: false });

    const { POST } = await import("../route");
    const res = await POST(makeRequest("clinic-spires"));
    const xml = await res.text();

    expect(res.status).toBe(200);
    // Paused: no SIP dial to Ava, a voicemail Record instead.
    expect(xml).not.toContain("<Dial>");
    expect(xml).not.toContain("sip.rtc.elevenlabs.io");
    expect(xml).toContain("<Record");
    expect(xml).toMatch(/currently closed/i);
  });

  it("treats a missing enabled flag as paused (fails safe to voicemail)", async () => {
    seedClinic("clinic-spires", { agent_id: "agent_abc" });

    const { POST } = await import("../route");
    const res = await POST(makeRequest("clinic-spires"));
    const xml = await res.text();

    expect(xml).not.toContain("<Dial>");
    expect(xml).toContain("<Record");
  });

  it("returns 403 when the Twilio signature is invalid", async () => {
    mockValidateRequest.mockReturnValue(false);
    seedClinic("clinic-spires", { agent_id: "agent_abc", enabled: true });

    const { POST } = await import("../route");
    const res = await POST(makeRequest("clinic-spires"));

    expect(res.status).toBe(403);
  });

  it("validates against the x-forwarded-host Twilio signed (P0-7)", async () => {
    seedClinic("clinic-spires", { agent_id: "agent_abc", enabled: true });

    const { POST } = await import("../route");
    await POST(makeRequest("clinic-spires"));

    // The canonical URL passed to validateRequest must use the forwarded host,
    // not an internal localhost host.
    const [, , canonicalUrl] = mockValidateRequest.mock.calls[0] as unknown as string[];
    expect(canonicalUrl).toContain("https://portal.strydeos.com/api/ava/inbound-call");
  });
});
