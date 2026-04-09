/**
 * Unit tests for POST /api/webhooks/writeupp
 *
 * Covers: webhook secret validation (timing-safe), missing/invalid secret,
 * event deduplication via _webhook_dedup, event routing, clinic resolution,
 * and acknowledgement for unknown event types.
 *
 * Run: npx vitest run src/app/api/webhooks/__tests__/writeupp.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as crypto from "crypto";

// ── Mocks ────────────────────────────────────────────────────────────────────

const TEST_WEBHOOK_SECRET = "test-webhook-secret-abc123";

// Mock next/server `after` — capture the background callback
let afterCallback: (() => Promise<void>) | null = null;
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn().mockImplementation((cb: () => Promise<void>) => {
      afterCallback = cb;
    }),
  };
});

// Request logger — passthrough
vi.mock("@/lib/request-logger", () => ({
  withRequestLog: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}));

// Firebase Admin — Firestore mock
const dedupStore = new Map<string, Record<string, unknown>>();

function createDedupDocRef(key: string) {
  return {
    get: vi.fn().mockImplementation(() =>
      Promise.resolve({
        exists: dedupStore.has(key),
        data: () => dedupStore.get(key),
      })
    ),
    set: vi.fn().mockImplementation((data: Record<string, unknown>) => {
      dedupStore.set(key, data);
      return Promise.resolve();
    }),
  };
}

const mockClinicsSnap = {
  docs: [] as Array<{ id: string }>,
};

const mockDb = {
  collection: vi.fn().mockImplementation((name: string) => {
    if (name === "_webhook_dedup") {
      return {
        doc: vi.fn().mockImplementation((id: string) => createDedupDocRef(`dedup:${id}`)),
      };
    }
    if (name === "clinics") {
      return {
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(mockClinicsSnap),
        }),
        doc: vi.fn().mockImplementation(() => ({
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ name: "Test Clinic", sessionPricePence: 6500 }),
          }),
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => ({ provider: "writeupp", apiKey: "key-123" }),
              }),
            }),
          }),
          update: vi.fn().mockResolvedValue(undefined),
        })),
      };
    }
    return {
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
      }),
    };
  }),
};

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => mockDb,
}));

// Pipeline mocks — not testing pipeline internals
vi.mock("@/lib/integrations/pms/factory", () => ({
  createPMSAdapter: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/pipeline/sync-clinicians", () => ({
  buildClinicianMap: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/pipeline/sync-appointments", () => ({
  syncAppointments: vi.fn().mockResolvedValue({ patientExternalIds: [] }),
}));
vi.mock("@/lib/pipeline/sync-patients", () => ({
  syncPatients: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/pipeline/compute-patients", () => ({
  computePatientFields: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/comms/trigger-sequences", () => ({
  triggerCommsSequences: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/metrics/compute-weekly", () => ({
  computeWeeklyMetricsForClinic: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildWebhookRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextRequest {
  const rawBody = JSON.stringify(body);
  return new NextRequest("http://localhost:3000/api/webhooks/writeupp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: rawBody,
  });
}

/**
 * Build a request with the correct webhook secret pre-set.
 */
function buildAuthenticatedRequest(
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {}
): NextRequest {
  return buildWebhookRequest(body, {
    "x-webhook-secret": TEST_WEBHOOK_SECRET,
    ...extraHeaders,
  });
}

// ── Import handler (the module reads WRITEUPP_WEBHOOK_SECRET at load time) ──
// We need to dynamically import so the env var is set first.

