/**
 * Tests for /api/integrations/inbound-email/provision (GET / POST / DELETE).
 *
 * Provisions the Mailgun ingest inbox + sender allowlist for a clinic.
 * Auth: GET = owner|admin|superadmin, POST/DELETE = owner|superadmin only.
 *
 * Run: npx vitest run src/app/api/integrations/inbound-email/provision/__tests__/route.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ limited: false, remaining: 9 }),
}));

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}));

vi.mock("@/lib/audit-log", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  extractIpFromRequest: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerify = vi.fn();
const mockRequireRole = vi.fn();
vi.mock("@/lib/auth-guard", () => ({
  verifyApiRequest: (...args: unknown[]) => mockVerify(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  handleApiError: (err: unknown) => {
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    return new Response(JSON.stringify({ error: e.message ?? "error" }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  },
}));

const mockClinicGet = vi.fn();
const mockClinicSet = vi.fn();
vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: mockClinicGet,
        set: mockClinicSet,
      }),
    }),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRequest(method: "GET" | "POST" | "DELETE", body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/integrations/inbound-email/provision", {
    method,
    headers: { "Content-Type": "application/json", authorization: "Bearer token" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

class AuthError extends Error {
  statusCode: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.statusCode = status;
  }
}

import { GET, POST, DELETE } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockVerify.mockResolvedValue({
    uid: "uid-1",
    email: "owner@spires.co.uk",
    clinicId: "clinic-spires",
    role: "owner",
  });
  mockRequireRole.mockImplementation(() => {});
  mockClinicSet.mockResolvedValue(undefined);
});

// ─── GET ─────────────────────────────────────────────────────────────────────

describe("GET /api/integrations/inbound-email/provision", () => {
  it("returns email + empty allowlist + provisioned=false for a fresh clinic (owner)", async () => {
    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({}),
    });

    const res = await GET(buildRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.email).toBe("import-clinic-spires@ingest.strydeos.com");
    expect(json.allowedSenders).toEqual([]);
    expect(json.provisioned).toBe(false);
    expect(json.domain).toBe("ingest.strydeos.com");
  });

  it("returns 403 for clinician role", async () => {
    mockRequireRole.mockImplementationOnce(() => {
      throw new AuthError("Insufficient permissions", 403);
    });

    const res = await GET(buildRequest("GET"));
    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockVerify.mockRejectedValueOnce(new AuthError("Missing or invalid Authorization header", 401));

    const res = await GET(buildRequest("GET"));
    expect(res.status).toBe(401);
  });
});

// ─── POST ────────────────────────────────────────────────────────────────────

describe("POST /api/integrations/inbound-email/provision", () => {
  it("adds a valid sender → 200, allowlist populated, provisioned=true", async () => {
    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ allowedInboundSenders: [] }),
    });

    const res = await POST(buildRequest("POST", { action: "add", sender: "Jamal@SpiresPhysiotherapy.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowedSenders).toEqual(["jamal@spiresphysiotherapy.com"]);
    expect(json.provisioned).toBe(true);

    expect(mockClinicSet).toHaveBeenCalledTimes(1);
    const [payload, opts] = mockClinicSet.mock.calls[0];
    expect(payload.allowedInboundSenders).toEqual(["jamal@spiresphysiotherapy.com"]);
    expect(opts).toEqual({ merge: true });
  });

  it("rejects an invalid email format with 400 and writes nothing", async () => {
    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ allowedInboundSenders: [] }),
    });

    const res = await POST(buildRequest("POST", { action: "add", sender: "not-an-email" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid sender email");
    expect(mockClinicSet).not.toHaveBeenCalled();
  });

  it("treats add of an existing sender as a no-op (idempotent, 200)", async () => {
    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ allowedInboundSenders: ["jamal@spires.co.uk"] }),
    });

    const res = await POST(buildRequest("POST", { action: "add", sender: "JAMAL@spires.co.uk" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowedSenders).toEqual(["jamal@spires.co.uk"]);
    // No-op: don't write the same list back
    expect(mockClinicSet).not.toHaveBeenCalled();
  });

  it("rejects add when allowlist is at max (10) → 400", async () => {
    const full = Array.from({ length: 10 }, (_, i) => `user${i}@spires.co.uk`);
    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ allowedInboundSenders: full }),
    });

    const res = await POST(buildRequest("POST", { action: "add", sender: "eleventh@spires.co.uk" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Sender allowlist full (max 10)");
    expect(mockClinicSet).not.toHaveBeenCalled();
  });

  it("replaces the entire allowlist with a valid array → 200", async () => {
    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ allowedInboundSenders: ["old@spires.co.uk"] }),
    });

    const res = await POST(
      buildRequest("POST", {
        action: "replace",
        sender: ["jamal@spires.co.uk", "Andrew@Spires.co.uk"],
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowedSenders).toEqual(["jamal@spires.co.uk", "andrew@spires.co.uk"]);

    expect(mockClinicSet).toHaveBeenCalledTimes(1);
    const [payload] = mockClinicSet.mock.calls[0];
    expect(payload.allowedInboundSenders).toEqual([
      "jamal@spires.co.uk",
      "andrew@spires.co.uk",
    ]);
  });

  it("blocks remove that would empty the allowlist → 400 (use DELETE instead)", async () => {
    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ allowedInboundSenders: ["jamal@spires.co.uk"] }),
    });

    const res = await POST(buildRequest("POST", { action: "remove", sender: "jamal@spires.co.uk" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/cannot remove/i);
    expect(json.error).toMatch(/delete/i);
    expect(mockClinicSet).not.toHaveBeenCalled();
  });

  it("returns 403 when an admin tries to mutate the allowlist", async () => {
    mockVerify.mockResolvedValueOnce({
      uid: "uid-2",
      email: "admin@spires.co.uk",
      clinicId: "clinic-spires",
      role: "admin",
    });
    // First requireRole call (owner|admin|superadmin) passes; second (owner|superadmin) fails.
    mockRequireRole
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new AuthError("Insufficient permissions", 403);
      });

    const res = await POST(buildRequest("POST", { action: "add", sender: "x@spires.co.uk" }));
    expect(res.status).toBe(403);
    expect(mockClinicSet).not.toHaveBeenCalled();
  });
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

describe("DELETE /api/integrations/inbound-email/provision", () => {
  it("clears the allowlist for an authenticated owner → 200", async () => {
    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ allowedInboundSenders: ["jamal@spires.co.uk"] }),
    });

    const res = await DELETE(buildRequest("DELETE"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.allowedSenders).toEqual([]);
    expect(json.provisioned).toBe(false);
    expect(json.email).toBe("import-clinic-spires@ingest.strydeos.com");

    expect(mockClinicSet).toHaveBeenCalledTimes(1);
    const [payload, opts] = mockClinicSet.mock.calls[0];
    expect(payload.allowedInboundSenders).toEqual([]);
    expect(opts).toEqual({ merge: true });
  });
});
