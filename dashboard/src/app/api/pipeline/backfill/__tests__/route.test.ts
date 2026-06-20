/**
 * Tests for POST /api/pipeline/backfill (P0-14 explicit authz guard)
 *
 * Covers:
 *   - Non-superadmin user with no clinicId is rejected 400 (never reaches all-clinics)
 *   - Non-superadmin user WITH a clinicId processes only their own clinic
 *   - Cron auth still reaches all-clinics processing
 *   - Superadmin still reaches all-clinics processing
 *   - Non-superadmin user targeting another clinic is rejected 403
 *
 * Run: npx vitest run src/app/api/pipeline/backfill/__tests__/route.test.ts
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
  checkRateLimitAsync: vi.fn().mockResolvedValue({ limited: false, remaining: 2 }),
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

// ── tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/pipeline/backfill - P0-14 authz guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPipeline.mockResolvedValue({ clinicId: "test-clinic", ok: true });
    mockGetAllClinics.mockResolvedValue({ docs: [] });
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
    // Pipeline and all-clinics query must not have been called
    expect(mockRunPipeline).not.toHaveBeenCalled();
    expect(mockGetAllClinics).not.toHaveBeenCalled();
  });

  // 2. Non-superadmin user WITH a clinicId processes only their own clinic
  it("processes only own clinic for non-superadmin user with a clinicId", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-2", email: "owner@clinic.com", clinicId: "clinic-abc", role: "owner" },
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // Only their clinic, not all clinics
    expect(mockRunPipeline).toHaveBeenCalledOnce();
    expect(mockRunPipeline).toHaveBeenCalledWith(expect.anything(), "clinic-abc", { backfill: true });
    expect(mockGetAllClinics).not.toHaveBeenCalled();
  });

  // 3. Cron auth reaches all-clinics processing (no regression)
  it("reaches all-clinics processing for cron auth", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "cron",
    });
    mockGetAllClinics.mockResolvedValueOnce({
      docs: [
        { id: "clinic-1" },
        { id: "clinic-2" },
      ],
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(2);
    expect(mockGetAllClinics).toHaveBeenCalledOnce();
  });

  // 4. Superadmin reaches all-clinics processing (no regression)
  it("reaches all-clinics processing for superadmin user", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-super", email: "super@strydeos.com", clinicId: "any", role: "superadmin" },
    });
    mockGetAllClinics.mockResolvedValueOnce({ docs: [{ id: "clinic-1" }] });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(mockGetAllClinics).toHaveBeenCalledOnce();
  });

  // 5. Non-superadmin user targeting a different clinic is rejected 403
  it("rejects 403 for non-superadmin user targeting another clinic", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: true,
      mode: "user",
      user: { uid: "uid-3", email: "owner@clinic.com", clinicId: "clinic-abc", role: "owner" },
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ clinicId: "clinic-other" }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/access denied/i);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  // 6. Auth failure is correctly rejected
  it("rejects when withCronOrUser returns not-ok", async () => {
    mockWithCronOrUser.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Authentication failed",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockRunPipeline).not.toHaveBeenCalled();
    expect(mockGetAllClinics).not.toHaveBeenCalled();
  });
});