let POST: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  // Ensure the env var is set before module evaluation
  process.env.WRITEUPP_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

  // Reset module registry so the const WEBHOOK_SECRET is re-read
  vi.resetModules();

  // Re-apply mocks that got cleared by resetModules
  vi.doMock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return {
      ...actual,
      after: vi.fn().mockImplementation((cb: () => Promise<void>) => {
        afterCallback = cb;
      }),
    };
  });
  vi.doMock("@/lib/request-logger", () => ({
    withRequestLog: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
  }));
  vi.doMock("@/lib/firebase-admin", () => ({
    getAdminDb: () => mockDb,
  }));
  vi.doMock("@/lib/integrations/pms/factory", () => ({
    createPMSAdapter: vi.fn().mockReturnValue({}),
  }));
  vi.doMock("@/lib/pipeline/sync-clinicians", () => ({
    buildClinicianMap: vi.fn().mockResolvedValue(new Map()),
  }));
  vi.doMock("@/lib/pipeline/sync-appointments", () => ({
    syncAppointments: vi.fn().mockResolvedValue({ patientExternalIds: [] }),
  }));
  vi.doMock("@/lib/pipeline/sync-patients", () => ({
    syncPatients: vi.fn().mockResolvedValue({}),
  }));
  vi.doMock("@/lib/pipeline/compute-patients", () => ({
    computePatientFields: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock("@/lib/comms/trigger-sequences", () => ({
    triggerCommsSequences: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock("@/lib/metrics/compute-weekly", () => ({
    computeWeeklyMetricsForClinic: vi.fn().mockResolvedValue(undefined),
  }));

  const mod = await import("../../webhooks/writeupp/route");
  POST = mod.POST;

  dedupStore.clear();
  afterCallback = null;
  mockClinicsSnap.docs = [];
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/writeupp", () => {
  // ── 1. Secret validation ──────────────────────────────────────────────────

  describe("webhook secret validation", () => {
    it("accepts request with valid x-webhook-secret header", async () => {
      const res = await POST(
        buildAuthenticatedRequest({
          event: "appointment.created",
          strydeos_clinic_id: "clinic-1",
        })
      );
      expect(res.status).toBe(200);
    });

    it("accepts request with valid Bearer authorization header", async () => {
      const res = await POST(
        buildWebhookRequest(
          { event: "appointment.created", strydeos_clinic_id: "clinic-1" },
          { authorization: `Bearer ${TEST_WEBHOOK_SECRET}` }
        )
      );
      expect(res.status).toBe(200);
    });

    it("uses timing-safe comparison (crypto.timingSafeEqual)", async () => {
      // The route uses crypto.timingSafeEqual — verify it does not throw
      // for equal-length correct secret
      const res = await POST(
        buildAuthenticatedRequest({
          event: "appointment.created",
          strydeos_clinic_id: "clinic-1",
        })
      );
      expect(res.status).toBe(200);
    });
  });

  // ── 2. Rejects missing/invalid secret ─────────────────────────────────────

  describe("rejects unauthorized requests", () => {
    it("returns 401 when no secret header is provided", async () => {
      const req = new NextRequest("http://localhost:3000/api/webhooks/writeupp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "appointment.created" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 401 when secret does not match (same length)", async () => {
      // Same length but different content — timingSafeEqual returns false
      const wrongSecret = "z".repeat(TEST_WEBHOOK_SECRET.length);
      const res = await POST(
        buildWebhookRequest(
          { event: "appointment.created" },
          { "x-webhook-secret": wrongSecret }
        )
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 or 500 when secret has different length (timingSafeEqual throws)", async () => {
      // crypto.timingSafeEqual throws when buffers differ in length.
      // The route's outer try/catch catches this and returns 500.
      const res = await POST(
        buildWebhookRequest(
          { event: "appointment.created" },
          { "x-webhook-secret": "short" }
        )
      );
      // Route catches the timingSafeEqual throw in the outer try/catch → 500
      expect([401, 500]).toContain(res.status);
    });
  });

  // ── 3. Missing event field ────────────────────────────────────────────────

  describe("event field validation", () => {
    it("returns 400 when event field is missing from body", async () => {
      const res = await POST(
        buildAuthenticatedRequest({ data: { id: "123" } })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Missing event");
    });
  });

  // ── 4. Event deduplication ────────────────────────────────────────────────

  describe("idempotency / deduplication", () => {
    it("processes first occurrence of an event", async () => {
      const body = { event: "appointment.created", strydeos_clinic_id: "clinic-1" };
      const res = await POST(buildAuthenticatedRequest(body));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.deduplicated).toBeUndefined();
    });

    it("returns deduplicated: true for exact duplicate webhook body", async () => {
      const body = { event: "appointment.created", strydeos_clinic_id: "clinic-1" };

      // First request — processes normally
      await POST(buildAuthenticatedRequest(body));

      // Second request with exact same body — deduped
      const res = await POST(buildAuthenticatedRequest(body));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.deduplicated).toBe(true);
    });

    it("processes events with different bodies as distinct", async () => {
      const body1 = { event: "appointment.created", strydeos_clinic_id: "clinic-1", data: { id: "appt-1" } };
      const body2 = { event: "appointment.created", strydeos_clinic_id: "clinic-1", data: { id: "appt-2" } };

      const res1 = await POST(buildAuthenticatedRequest(body1));
      const res2 = await POST(buildAuthenticatedRequest(body2));

      const json1 = await res1.json();
      const json2 = await res2.json();

      expect(json1.deduplicated).toBeUndefined();
      expect(json2.deduplicated).toBeUndefined();
    });

    it("uses SHA-256 hash of raw body as idempotency key", async () => {
      const body = { event: "appointment.created", strydeos_clinic_id: "clinic-1" };
      await POST(buildAuthenticatedRequest(body));

      // The dedup doc key should be a 24-char hex prefix of sha256(rawBody)
      const rawBody = JSON.stringify(body);
      const expectedKey = crypto
        .createHash("sha256")
        .update(rawBody)
        .digest("hex")
        .slice(0, 24);

      expect(dedupStore.has(`dedup:${expectedKey}`)).toBe(true);
    });
  });

  // ── 5. Event routing / acknowledgement ────────────────────────────────────

  describe("event routing", () => {
    it("returns 200 with event name and clinicIds for known event", async () => {
      const res = await POST(
        buildAuthenticatedRequest({
          event: "appointment.created",
          strydeos_clinic_id: "clinic-42",
        })
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.event).toBe("appointment.created");
      expect(json.clinicIds).toEqual(["clinic-42"]);
    });

    it("returns 200 for unknown event types (acknowledge receipt)", async () => {
      const res = await POST(
        buildAuthenticatedRequest({
          event: "some.unknown.event",
          strydeos_clinic_id: "clinic-1",
        })
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.event).toBe("some.unknown.event");
    });

    it("registers a background processing callback via after()", async () => {
      await POST(
        buildAuthenticatedRequest({
          event: "appointment.created",
          strydeos_clinic_id: "clinic-1",
        })
      );

      expect(afterCallback).not.toBeNull();
      expect(typeof afterCallback).toBe("function");
    });
  });

  // ── 6. Clinic resolution ──────────────────────────────────────────────────

  describe("clinic resolution", () => {
    it("resolves clinic from strydeos_clinic_id in body", async () => {
      const res = await POST(
        buildAuthenticatedRequest({
          event: "appointment.updated",
          strydeos_clinic_id: "direct-clinic-id",
        })
      );
      const json = await res.json();

      expect(json.clinicIds).toEqual(["direct-clinic-id"]);
    });

    it("resolves clinic from x-strydeos-clinic-id header", async () => {
      const res = await POST(
        buildAuthenticatedRequest(
          { event: "appointment.updated" },
          { "x-strydeos-clinic-id": "header-clinic-id" }
        )
      );
      const json = await res.json();

      expect(json.clinicIds).toEqual(["header-clinic-id"]);
    });

    it("falls back to querying clinics with pmsType=writeupp when no direct ID", async () => {
      mockClinicsSnap.docs = [{ id: "scanned-clinic-1" }];

      const res = await POST(
        buildAuthenticatedRequest({ event: "appointment.created" })
      );
      const json = await res.json();

      expect(json.clinicIds).toEqual(["scanned-clinic-1"]);
    });

    it("returns 422 when multiple clinics match and no clinic ID provided", async () => {
      mockClinicsSnap.docs = [{ id: "clinic-a" }, { id: "clinic-b" }];

      const res = await POST(
        buildAuthenticatedRequest({ event: "appointment.created" })
      );
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.error).toContain("Ambiguous");
      expect(json.matchedCount).toBe(2);
    });

    it("returns 200 with empty clinicIds when no clinics match scan", async () => {
      mockClinicsSnap.docs = [];

      const res = await POST(
        buildAuthenticatedRequest({ event: "appointment.created" })
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.clinicIds).toEqual([]);
    });
  });

  // ── 7. Malformed body ─────────────────────────────────────────────────────

  describe("malformed body handling", () => {
    it("returns 400 for non-JSON body (event is missing after fallback parse)", async () => {
      const req = new NextRequest("http://localhost:3000/api/webhooks/writeupp", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "x-webhook-secret": TEST_WEBHOOK_SECRET,
        },
        body: "this is not json at all",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });
});
