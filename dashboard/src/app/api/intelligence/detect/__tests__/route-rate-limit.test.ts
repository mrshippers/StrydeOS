/**
 * P0-15: Rate limit tests for POST /api/intelligence/detect
 *
 * Covers:
 *   - User over budget is rejected 429 (failClosed = true)
 *   - Cron is exempt from rate limiting
 *
 * Run: npx vitest run src/app/api/intelligence/detect/__tests__/route-rate-limit.test.ts
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

// ── auth-guard mocks ──────────────────────────────────────────────────────────

vi.mock("@/lib/auth-guard", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/auth-guard")>();
  return {
    ...orig,
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

// ── firebase-admin mock ───────────────────────────────────────────────────────

function makeQueryStub(getFn: () => Promise<{ docs: unknown[] }>) {
  const stub: Record<string, unknown> = {};
  stub.where = () => makeQueryStub(getFn);
  stub.orderBy = () => makeQueryStub(getFn);
  stub.limit = () => makeQueryStub(getFn);
  stub.get = getFn;
  return stub;
}

const mockGetDocs = vi.fn().mockResolvedValue({ docs: [] });

// computeState doc mock: returns today's timestamp so the P0-17 gate passes
const mockComputeStateGet = vi.fn().mockResolvedValue({
  exists: true,
  data: () => ({ lastFullRecomputeAt: new Date().toISOString() }),
});

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection: () => ({ ...makeQueryStub(mockGetDocs) }),
    doc: () => ({
      get: mockComputeStateGet,
      set: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}));

// ── intelligence lib mocks ────────────────────────────────────────────────────

vi.mock("@/lib/intelligence/detect-insight-events", () => ({
  detectInsightEvents: vi.fn().mockResolvedValue({
    clinicId: "test-clinic",
    eventsCreated: 0,
    eventsSkipped: 0,
    errors: [],
    createdEvents: [],
  }),
}));

vi.mock("@/lib/intelligence/notify-owner", () => ({
  sendUrgentAlerts: vi.fn().mockResolvedValue({ sent: 0, errors: [] }),
}));

vi.mock("@/lib/intelligence/enrich-narratives", () => ({
  enrichEventsWithNarratives: vi.fn().mockResolvedValue({ enriched: 0, skipped: 0, errors: [], llmTimeouts: 0 }),
}));

vi.mock("@/lib/pulse/insight-event-consumer", () => ({
  consumeInsightEvents: vi.fn().mockResolvedValue({ actioned: 0, skipped: 0, errors: [] }),
}));

vi.mock("@/lib/pulse/track-reengagement", () => ({
  trackReengagement: vi.fn().mockResolvedValue({ resolved: 0, milestoneWritten: false, errors: [] }),
}));

vi.mock("@/lib/module-health", () => ({
  writeModuleHealth: vi.fn().mockResolvedValue(undefined),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRequest() {
  return new NextRequest("http://localhost/api/intelligence/detect", { method: "POST" });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/intelligence/detect - P0-15 rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocs.mockResolvedValue({ docs: [] });
    // Gate passes by default: pipeline ran today
    mockComputeStateGet.mockResolvedValue({
      exists: true,
      data: () => ({ lastFullRecomputeAt: new Date().toISOString() }),
    });
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
    // Must not have attempted any Firestore queries
    expect(mockGetDocs).not.toHaveBeenCalled();
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
    mockCheckRateLimitAsync.mockResolvedValueOnce({ limited: false, remaining: 4 });
    mockGetDocs.mockResolvedValue({ docs: [] });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
  });

  it("does not call checkRateLimitAsync for cron requests", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "cron",
    });
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    // Rate limiter must NOT have been called for cron
    expect(mockCheckRateLimitAsync).not.toHaveBeenCalled();
  });
});
