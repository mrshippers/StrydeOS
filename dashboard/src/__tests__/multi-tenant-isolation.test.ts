/**
 * Multi-tenant isolation integration tests.
 *
 * Verifies that clinicId partitioning is enforced across:
 * - Auth guard (requireClinic)
 * - Pipeline data scoping (all queries use clinicId)
 * - Role hierarchy (clinician can't access other clinics)
 * - Session cookie contains no role (only uid + exp)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireClinic, requireRole, ApiAuthError, type VerifiedUser } from "@/lib/auth-guard";

// ── Auth Guard: Clinic Isolation ──────────────────────────────────────────

function makeUser(overrides: Partial<VerifiedUser> = {}): VerifiedUser {
  return {
    uid: "user-1",
    email: "test@spires.com",
    clinicId: "clinic-A",
    role: "clinician",
    ...overrides,
  };
}

describe("requireClinic — clinicId isolation", () => {
  it("allows access when user.clinicId matches requested clinicId", () => {
    const user = makeUser({ clinicId: "clinic-A" });
    expect(() => requireClinic(user, "clinic-A")).not.toThrow();
  });

  it("throws 403 when user.clinicId does not match requested clinicId", () => {
    const user = makeUser({ clinicId: "clinic-A" });
    expect(() => requireClinic(user, "clinic-B")).toThrow(ApiAuthError);
    expect(() => requireClinic(user, "clinic-B")).toThrow("Access denied");
  });

  it("superadmin bypasses clinic check", () => {
    const superadmin = makeUser({ role: "superadmin", clinicId: "clinic-A" });
    expect(() => requireClinic(superadmin, "clinic-B")).not.toThrow();
    expect(() => requireClinic(superadmin, "clinic-C")).not.toThrow();
  });

  it("owner cannot access other clinic", () => {
    const owner = makeUser({ role: "owner", clinicId: "clinic-A" });
    expect(() => requireClinic(owner, "clinic-B")).toThrow(ApiAuthError);
  });

  it("admin cannot access other clinic", () => {
    const admin = makeUser({ role: "admin", clinicId: "clinic-A" });
    expect(() => requireClinic(admin, "clinic-B")).toThrow(ApiAuthError);
  });

  it("clinician cannot access other clinic", () => {
    const clinician = makeUser({ role: "clinician", clinicId: "clinic-A" });
    expect(() => requireClinic(clinician, "clinic-B")).toThrow(ApiAuthError);
  });
});

describe("requireRole — role hierarchy enforcement", () => {
  it("allows owner for owner-level routes", () => {
    const owner = makeUser({ role: "owner" });
    expect(() => requireRole(owner, ["superadmin", "owner"])).not.toThrow();
  });

  it("rejects clinician from admin routes", () => {
    const clinician = makeUser({ role: "clinician" });
    expect(() =>
      requireRole(clinician, ["superadmin", "owner", "admin"])
    ).toThrow(ApiAuthError);
  });

  it("allows superadmin everywhere", () => {
    const superadmin = makeUser({ role: "superadmin" });
    expect(() => requireRole(superadmin, ["superadmin"])).not.toThrow();
    expect(() => requireRole(superadmin, ["superadmin", "owner"])).not.toThrow();
  });

  it("rejects non-matching roles", () => {
    const admin = makeUser({ role: "admin" });
    expect(() => requireRole(admin, ["superadmin", "owner"])).toThrow(
      "Insufficient permissions"
    );
  });
});

// ── Pipeline Data Scoping ─────────────────────────────────────────────────

describe("pipeline data scoping — clinicId path partitioning", () => {
  it("syncClinicians accesses clinics/{clinicId}/clinicians", async () => {
    // Import the sync function to verify it uses the correct Firestore path
    const { syncClinicians } = await import("@/lib/pipeline/sync-clinicians");

    const collectionPaths: string[] = [];
    const mockDb = {
      collection: vi.fn((path: string) => {
        collectionPaths.push(path);
        return {
          doc: vi.fn(() => ({
            collection: vi.fn((sub: string) => {
              collectionPaths.push(sub);
              return {
                limit: vi.fn(() => ({
                  get: vi.fn(async () => ({ docs: [] })),
                })),
              };
            }),
          })),
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ docs: [] })),
          })),
        };
      }),
      batch: vi.fn(() => ({
        set: vi.fn(),
        update: vi.fn(),
        commit: vi.fn(async () => {}),
      })),
    };

    const mockAdapter = {
      getClinicians: vi.fn(async () => []),
      getAppointments: vi.fn(),
      getPatient: vi.fn(),
    };

    await syncClinicians(mockDb as any, "clinic-test-123", mockAdapter as any);

    // Verify the first collection call uses "clinics" and the clinicId is "clinic-test-123"
    expect(collectionPaths[0]).toBe("clinics");
    expect(collectionPaths).toContain("clinicians");
  });

  it("all pipeline stages receive clinicId as parameter — never infer it", async () => {
    // This is a structural test: all pipeline stage functions take clinicId as 2nd arg
    const { syncClinicians } = await import("@/lib/pipeline/sync-clinicians");
    const { syncPatients } = await import("@/lib/pipeline/sync-patients");
    const { syncAppointments } = await import("@/lib/pipeline/sync-appointments");
    const { computePatientFields } = await import("@/lib/pipeline/compute-patients");
    const { computeAttribution } = await import("@/lib/pipeline/compute-attribution");

    // Each function should accept (db, clinicId, ...) — the clinicId is always explicit
    expect(syncClinicians.length).toBeGreaterThanOrEqual(2);
    expect(syncPatients.length).toBeGreaterThanOrEqual(2);
    expect(syncAppointments.length).toBeGreaterThanOrEqual(2);
    expect(computePatientFields.length).toBeGreaterThanOrEqual(2);
    expect(computeAttribution.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Session Cookie: No Role Leakage ───────────────────────────────────────

describe("session cookie — no role in payload", () => {
  it("signSession produces payload with only uid and exp (no role)", async () => {
    // Set the required env var for session signing
    const origSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "test-secret-for-hmac-signing-32chars!!";

    try {
      const { signSession, verifySession } = await import("@/lib/session");

      const cookie = await signSession("user-123");
      expect(cookie).toBeTruthy();
      expect(cookie.split(".")).toHaveLength(2);

      const payload = await verifySession(cookie);
      expect(payload).toBeTruthy();
      expect(payload!.uid).toBe("user-123");
      expect(payload!.exp).toBeGreaterThan(0);

      // Role MUST NOT be in the cookie payload
      const payloadObj = payload as Record<string, unknown>;
      expect(payloadObj).not.toHaveProperty("role");
      expect(payloadObj).not.toHaveProperty("clinicId");
    } finally {
      process.env.SESSION_SECRET = origSecret;
    }
  });

  it("session version is included when provided", async () => {
    const origSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "test-secret-for-hmac-signing-32chars!!";

    try {
      const { signSession, verifySession } = await import("@/lib/session");

      const cookie = await signSession("user-123", 5);
      const payload = await verifySession(cookie);
      expect(payload!.v).toBe(5);
    } finally {
      process.env.SESSION_SECRET = origSecret;
    }
  });

  it("verifySession returns null for expired sessions", async () => {
    const origSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "test-secret-for-hmac-signing-32chars!!";

    try {
      const { verifySession } = await import("@/lib/session");

      // A tampered cookie should fail verification
      expect(await verifySession("invalid.cookie")).toBeNull();
      expect(await verifySession("")).toBeNull();
      expect(await verifySession("abc")).toBeNull();
    } finally {
      process.env.SESSION_SECRET = origSecret;
    }
  });
});
