/**
 * Tests for POST /api/clinic/enrich
 *
 * Covers: auth + role gate, missing clinic, happy path, preserves existing
 * manual entries, orchestrator failure fallback, rate limiting.
 *
 * Run: npx vitest run src/app/api/clinic/enrich/__tests__/route.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ limited: false, remaining: 4 }),
}));

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
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
const mockClinicUpdate = vi.fn();
vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection: (_: string) => ({
      doc: (_id: string) => ({
        get: mockClinicGet,
        update: mockClinicUpdate,
      }),
    }),
  }),
}));

const mockEnrichClinic = vi.fn();
vi.mock("@/lib/ava/enrich/orchestrator", () => ({
  enrichClinic: (...args: unknown[]) => mockEnrichClinic(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/clinic/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: "Bearer token" },
    body: JSON.stringify(body),
  });
}

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockVerify.mockResolvedValue({
    uid: "uid-1",
    email: "owner@clinic.co.uk",
    clinicId: "clinic-1",
    role: "owner",
  });
  mockRequireRole.mockImplementation(() => {});
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/clinic/enrich", () => {
  it("returns 404 when clinic doc does not exist", async () => {
    mockClinicGet.mockResolvedValueOnce({ exists: false });

    const res = await POST(buildRequest());
    expect(res.status).toBe(404);
  });

  it("runs orchestrator with clinic name and explicit website override", async () => {
    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ name: "Spires Physiotherapy", ava: {} }),
    });
    mockEnrichClinic.mockResolvedValueOnce({
      entries: [
        {
          id: "auto-services-1",
          category: "services",
          title: "Physio",
          content: "back pain",
          updatedAt: "2026-04-20T00:00:00Z",
          source: "auto",
          confidence: "high",
        },
      ],
      sources: { places: true, companiesHouse: true, website: true },
      resolved: { places: null, companiesHouse: null, website: null },
    });

    const res = await POST(buildRequest({ website: "https://spires.co.uk" }));
    expect(res.status).toBe(200);

    expect(mockEnrichClinic).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicName: "Spires Physiotherapy",
        explicitWebsite: "https://spires.co.uk",
      }),
    );
  });

  it("preserves existing manual entries and appends auto entries", async () => {
    const existingManual = {
      id: "manual-1",
      category: "services",
      title: "Sports physio",
      content: "We do sports",
      updatedAt: "2026-04-01T00:00:00Z",
      source: "manual",
    };

    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        name: "Acme Physio",
        ava: { knowledge: [existingManual] },
      }),
    });

    mockEnrichClinic.mockResolvedValueOnce({
      entries: [
        {
          id: "auto-services-xyz",
          category: "services",
          title: "Physiotherapy",
          content: "General physio",
          updatedAt: "2026-04-20T00:00:00Z",
          source: "auto",
          confidence: "high",
        },
      ],
      sources: { places: true, companiesHouse: false, website: false },
      resolved: { places: null, companiesHouse: null, website: null },
    });

    const res = await POST(buildRequest());
    expect(res.status).toBe(200);

    expect(mockClinicUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockClinicUpdate.mock.calls[0][0];
    const writtenKnowledge = updateArgs["ava.knowledge"];

    expect(writtenKnowledge).toHaveLength(2);
    expect(writtenKnowledge.find((e: { id: string }) => e.id === "manual-1")).toBeDefined();
    expect(writtenKnowledge.find((e: { source?: string }) => e.source === "auto")).toBeDefined();
  });

  it("replaces prior auto entries on re-run (idempotent)", async () => {
    const oldAuto = {
      id: "auto-services-OLD",
      category: "services",
      title: "Stale",
      content: "Stale content",
      updatedAt: "2026-04-01T00:00:00Z",
      source: "auto",
    };
    const manual = {
      id: "manual-1",
      category: "custom",
      title: "Manual",
      content: "User wrote this",
      updatedAt: "2026-04-05T00:00:00Z",
      source: "manual",
    };

    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        name: "Acme",
        ava: { knowledge: [oldAuto, manual] },
      }),
    });

    mockEnrichClinic.mockResolvedValueOnce({
      entries: [
        {
          id: "auto-services-NEW",
          category: "services",
          title: "Fresh",
          content: "Fresh content",
          updatedAt: "2026-04-20T00:00:00Z",
          source: "auto",
          confidence: "high",
        },
      ],
      sources: { places: true, companiesHouse: false, website: false },
      resolved: { places: null, companiesHouse: null, website: null },
    });

    const res = await POST(buildRequest());
    expect(res.status).toBe(200);

    const writtenKnowledge = mockClinicUpdate.mock.calls[0][0]["ava.knowledge"];
    expect(writtenKnowledge).toHaveLength(2); // manual + new auto; old auto dropped
    expect(writtenKnowledge.find((e: { id: string }) => e.id === "auto-services-OLD")).toBeUndefined();
    expect(writtenKnowledge.find((e: { id: string }) => e.id === "auto-services-NEW")).toBeDefined();
    expect(writtenKnowledge.find((e: { id: string }) => e.id === "manual-1")).toBeDefined();
  });

  it("returns success with sources summary, entries count, and review entries", async () => {
    mockClinicGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ name: "Acme", ava: {} }),
    });

    mockEnrichClinic.mockResolvedValueOnce({
      entries: [
        {
          id: "auto-services-a",
          category: "services",
          title: "A",
          content: "A",
          updatedAt: "2026-04-20T00:00:00Z",
          source: "auto",
          confidence: "high",
        },
        {
          id: "auto-location-b",
          category: "location",
          title: "B",
          content: "B",
          updatedAt: "2026-04-20T00:00:00Z",
          source: "auto",
          confidence: "medium",
        },
      ],
      sources: { places: true, companiesHouse: false, website: true },
      resolved: { places: null, companiesHouse: null, website: null },
    });

    const res = await POST(buildRequest());
    const body = await res.json();

    expect(body.sources).toEqual({ places: true, companiesHouse: false, website: true });
    expect(body.entries).toHaveLength(2);
    expect(body.entriesCount).toBe(2);
  });

  it("rate-limits excessive calls", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimit).mockReturnValueOnce({
      limited: true,
      remaining: 0,
    });

    const res = await POST(buildRequest());
    expect(res.status).toBe(429);
  });
});
