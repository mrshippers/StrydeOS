/**
 * Tests for POST /api/intelligence/detect (P0-14 explicit authz guard)
 *
 * Covers:
 *   - Non-superadmin user with no clinicId is rejected 400 (never reaches all-clinics)
 *   - Non-superadmin user WITH a clinicId processes only their own clinic
 *   - Cron auth still reaches all-clinics processing
 *   - Superadmin still reaches all-clinics processing
 *
 * Run: npx vitest run src/app/api/intelligence/detect/__tests__/route.test.ts
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

// ── checkRateLimitAsync mock (allow-through by default) ───────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ limited: false, remaining: 5 }),
}));

// ── auth-guard mocks ──────────────────────────────────────────────────────────

const mockRequireClinic = vi.fn();

vi.mock("@/lib/auth-guard", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/auth-guard")>();
  return {
    ...orig,
    requireClinic: (...args: unknown[]) => mockRequireClinic(...args),
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

const mockGetDocs = vi.fn();

// computeState doc mock - returns today's date by default so gate passes
const mockComputeStateGet = vi.fn().mockResolvedValue({
  exists: true,
  data: () => ({ lastFullRecomputeAt: new Date().toISOString() }),
});
const mockComputeStateSet = vi.fn().mockResolvedValue(undefined);

// Build a chainable query stub that supports where/orderBy/limit/get
function makeQueryStub(getFn: () => Promise<{ docs: unknown[] }>) {
  const stub: Record<string, unknown> = {};
  stub.where = () => makeQueryStub(getFn);
  stub.orderBy = () => makeQueryStub(getFn);
  stub.limit = () => makeQueryStub(getFn);
  stub.get = getFn;
  return stub;
}

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      ...makeQueryStub(mockGetDocs),
    }),
    doc: () => ({
      get: mockComputeStateGet,
      set: mockComputeStateSet,
    }),
  }),
}));

// ── intelligence lib mocks (prevent deep execution) ──────────────────────────

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

describe("POST /api/intelligence/detect - P0-14 authz guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireClinic.mockReturnValue(undefined);
    // Default Firestore all-clinics query returns empty set
    mockGetDocs.mockResolvedValue({ docs: [] });
    // Default: computeState shows today's pipeline run (gate passes)
    mockComputeStateGet.mockResolvedValue({
      exists: true,
      data: () => ({ lastFullRecomputeAt: new Date().toISOString() }),
    });
    mockComputeStateSet.mockResolvedValue(undefined);
  });

  // 1. P0-14: non-superadmin user with no clinicId must be rejected 400 before
  //    reaching the all-clinics branch. This is the core finding.
  it("rejects 400 for non-superadmin user with no clinicId (never reaches all-clinics)", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-1", email: "owner@clinic.com", clinicId: undefined, role: "owner" },
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("No clinic associated");
    // All-clinics query must not have been called
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  // 2. Non-superadmin user WITH a clinicId processes only their own clinic (not all clinics)
  //    The route queries per-clinic subcollections - mockGetDocs will be called for those.
  //    The critical assertion is that the all-clinics collection query (where status in [...])
  //    only executes for cron/superadmin. We verify the response is 200 and the result
  //    contains the user's own clinic, not a cross-tenant sweep.
  it("processes only own clinic for non-superadmin user with a clinicId", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-2", email: "owner@clinic.com", clinicId: "clinic-abc", role: "owner" },
    });
    // Per-clinic insight_events query returns empty set
    mockGetDocs.mockResolvedValue({ docs: [] });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // Result should contain only the user's own clinic, not a multi-clinic sweep
    expect(body.results).toHaveLength(1);
    expect(body.results[0].clinicId).toBe("clinic-abc");
  });

  // 3. Cron auth reaches all-clinics processing (no regression)
  it("reaches all-clinics processing for cron auth", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "cron",
    });
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockGetDocs).toHaveBeenCalledOnce();
  });

  // 4. Superadmin reaches all-clinics processing (no regression).
  //    Superadmin must have no clinicId in the request body to trigger the all-clinics branch.
  //    The assertion is that the clinics collection is queried (mockGetDocs called once).
  it("reaches all-clinics processing for superadmin user", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      // clinicId: undefined ensures targetClinicId is undefined -> all-clinics branch
      user: { uid: "uid-super", email: "super@strydeos.com", clinicId: undefined, role: "superadmin" },
    });
    // The all-clinics query returns an empty set
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // The all-clinics collection query must have been reached
    expect(mockGetDocs).toHaveBeenCalledOnce();
  });

  // 5. Auth failure is correctly rejected
  it("rejects when withCronOrUser returns not-ok", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Authentication failed",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});
