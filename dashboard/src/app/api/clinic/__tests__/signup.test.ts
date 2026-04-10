/**
 * Unit tests for POST /api/clinic/signup
 *
 * Covers: happy-path signup, duplicate email handling, invited user detection,
 * field validation, password validation, rate limiting, and atomic cleanup
 * on partial failure (orphaned Auth users / Stripe customers).
 *
 * Run: npx vitest run src/app/api/clinic/__tests__/signup.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Rate limiter
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ limited: false, remaining: 4 }),
}));

// Firebase Admin
const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockGetUserByEmail = vi.fn();
const mockSetCustomUserClaims = vi.fn();

vi.mock("@/lib/firebase-admin", () => ({
  getAdminAuth: () => ({
    createUser: mockCreateUser,
    deleteUser: mockDeleteUser,
    getUserByEmail: mockGetUserByEmail,
    setCustomUserClaims: mockSetCustomUserClaims,
  }),
  getAdminDb: () => mockDb,
}));

// setCustomClaims calls getAdminAuth internally — mock it at module level
vi.mock("@/lib/set-custom-claims", () => ({
  setCustomClaims: vi.fn().mockResolvedValue(undefined),
}));

// Request logger — passthrough (no-op wrapper)
vi.mock("@/lib/request-logger", () => ({
  withRequestLog: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}));

// Stripe
const mockStripeCustomersCreate = vi.fn();
const mockStripeCustomersDel = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    customers: {
      create: mockStripeCustomersCreate,
      del: mockStripeCustomersDel,
    },
  }),
}));

// deriveJurisdictionFromCountry — simple pass-through
vi.mock("@/data/compliance-config", () => ({
  deriveJurisdictionFromCountry: (c: string) => {
    const n = c.toLowerCase();
    if (n === "us" || n === "usa") return "us";
    if (n === "au" || n === "aus") return "au";
    if (n === "ca" || n === "can") return "ca";
    return "uk";
  },
}));

// ── Firestore mock helpers ───────────────────────────────────────────────────

function createMockBatch() {
  return {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
}

let currentBatch = createMockBatch();

function createMockDocRef(existsVal = false, data: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref: any = {
    id: "mock-clinic-id-abc",
    get: vi.fn().mockResolvedValue({
      exists: existsVal,
      data: () => data,
    }),
    set: vi.fn().mockResolvedValue(undefined),
  };
  // Subcollection support — route does .collection("clinicians").doc() on the clinic ref
  ref.collection = vi.fn().mockReturnValue({
    doc: vi.fn().mockReturnValue({
      id: "mock-clinician-id",
      set: vi.fn().mockResolvedValue(undefined),
    }),
  });
  return ref;
}

const mockCollections: Record<string, ReturnType<typeof createMockDocRef>> = {};

const mockDb = {
  collection: vi.fn().mockImplementation((name: string) => {
    return {
      doc: vi.fn().mockImplementation((id?: string) => {
        const key = id ? `${name}/${id}` : name;
        if (!mockCollections[key]) {
          mockCollections[key] = createMockDocRef();
        }
        return mockCollections[key];
      }),
      add: vi.fn().mockResolvedValue({ id: "funnel-event-id" }),
    };
  }),
  batch: vi.fn().mockImplementation(() => currentBatch),
};

// ── Test helpers ─────────────────────────────────────────────────────────────

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/clinic/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  clinicName: "Test Physio Clinic",
  email: "owner@testclinic.com",
  password: "SecurePass123!",
  firstName: "John",
  lastName: "Doe",
};

// ── Import route handler (AFTER mocks are declared) ──────────────────────────

import { POST } from "../signup/route";

// ── Test suites ──────────────────────────────────────────────────────────────

describe("POST /api/clinic/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentBatch = createMockBatch();
    Object.keys(mockCollections).forEach((k) => delete mockCollections[k]);

    // Default: no existing user
    mockGetUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });

    // Default: successful user creation
    mockCreateUser.mockResolvedValue({ uid: "uid-123" });

    // Default: Stripe returns a customer
    mockStripeCustomersCreate.mockResolvedValue({ id: "cus_stripe_123" });

    // Ensure STRIPE_SECRET_KEY is set so the Stripe path executes
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  });

  // ── 1. Happy path ─────────────────────────────────────────────────────────

  describe("successful signup", () => {
    it("creates Firebase Auth user + Firestore docs + Stripe customer and returns 201", async () => {
      const res = await POST(buildRequest(VALID_BODY));
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.uid).toBe("uid-123");
      expect(json.clinicId).toBeDefined();
      expect(json.email).toBe("owner@testclinic.com");

      // Auth user was created with correct params
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "owner@testclinic.com",
          password: "SecurePass123!",
          displayName: "John Doe",
        })
      );

      // Stripe customer created
      expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "owner@testclinic.com",
          name: "Test Physio Clinic",
        })
      );

      // Firestore batch written (user doc + owner clinician doc + clinic doc)
      expect(currentBatch.set).toHaveBeenCalledTimes(3);
      expect(currentBatch.commit).toHaveBeenCalledOnce();
    });

    it("lowercases and trims email", async () => {
      const res = await POST(
        buildRequest({ ...VALID_BODY, email: "  OWNER@TestClinic.COM  " })
      );
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.email).toBe("owner@testclinic.com");
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: "owner@testclinic.com" })
      );
    });

    it("uses clinicName as displayName when firstName is missing", async () => {
      const res = await POST(
        buildRequest({
          clinicName: "Spires Physio",
          email: "test@spires.co.uk",
          password: "LongEnough1",
        })
      );
      expect(res.status).toBe(201);
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: "Spires Physio" })
      );
    });
  });

  // ── 2. Duplicate email (Firebase auth-already-exists) ─────────────────────

  describe("duplicate email", () => {
    it("returns 409 when auth.createUser throws auth/email-already-exists", async () => {
      mockGetUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });
      mockCreateUser.mockRejectedValue({ code: "auth/email-already-exists" });

      const res = await POST(buildRequest(VALID_BODY));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error).toContain("already exists");
    });

    it("returns 409 with EMAIL_EXISTS for active user found during pre-flight", async () => {
      // Pre-flight finds an existing user with a Firestore doc
      mockGetUserByEmail.mockResolvedValue({ uid: "existing-uid" });

      // Set up the user doc lookup to return an active user
      mockCollections["users/existing-uid"] = createMockDocRef(true, {
        status: "active",
        clinicId: "clinic-xyz",
      });

      const res = await POST(buildRequest(VALID_BODY));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe("EMAIL_EXISTS");
    });
  });

  // ── 3. Invited user detection ─────────────────────────────────────────────

  describe("invited user", () => {
    it("returns 409 with ALREADY_INVITED for pre-existing invited user", async () => {
      mockGetUserByEmail.mockResolvedValue({ uid: "invited-uid" });

      // User doc exists with status: invited
      mockCollections["users/invited-uid"] = createMockDocRef(true, {
        status: "invited",
        clinicId: "clinic-abc",
      });

      // Clinic doc for the invited user's clinic
      mockCollections["clinics/clinic-abc"] = createMockDocRef(true, {
        name: "Spires Physiotherapy",
      });

      const res = await POST(buildRequest(VALID_BODY));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe("ALREADY_INVITED");
      expect(json.clinicName).toBe("Spires Physiotherapy");
      expect(json.error).toContain("invited");
    });
  });

  // ── 4. Missing required fields ────────────────────────────────────────────

  describe("field validation", () => {
    it("returns 400 when clinicName is missing", async () => {
      const res = await POST(
        buildRequest({ email: "a@b.com", password: "12345678" })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("clinicName");
    });

    it("returns 400 when email is missing", async () => {
      const res = await POST(
        buildRequest({ clinicName: "Test", password: "12345678" })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when password is missing", async () => {
      const res = await POST(
        buildRequest({ clinicName: "Test", email: "a@b.com" })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when clinicName is whitespace only", async () => {
      const res = await POST(
        buildRequest({ clinicName: "   ", email: "a@b.com", password: "12345678" })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new NextRequest("http://localhost:3000/api/clinic/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid JSON");
    });

    it("returns 400 for invalid email format", async () => {
      mockGetUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });
      mockCreateUser.mockRejectedValue({ code: "auth/invalid-email" });

      const res = await POST(
        buildRequest({ ...VALID_BODY, email: "not-an-email" })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid email");
    });
  });

  // ── 5. Rate limiting ──────────────────────────────────────────────────────

  describe("rate limiting", () => {
    it("returns 429 when rate-limited", async () => {
      const { checkRateLimitAsync } = await import("@/lib/rate-limit");
      vi.mocked(checkRateLimitAsync).mockResolvedValueOnce({
        limited: true,
        remaining: 0,
      });

      const res = await POST(buildRequest(VALID_BODY));
      expect(res.status).toBe(429);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      const json = await res.json();
      expect(json.error).toContain("Too many requests");
    });

    it("passes with correct rate limit config (5 per 15 min)", async () => {
      const { checkRateLimitAsync } = await import("@/lib/rate-limit");

      await POST(buildRequest(VALID_BODY));

      expect(checkRateLimitAsync).toHaveBeenCalledWith(
        expect.anything(),
        { limit: 5, windowMs: 15 * 60 * 1000 }
      );
    });
  });

  // ── 6. Password validation ────────────────────────────────────────────────

  describe("password validation", () => {
    it("returns 400 for password shorter than 8 characters", async () => {
      const res = await POST(
        buildRequest({ ...VALID_BODY, password: "short" })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("8 characters");
    });

    it("accepts password of exactly 8 characters", async () => {
      const res = await POST(
        buildRequest({ ...VALID_BODY, password: "12345678" })
      );
      expect(res.status).toBe(201);
    });
  });

  // ── 7. Atomic cleanup: Stripe failure ─────────────────────────────────────

  describe("atomic cleanup on Stripe failure", () => {
    it("continues signup if Stripe customer creation fails (non-blocking)", async () => {
      mockStripeCustomersCreate.mockRejectedValue(new Error("Stripe down"));

      const res = await POST(buildRequest(VALID_BODY));
      expect(res.status).toBe(201);

      // Firestore batch still committed
      expect(currentBatch.commit).toHaveBeenCalledOnce();
    });

    it("continues signup if STRIPE_SECRET_KEY is not set", async () => {
      delete process.env.STRIPE_SECRET_KEY;

      const res = await POST(buildRequest(VALID_BODY));
      expect(res.status).toBe(201);
      expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
    });
  });

  // ── 8. Atomic cleanup: Firestore batch failure ────────────────────────────

  describe("atomic cleanup on Firestore failure", () => {
    it("deletes orphaned Firebase Auth user when batch.commit fails", async () => {
      currentBatch.commit.mockRejectedValue(new Error("Firestore write failed"));

      const res = await POST(buildRequest(VALID_BODY));
      expect(res.status).toBe(500);

      // Auth user should be cleaned up
      expect(mockDeleteUser).toHaveBeenCalledWith("uid-123");
    });

    it("deletes orphaned Stripe customer when batch.commit fails", async () => {
      currentBatch.commit.mockRejectedValue(new Error("Firestore write failed"));

      const res = await POST(buildRequest(VALID_BODY));
      expect(res.status).toBe(500);

      // Stripe customer should be cleaned up
      expect(mockStripeCustomersDel).toHaveBeenCalledWith("cus_stripe_123");
    });

    it("handles cleanup failure gracefully (no double-throw)", async () => {
      currentBatch.commit.mockRejectedValue(new Error("Firestore write failed"));
      mockDeleteUser.mockRejectedValue(new Error("Delete also failed"));
      mockStripeCustomersDel.mockRejectedValue(new Error("Stripe delete failed"));

      // Should not throw — returns 500 even when cleanup fails
      const res = await POST(buildRequest(VALID_BODY));
      expect(res.status).toBe(500);
    });
  });

  // ── 9. Edge: orphaned auth user proceeds ──────────────────────────────────

  describe("orphaned auth user (exists in Auth but no Firestore doc)", () => {
    it("proceeds with signup when auth user exists but has no Firestore doc", async () => {
      // Pre-flight: user exists in Auth
      mockGetUserByEmail.mockResolvedValue({ uid: "orphaned-uid" });

      // But no Firestore user doc
      mockCollections["users/orphaned-uid"] = createMockDocRef(false, {});

      const res = await POST(buildRequest(VALID_BODY));
      // The route continues — createUser may fail with auth/email-already-exists
      // but the pre-flight check itself should not block
      expect(mockCreateUser).toHaveBeenCalled();
    });
  });
});
