/**
 * P0-15: Rate limit tests for POST /api/pipeline/run
 *
 * Covers:
 *   - User over budget is rejected 429 (failClosed = true)
 *   - Cron (GET path) is exempt from rate limiting
 *
 * Run: npx vitest run src/app/api/pipeline/run/__tests__/route-rate-limit.test.ts
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

// ── auth-guard mocks (verifyCronRequest for GET path) ────────────────────────

vi.mock("@/lib/auth-guard", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/auth-guard")>();
  return {
    ...orig,
    verifyCronRequest: vi.fn(), // no-op: cron is verified
    requireClinic: vi.fn(),
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

// ── firebase-admin + runPipeline mocks ────────────────────────────────────────

const mockRunPipeline = vi.fn().mockResolvedValue({ clinicId: "test-clinic", ok: true });
const mockGetAllClinics = vi.fn().mockResolvedValue({ docs: [] });

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      get: mockGetAllClinics,
    }),
  }),
}));

vi.mock("@/lib/pipeline/run-pipeline", () => ({
  runPipeline: (...args: unknown[]) => mockRunPipeline(...args),
}));

vi.mock("@/lib/audit-log", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  extractIpFromRequest: vi.fn().mockReturnValue("127.0.0.1"),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makePostRequest(body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/pipeline/run", {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : {},
  });
}

function makeGetRequest() {
  return new NextRequest("http://localhost/api/pipeline/run", {
    method: "GET",
    headers: { authorization: "Bearer valid-cron-secret" },
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/pipeline/run - P0-15 rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPipeline.mockResolvedValue({ clinicId: "test-clinic", ok: true });
    mockGetAllClinics.mockResolvedValue({ docs: [] });
  });

  it("returns 429 when user is over the rate limit (failClosed)", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-1", email: "owner@clinic.com", clinicId: "clinic-abc", role: "owner" },
    });
    mockCheckRateLimitAsync.mockResolvedValueOnce({ limited: true, remaining: 0 });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest());
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/too many requests/i);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it("includes X-RateLimit-Remaining header on 429", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-1", email: "owner@clinic.com", clinicId: "clinic-abc", role: "owner" },
    });
    mockCheckRateLimitAsync.mockResolvedValueOnce({ limited: true, remaining: 0 });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest());

    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("allows user through when under the rate limit", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-2", email: "owner@clinic.com", clinicId: "clinic-abc", role: "owner" },
    });
    mockCheckRateLimitAsync.mockResolvedValueOnce({ limited: false, remaining: 9 });
    mockRunPipeline.mockResolvedValue({ clinicId: "clinic-abc", ok: true });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ clinicId: "clinic-abc" }));

    expect(res.status).toBe(200);
  });

  it("does not call checkRateLimitAsync for cron POST requests", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "cron",
    });
    mockGetAllClinics.mockResolvedValueOnce({ docs: [] });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest());

    expect(res.status).toBe(200);
    expect(mockCheckRateLimitAsync).not.toHaveBeenCalled();
  });

  it("does not call checkRateLimitAsync for cron GET requests", async () => {
    // GET path uses verifyCronRequest directly (not withCronOrUser)
    // so checkRateLimitAsync must never fire on that code path
    const { GET } = await import("../route");
    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    expect(mockCheckRateLimitAsync).not.toHaveBeenCalled();
  });
});
