import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Env ─────────────────────────────────────────────────────────────────────

process.env.ELEVENLABS_API_KEY = "el-test-key";

// ─── Firestore mock ───────────────────────────────────────────────────────────

const firestoreStore: Record<string, Record<string, unknown>> = {};
const updateCalls: Array<{ path: string; data: Record<string, unknown> }> = [];

function makeMockDocRef(collectionPath: string, docId: string) {
  const fullPath = `${collectionPath}/${docId}`;
  return {
    id: docId,
    get: vi.fn(async () => {
      const data = firestoreStore[fullPath];
      return { exists: !!data, id: docId, data: () => data ?? undefined };
    }),
    update: vi.fn(async (data: Record<string, unknown>) => {
      firestoreStore[fullPath] = { ...(firestoreStore[fullPath] ?? {}), ...data };
      updateCalls.push({ path: fullPath, data });
    }),
  };
}

const mockDb = {
  collection: vi.fn((name: string) => ({
    doc: (id: string) => makeMockDocRef(name, id),
  })),
};

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => mockDb,
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockVerifyApiRequest = vi.fn();
const mockRequireRole = vi.fn();

vi.mock("@/lib/auth-guard", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/auth-guard")>();
  return {
    ...orig,
    verifyApiRequest: (...args: unknown[]) => mockVerifyApiRequest(...args),
    requireRole: (...args: unknown[]) => mockRequireRole(...args),
    handleApiError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
});

// ─── ElevenLabs mock ──────────────────────────────────────────────────────────

const mockSetPhoneNumberAgent = vi.fn();

vi.mock("@/lib/ava/elevenlabs-agent", () => ({
  setPhoneNumberAgent: (...args: unknown[]) => mockSetPhoneNumberAgent(...args),
}));

// ─── request-logger passthrough ───────────────────────────────────────────────

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (handler: unknown) => handler,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest() {
  return new NextRequest("http://localhost/api/ava/toggle", { method: "POST" });
}

function seedClinic(clinicId: string, avaData: Record<string, unknown>) {
  firestoreStore[`clinics/${clinicId}`] = { ava: avaData };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/ava/toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(firestoreStore).forEach((k) => delete firestoreStore[k]);
    updateCalls.length = 0;

    mockSetPhoneNumberAgent.mockResolvedValue(undefined);
    mockVerifyApiRequest.mockResolvedValue({
      uid: "user1",
      email: "owner@spires.com",
      clinicId: "clinic-spires",
      role: "owner",
    });
    mockRequireRole.mockReturnValue(undefined);
  });

  it("activates Ava: attaches agent to phone number and sets enabled=true", async () => {
    seedClinic("clinic-spires", {
      enabled: false,
      agent_id: "agent_abc",
      phone_number_id: "phnum_xyz",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.enabled).toBe(true);

    expect(mockSetPhoneNumberAgent).toHaveBeenCalledWith("el-test-key", "phnum_xyz", "agent_abc");

    const update = updateCalls.find((u) => u.path === "clinics/clinic-spires");
    expect(update?.data["ava.enabled"]).toBe(true);
  });

  it("pauses Ava: detaches agent (null) from phone number and sets enabled=false", async () => {
    seedClinic("clinic-spires", {
      enabled: true,
      agent_id: "agent_abc",
      phone_number_id: "phnum_xyz",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.enabled).toBe(false);

    expect(mockSetPhoneNumberAgent).toHaveBeenCalledWith("el-test-key", "phnum_xyz", null);

    const update = updateCalls.find((u) => u.path === "clinics/clinic-spires");
    expect(update?.data["ava.enabled"]).toBe(false);
  });

  it("returns 400 if no agent_id configured", async () => {
    seedClinic("clinic-spires", {
      enabled: false,
      phone_number_id: "phnum_xyz",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/agent/i);
    expect(mockSetPhoneNumberAgent).not.toHaveBeenCalled();
  });

  it("returns 400 if no phone_number_id configured", async () => {
    seedClinic("clinic-spires", {
      enabled: false,
      agent_id: "agent_abc",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/phone/i);
    expect(mockSetPhoneNumberAgent).not.toHaveBeenCalled();
  });

  it("returns 404 if clinic not found", async () => {
    // No clinic seeded

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(404);
    expect(mockSetPhoneNumberAgent).not.toHaveBeenCalled();
  });

  it("does not update Firestore if ElevenLabs call fails", async () => {
    seedClinic("clinic-spires", {
      enabled: false,
      agent_id: "agent_abc",
      phone_number_id: "phnum_xyz",
    });
    mockSetPhoneNumberAgent.mockRejectedValueOnce(
      new Error("ElevenLabs phone number update failed (500): server error")
    );

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(updateCalls).toHaveLength(0);
  });

  it("treats missing ava.enabled (undefined) as false and activates on toggle", async () => {
    seedClinic("clinic-spires", {
      agent_id: "agent_abc",
      phone_number_id: "phnum_xyz",
      // enabled intentionally absent
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.enabled).toBe(true);
    expect(mockSetPhoneNumberAgent).toHaveBeenCalledWith("el-test-key", "phnum_xyz", "agent_abc");
  });
});
