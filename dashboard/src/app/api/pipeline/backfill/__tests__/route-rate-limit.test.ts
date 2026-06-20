/**
 * P0-15: Rate limit + concurrency cap tests for POST /api/pipeline/backfill
 *
 * Covers:
 *   - User over budget is rejected 429 (failClosed = true)
 *   - Cron is exempt from rate limiting
 *   - BACKFILL_MAX_CLINICS hard ceiling is respected
 *   - BACKFILL_CONCURRENCY cap is respected (at most N parallel runPipeline calls per chunk)
 *
 * Run: npx vitest run src/app/api/pipeline/backfill/__tests__/route-rate-limit.test.ts
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

// ── firebase-admin + runPipeline mocks ────────────────────────────────────────

const mockRunPipeline = vi.fn();
const mockGetAllClinics = vi.fn();

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

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/pipeline/backfill", {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : {},
  });
}

function makeClinics(count: number) {
  return {
    docs: Array.from({ length: count }, (_, i) => ({ id: `clinic-${i + 1}` })),
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/pipeline/backfill - P0-15 rate limiting", () => {
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
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/too many requests/i);
    expect(mockRunPipeline).not.toHaveBeenCalled();
    expect(mockGetAllClinics).not.toHaveBeenCalled();
  });

  it("includes X-RateLimit-Remaining header on 429", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-1", email: "owner@clinic.com", clinicId: "clinic-abc", role: "owner" },
    });
    mockCheckRateLimitAsync.mockResolvedValueOnce({ limited: true, remaining: 0 });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("allows user through when under the rate limit", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-2", email: "owner@clinic.com", clinicId: "clinic-abc", role: "owner" },
    });
    mockCheckRateLimitAsync.mockResolvedValueOnce({ limited: false, remaining: 1 });
    mockRunPipeline.mockResolvedValue({ clinicId: "clinic-abc", ok: true });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
  });

  it("does not call checkRateLimitAsync for cron requests", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "cron",
    });
    mockGetAllClinics.mockResolvedValueOnce({ docs: [] });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockCheckRateLimitAsync).not.toHaveBeenCalled();
  });
});

describe("POST /api/pipeline/backfill - BACKFILL_MAX_CLINICS ceiling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPipeline.mockResolvedValue({ ok: true });
  });

  it("processes at most BACKFILL_MAX_CLINICS clinics even if more exist", async () => {
    const { BACKFILL_MAX_CLINICS } = await import("../backfill-limits");

    mockWithCronOrUser.mockResolvedValueOnce({ ok: true, mode: "cron" });
    // Provide more clinics than the ceiling
    mockGetAllClinics.mockResolvedValueOnce(makeClinics(BACKFILL_MAX_CLINICS + 10));

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(BACKFILL_MAX_CLINICS);
    expect(mockRunPipeline).toHaveBeenCalledTimes(BACKFILL_MAX_CLINICS);
  });

  it("processes all clinics when count is below the ceiling", async () => {
    const { BACKFILL_MAX_CLINICS } = await import("../backfill-limits");
    const clinicCount = Math.min(5, BACKFILL_MAX_CLINICS);

    mockWithCronOrUser.mockResolvedValueOnce({ ok: true, mode: "cron" });
    mockGetAllClinics.mockResolvedValueOnce(makeClinics(clinicCount));

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(clinicCount);
    expect(mockRunPipeline).toHaveBeenCalledTimes(clinicCount);
  });
});

describe("POST /api/pipeline/backfill - BACKFILL_CONCURRENCY cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes clinics in chunks respecting BACKFILL_CONCURRENCY", async () => {
    const { BACKFILL_CONCURRENCY } = await import("../backfill-limits");

    // Track max simultaneous in-flight calls
    let inflight = 0;
    let maxInflight = 0;

    mockRunPipeline.mockImplementation(() => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      return new Promise<{ ok: boolean }>((resolve) => {
        setImmediate(() => {
          inflight -= 1;
          resolve({ ok: true });
        });
      });
    });

    const clinicCount = BACKFILL_CONCURRENCY * 3; // 3 full chunks
    mockWithCronOrUser.mockResolvedValueOnce({ ok: true, mode: "cron" });
    mockGetAllClinics.mockResolvedValueOnce(makeClinics(clinicCount));

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    // Max parallelism must never exceed the concurrency cap
    expect(maxInflight).toBeLessThanOrEqual(BACKFILL_CONCURRENCY);
    expect(mockRunPipeline).toHaveBeenCalledTimes(clinicCount);
  });
});
