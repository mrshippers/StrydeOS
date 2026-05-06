/**
 * Tests for POST /api/reviews/save-config
 *
 * Covers:
 *   - 400 when placeId is missing
 *   - writes googleReviewUrl to the root clinic doc on success
 *   - writes placeId to integrations_config subcollection
 *   - 403 when the user lacks the required role
 *
 * Run: npx vitest run src/app/api/reviews/save-config/__tests__/route.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ limited: false, remaining: 10 }),
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

vi.mock("@/lib/audit-log", () => ({
  writeAuditLog: vi.fn(),
  extractIpFromRequest: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/crypto/credentials", () => ({
  encryptCredential: vi.fn((k: string) => `enc:${k}`),
}));

vi.mock("@/lib/pipeline/types", () => ({
  INTEGRATIONS_CONFIG: "integrations_config",
  REVIEWS_DOC_ID: "google_reviews",
}));

// ── Firestore mock ────────────────────────────────────────────────────────────
// Tracks:
//   subcollectionSets  — calls to collection().doc().collection().doc().set()
//   rootDocUpdates     — calls to collection().doc().update()

interface SubcollectionSet {
  clinicId: string;
  subcollection: string;
  docId: string;
  data: unknown;
  options: unknown;
}

interface RootDocUpdate {
  clinicId: string;
  data: unknown;
}

const dbState: {
  subcollectionSets: SubcollectionSet[];
  rootDocUpdates: RootDocUpdate[];
} = {
  subcollectionSets: [],
  rootDocUpdates: [],
};

function resetDbState() {
  dbState.subcollectionSets = [];
  dbState.rootDocUpdates = [];
}

vi.mock("@/lib/firebase-admin", () => {
  return {
    getAdminDb: () => ({
      collection: (col: string) => ({
        doc: (clinicId: string) => ({
          collection: (subcollection: string) => ({
            doc: (docId: string) => ({
              set: async (data: unknown, options: unknown) => {
                dbState.subcollectionSets.push({ clinicId, subcollection, docId, data, options });
              },
            }),
          }),
          update: async (data: unknown) => {
            dbState.rootDocUpdates.push({ clinicId, data });
          },
        }),
      }),
    }),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/reviews/save-config", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: "Bearer token" },
    body: JSON.stringify(body),
  });
}

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  resetDbState();
  mockVerify.mockResolvedValue({
    uid: "uid-1",
    email: "owner@clinic.co.uk",
    clinicId: "clinic-1",
    role: "owner",
  });
  mockRequireRole.mockImplementation(() => {});
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/reviews/save-config — validation", () => {
  it("returns 400 when placeId missing", async () => {
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/place id/i);
  });
});

describe("POST /api/reviews/save-config — success writes", () => {
  const VALID_PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";

  it("writes placeId to integrations_config subcollection", async () => {
    const res = await POST(buildRequest({ placeId: VALID_PLACE_ID }));
    expect(res.status).toBe(200);

    expect(dbState.subcollectionSets).toHaveLength(1);
    const { subcollection, docId, data } = dbState.subcollectionSets[0];
    expect(subcollection).toBe("integrations_config");
    expect(docId).toBe("google_reviews");
    expect((data as Record<string, unknown>).placeId).toBe(VALID_PLACE_ID);
  });

  it("writes googleReviewUrl to root clinic doc on success", async () => {
    const res = await POST(buildRequest({ placeId: VALID_PLACE_ID }));
    expect(res.status).toBe(200);

    expect(dbState.rootDocUpdates).toHaveLength(1);
    const { clinicId, data } = dbState.rootDocUpdates[0];
    expect(clinicId).toBe("clinic-1");
    const update = data as Record<string, unknown>;
    expect(update.googleReviewUrl).toBe(
      `https://search.google.com/local/writereview?placeid=${VALID_PLACE_ID}`,
    );
    expect(typeof update.updatedAt).toBe("string");
  });
});

describe("POST /api/reviews/save-config — auth", () => {
  it("returns 403 if user lacks required role", async () => {
    mockRequireRole.mockImplementation(() => {
      const err = new Error("Forbidden") as Error & { statusCode: number };
      err.statusCode = 403;
      throw err;
    });

    const res = await POST(
      buildRequest({ placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" }),
    );
    expect(res.status).toBe(403);
  });
});
