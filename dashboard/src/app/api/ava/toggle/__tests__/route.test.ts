import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
//
// Proxy-first topology: the toggle flips ONLY ava.enabled. The inbound proxy
// (/api/ava/inbound-call) reads that flag and returns voicemail when false, so
// no ElevenLabs detach is involved in pausing.

describe("POST /api/ava/toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(firestoreStore).forEach((k) => delete firestoreStore[k]);
    updateCalls.length = 0;

    mockVerifyApiRequest.mockResolvedValue({
      uid: "user1",
      email: "owner@spires.com",
      clinicId: "clinic-spires",
      role: "owner",
    });
    mockRequireRole.mockReturnValue(undefined);
  });

  it("activates Ava: sets enabled=true via the single flag", async () => {
    seedClinic("clinic-spires", {
      enabled: false,
      agent_id: "agent_abc",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.enabled).toBe(true);

    const update = updateCalls.find((u) => u.path === "clinics/clinic-spires");
    expect(update?.data["ava.enabled"]).toBe(true);
  });

  it("pauses Ava: sets enabled=false via the single flag", async () => {
    seedClinic("clinic-spires", {
      enabled: true,
      agent_id: "agent_abc",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.enabled).toBe(false);

    const update = updateCalls.find((u) => u.path === "clinics/clinic-spires");
    expect(update?.data["ava.enabled"]).toBe(false);
  });

  it("returns 400 if no agent_id configured", async () => {
    seedClinic("clinic-spires", {
      enabled: false,
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/agent/i);
  });

  it("toggles without a phone_number_id (no ElevenLabs detach needed)", async () => {
    seedClinic("clinic-spires", {
      enabled: false,
      agent_id: "agent_abc",
      // phone_number_id intentionally absent — proxy-first pause does not need it
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.enabled).toBe(true);
  });

  it("returns 404 if clinic not found", async () => {
    // No clinic seeded

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(404);
  });

  it("treats missing ava.enabled (undefined) as false and activates on toggle", async () => {
    seedClinic("clinic-spires", {
      agent_id: "agent_abc",
      // enabled intentionally absent
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.enabled).toBe(true);
  });
});
