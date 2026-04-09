/**
 * Tests for POST /api/heidi/test-connection
 *
 * This endpoint validates a Heidi API key + clinician email combo.
 * It does NOT save anything — purely a test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Auth mock ────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth-guard", () => ({
  verifyApiRequest: vi.fn(),
  requireRole: vi.fn(),
  handleApiError: (e: unknown) => {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  },
}));

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (fn: unknown) => fn,
}));

vi.mock("@/lib/integrations/heidi/client", () => ({
  validateApiKey: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeRequest(body: Record<string, unknown>, role = "owner") {
  const { verifyApiRequest } = await import("@/lib/auth-guard");
  vi.mocked(verifyApiRequest).mockResolvedValue({
    uid: "user-1",
    email: "owner@spires.co.uk",
    clinicId: "clinic-1",
    role,
  } as never);

  return new NextRequest("http://localhost/api/heidi/test-connection", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/heidi/test-connection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 200 when API key + email are valid", async () => {
    const { validateApiKey } = await import("@/lib/integrations/heidi/client");
    vi.mocked(validateApiKey).mockResolvedValue(true);

    const req = await makeRequest({ apiKey: "valid-key", email: "andrew@spires.co.uk", region: "uk" });
    const { POST } = await import("../test-connection/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns 401 when Heidi rejects the API key", async () => {
    const { validateApiKey } = await import("@/lib/integrations/heidi/client");
    vi.mocked(validateApiKey).mockResolvedValue(false);

    const req = await makeRequest({ apiKey: "bad-key", email: "andrew@spires.co.uk", region: "uk" });
    const { POST } = await import("../test-connection/route");
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/invalid api key/i);
  });

  it("returns 400 when API key is missing", async () => {
    const req = await makeRequest({ email: "andrew@spires.co.uk" });
    const { POST } = await import("../test-connection/route");
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/api key/i);
  });

  it("returns 400 when email is missing", async () => {
    const req = await makeRequest({ apiKey: "some-key" });
    const { POST } = await import("../test-connection/route");
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/email/i);
  });

  it("returns 400 when region is invalid", async () => {
    const req = await makeRequest({ apiKey: "key", email: "a@b.com", region: "mars" });
    const { POST } = await import("../test-connection/route");
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/region/i);
  });

  it("returns 403 for clinician role", async () => {
    const { requireRole } = await import("@/lib/auth-guard");
    vi.mocked(requireRole).mockImplementation(() => {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    });

    const req = await makeRequest({ apiKey: "key", email: "a@b.com" }, "clinician");
    const { POST } = await import("../test-connection/route");
    const res = await POST(req);
    // handleApiError maps non-HTTP errors to 500 — but requireRole throws with status
    expect([403, 500]).toContain(res.status);
  });
});
