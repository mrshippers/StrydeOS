/**
 * Tests for POST /api/intelligence/detect (P0-17)
 *
 * Covers:
 *   - Gate: detect SKIPS when lastFullRecomputeAt is absent (no pipeline run)
 *   - Gate: detect SKIPS when lastFullRecomputeAt is from yesterday (stale)
 *   - Gate: detect RUNS when lastFullRecomputeAt is from today (fresh)
 *   - In-memory: consumers receive detection.createdEvents, not a re-query
 *   - Skip records detectSkipReason into computeState
 *
 * Run: npx vitest run src/app/api/intelligence/detect/__tests__/route-p0-17.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── request-logger passthrough ────────────────────────────────────────────────

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (handler: unknown) => handler,
}));

// ── withCronOrUser mock (always cron so we isolate P0-17 logic) ───────────────

const mockWithCronOrUser = vi.fn();

vi.mock("@/lib/with-cron-or-user", () => ({
  withCronOrUser: (...args: unknown[]) => mockWithCronOrUser(...args),
}));

// ── checkRateLimitAsync mock (cron is exempt, but mock anyway) ────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ limited: false, remaining: 5 }),
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

// ── computeState doc mock (controls the P0-17 gate) ──────────────────────────

const mockComputeStateGet = vi.fn();
const mockComputeStateSet = vi.fn().mockResolvedValue(undefined);

// ── all-clinics collection query mock ────────────────────────────────────────

const mockGetDocs = vi.fn();

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

// ── intelligence lib mocks ───────────────────────────────────────────────────

const mockDetectInsightEvents = vi.fn();
const mockSendUrgentAlerts = vi.fn().mockResolvedValue({ sent: 0, errors: [] });
const mockEnrichEventsWithNarratives = vi.fn().mockResolvedValue({ enriched: 0, skipped: 0, errors: [], llmTimeouts: 0 });
const mockConsumeInsightEvents = vi.fn().mockResolvedValue({ actioned: 0, skipped: 0, errors: [] });
const mockTrackReengagement = vi.fn().mockResolvedValue({ resolved: 0, milestoneWritten: false, errors: [] });

vi.mock("@/lib/intelligence/detect-insight-events", () => ({
  detectInsightEvents: (...args: unknown[]) => mockDetectInsightEvents(...args),
}));

vi.mock("@/lib/intelligence/notify-owner", () => ({
  sendUrgentAlerts: (...args: unknown[]) => mockSendUrgentAlerts(...args),
}));

vi.mock("@/lib/intelligence/enrich-narratives", () => ({
  enrichEventsWithNarratives: (...args: unknown[]) => mockEnrichEventsWithNarratives(...args),
}));

vi.mock("@/lib/pulse/insight-event-consumer", () => ({
  consumeInsightEvents: (...args: unknown[]) => mockConsumeInsightEvents(...args),
}));

vi.mock("@/lib/pulse/track-reengagement", () => ({
  trackReengagement: (...args: unknown[]) => mockTrackReengagement(...args),
}));

vi.mock("@/lib/module-health", () => ({
  writeModuleHealth: vi.fn().mockResolvedValue(undefined),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCronRequest() {
  return new NextRequest("http://localhost/api/intelligence/detect", { method: "GET" });
}

function todayIso() {
  return new Date().toISOString();
}

function yesterdayIso() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}

const CLINIC_ID = "clinic-alpha";

// ── tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/intelligence/detect - P0-17 pipeline gate + in-memory events", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default auth: cron
    mockWithCronOrUser.mockResolvedValue({ ok: true, mode: "cron" });

    // Default detect result with in-memory created events
    mockDetectInsightEvents.mockResolvedValue({
      clinicId: CLINIC_ID,
      eventsCreated: 1,
      eventsSkipped: 0,
      errors: [],
      createdEvents: [
        {
          id: "evt-1",
          type: "HEP_COMPLIANCE_LOW",
          clinicId: CLINIC_ID,
          severity: "warning",
          title: "HEP low",
          description: "desc",
          suggestedAction: "action",
          actionTarget: "owner",
          createdAt: todayIso(),
          sampleSize: null,
          timeframe: null,
        },
      ],
    });

    // Default: empty clinic list for cron all-clinics branch
    mockGetDocs.mockResolvedValue({ docs: [] });
    mockComputeStateSet.mockResolvedValue(undefined);
  });

  // 1. Gate skips when lastFullRecomputeAt is absent
  it("skips detection when computeState doc does not exist (no pipeline run)", async () => {
    mockComputeStateGet.mockResolvedValue({ exists: false, data: () => ({}) });

    // Run against a single clinic (cron with target)
    const req = new NextRequest("http://localhost/api/intelligence/detect", {
      method: "POST",
      body: JSON.stringify({ clinicId: CLINIC_ID }),
    });
    const { POST } = await import("../route");
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const result = body.results[0];
    expect(result.skippedStaleMetrics).toBe(true);
    expect(result.detection.eventsCreated).toBe(0);
    // detectInsightEvents must NOT have been called
    expect(mockDetectInsightEvents).not.toHaveBeenCalled();
  });

  // 2. Gate skips when lastFullRecomputeAt is from yesterday (stale)
  it("skips detection when lastFullRecomputeAt is from yesterday (stale metrics)", async () => {
    mockComputeStateGet.mockResolvedValue({
      exists: true,
      data: () => ({ lastFullRecomputeAt: yesterdayIso() }),
    });

    const req = new NextRequest("http://localhost/api/intelligence/detect", {
      method: "POST",
      body: JSON.stringify({ clinicId: CLINIC_ID }),
    });
    const { POST } = await import("../route");
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    const result = body.results[0];
    expect(result.skippedStaleMetrics).toBe(true);
    expect(mockDetectInsightEvents).not.toHaveBeenCalled();
  });

  // 3. Skip records the reason into computeState
  it("records detectSkipReason into computeState when skipping", async () => {
    mockComputeStateGet.mockResolvedValue({ exists: false, data: () => ({}) });

    const req = new NextRequest("http://localhost/api/intelligence/detect", {
      method: "POST",
      body: JSON.stringify({ clinicId: CLINIC_ID }),
    });
    const { POST } = await import("../route");
    await POST(req);

    expect(mockComputeStateSet).toHaveBeenCalledWith(
      expect.objectContaining({ detectSkipReason: "stale_metrics" }),
      { merge: true }
    );
  });

  // 4. Gate passes when lastFullRecomputeAt is from today
  it("runs detection when lastFullRecomputeAt is from today (fresh metrics)", async () => {
    mockComputeStateGet.mockResolvedValue({
      exists: true,
      data: () => ({ lastFullRecomputeAt: todayIso() }),
    });

    const req = new NextRequest("http://localhost/api/intelligence/detect", {
      method: "POST",
      body: JSON.stringify({ clinicId: CLINIC_ID }),
    });
    const { POST } = await import("../route");
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    const result = body.results[0];
    expect(result.skippedStaleMetrics).toBeUndefined();
    expect(result.detection.eventsCreated).toBe(1);
    expect(mockDetectInsightEvents).toHaveBeenCalledOnce();
  });

  // 5. In-memory events: consumers receive detection.createdEvents directly
  //    (not from a Firestore re-query). Verify consumeInsightEvents + sendUrgentAlerts
  //    are called with the same event objects returned by detectInsightEvents.
  it("passes in-memory createdEvents to Pulse and urgent-email consumers", async () => {
    const inMemoryEvent = {
      id: "evt-in-memory",
      type: "CLINICIAN_FOLLOWUP_DROP",
      clinicId: CLINIC_ID,
      clinicianId: "c1",
      clinicianName: "Alice",
      severity: "warning" as const,
      title: "Follow-up drop",
      description: "desc",
      suggestedAction: "action",
      actionTarget: "owner" as const,
      createdAt: todayIso(),
      sampleSize: 10,
      timeframe: "Last 7 days",
    };

    mockComputeStateGet.mockResolvedValue({
      exists: true,
      data: () => ({ lastFullRecomputeAt: todayIso() }),
    });
    mockDetectInsightEvents.mockResolvedValue({
      clinicId: CLINIC_ID,
      eventsCreated: 1,
      eventsSkipped: 0,
      errors: [],
      createdEvents: [inMemoryEvent],
    });

    const req = new NextRequest("http://localhost/api/intelligence/detect", {
      method: "POST",
      body: JSON.stringify({ clinicId: CLINIC_ID }),
    });
    const { POST } = await import("../route");
    await POST(req);

    // consumeInsightEvents must receive the exact in-memory event array
    expect(mockConsumeInsightEvents).toHaveBeenCalledWith(
      expect.anything(),
      CLINIC_ID,
      [inMemoryEvent]
    );
    // sendUrgentAlerts must also receive the same in-memory events
    expect(mockSendUrgentAlerts).toHaveBeenCalledWith(
      expect.anything(),
      CLINIC_ID,
      [inMemoryEvent]
    );
    // enrichEventsWithNarratives too
    expect(mockEnrichEventsWithNarratives).toHaveBeenCalledWith(
      expect.anything(),
      CLINIC_ID,
      [inMemoryEvent]
    );
  });

  // 6. In-memory path: no extra Firestore collection query for events
  //    (the old 60s/limit-50 re-query must not happen after gate passes)
  it("does not perform a Firestore re-query for events after detection (in-memory path)", async () => {
    mockComputeStateGet.mockResolvedValue({
      exists: true,
      data: () => ({ lastFullRecomputeAt: todayIso() }),
    });
    // Return an empty clinic list for the all-clinics branch
    mockGetDocs.mockResolvedValue({ docs: [] });

    // Single clinic path via POST body
    const req = new NextRequest("http://localhost/api/intelligence/detect", {
      method: "POST",
      body: JSON.stringify({ clinicId: CLINIC_ID }),
    });
    const { POST } = await import("../route");
    await POST(req);

    // The collection() mock is only called for the all-clinics query path,
    // not for an insight_events re-query. Since we targeted a single clinic,
    // the collection mock should not be called at all.
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});
