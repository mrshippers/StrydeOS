/**
 * P0-15: Rate limit tests for GET /api/intelligence/clinician-digest
 *
 * Covers:
 *   - User over budget is rejected 429 (failClosed = true)
 *   - Cron is exempt from rate limiting
 *
 * Run: npx vitest run src/app/api/intelligence/clinician-digest/__tests__/route-rate-limit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── request-logger passthrough ────────────────────────────────────────────────

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (handler: unknown) => handler,
}));

// ── withCronOrUser mock ───────────────────────────────────────────────────────

const mockWithCronOrUser = vi.fn();

vi.mock("@/lib/with-cron-or-user", () => ({
  withCronOrUser: (...args: unknown[]) => mockWithCronOrUser(...args),
}));

// ── checkRateLimitAsync mock ──────────────────────────────────────────────────

const mockCheckRateLimitAsync = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: (...args: unknown[]) => mockCheckRateLimitAsync(...args),
}));

// ── auth-guard mock ───────────────────────────────────────────────────────────

vi.mock("@/lib/auth-guard", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/auth-guard")>();
  return {
    ...orig,
    handleApiError: (err: unknown) => {
      const e = err as { statusCode?: number; message?: string };
      const status = e.statusCode ?? 500;
      return new Response(JSON.stringify({ error: e.message ?? "error" }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
});

// ── firebase-admin + digest lib mocks ─────────────────────────────────────────

const mockGetClinics = vi.fn().mockResolvedValue({ docs: [] });

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      where: () => ({ get: mockGetClinics }),
    }),
  }),
}));

vi.mock("@/lib/intelligence/send-clinician-digests", () => ({
  sendClinicianDigests: vi.fn().mockResolvedValue({ results: [] }),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRequest() {
  return new NextRequest("http://localhost/api/intelligence/clinician-digest", { method: "GET" });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/intelligence/clinician-digest - P0-15 rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClinics.mockResolvedValue({ docs: [] });
  });

  it("returns 429 when user is over the rate limit (failClosed)", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-1", email: "owner@clinic.com", clinicId: "clinic-abc", role: "owner" },
    });
    mockCheckRateLimitAsync.mockResolvedValueOnce({ limited: true, remaining: 0 });

    const { GET } = await import("../route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/too many requests/i);
    expect(mockGetClinics).not.toHaveBeenCalled();
  });

  it("includes X-RateLimit-Remaining header on 429", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-1", email: "owner@clinic.com", clinicId: "clinic-abc", role: "owner" },
    });
    mockCheckRateLimitAsync.mockResolvedValueOnce({ limited: true, remaining: 0 });

    const { GET } = await import("../route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("allows user through when under the rate limit", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-2", email: "owner@clinic.com", clinicId: "clinic-abc", role: "owner" },
    });
    mockCheckRateLimitAsync.mockResolvedValueOnce({ limited: false, remaining: 2 });
    mockGetClinics.mockResolvedValueOnce({ docs: [] });

    const { GET } = await import("../route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
  });

  it("does not call checkRateLimitAsync for cron requests", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "cron",
    });
    mockGetClinics.mockResolvedValueOnce({ docs: [] });

    const { GET } = await import("../route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockCheckRateLimitAsync).not.toHaveBeenCalled();
  });
});
