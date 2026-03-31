/**
 * Tests for auth-guard pure logic functions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiAuthError } from "../auth-guard";

// ─── requireRole logic ──────────────────────────────────────────────────────

describe("ApiAuthError", () => {
  it("stores statusCode and message", () => {
    const err = new ApiAuthError("Forbidden", 403);
    expect(err.message).toBe("Forbidden");
    expect(err.statusCode).toBe(403);
    expect(err.name).toBe("ApiAuthError");
  });

  it("is an instance of Error", () => {
    const err = new ApiAuthError("Unauthorized", 401);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiAuthError);
  });
});

// ─── requireRole (import directly — no Firebase deps) ────────────────────────

describe("requireRole", () => {
  // requireRole doesn't depend on Firebase, safe to import directly
  it("allows matching role", async () => {
    const { requireRole } = await import("../auth-guard");
    const user = {
      uid: "u1",
      email: "test@test.com",
      clinicId: "c1",
      role: "owner" as const,
    };
    // Should not throw
    requireRole(user, ["owner", "superadmin"]);
  });

  it("rejects non-matching role", async () => {
    const { requireRole } = await import("../auth-guard");
    const user = {
      uid: "u1",
      email: "test@test.com",
      clinicId: "c1",
      role: "clinician" as const,
    };
    expect(() => requireRole(user, ["owner", "superadmin"])).toThrow();
    try {
      requireRole(user, ["owner", "superadmin"]);
    } catch (err) {
      expect(err).toBeInstanceOf(ApiAuthError);
      expect((err as ApiAuthError).statusCode).toBe(403);
    }
  });
});

// ─── requireClinic ───────────────────────────────────────────────────────────

describe("requireClinic", () => {
  it("allows superadmin access to any clinic", async () => {
    const { requireClinic } = await import("../auth-guard");
    const user = {
      uid: "u1",
      email: "admin@strydeos.com",
      clinicId: "any",
      role: "superadmin" as const,
    };
    // Should not throw even with mismatched clinicId
    requireClinic(user, "different-clinic");
  });

  it("allows matching clinicId", async () => {
    const { requireClinic } = await import("../auth-guard");
    const user = {
      uid: "u1",
      email: "owner@clinic.com",
      clinicId: "clinic-1",
      role: "owner" as const,
    };
    requireClinic(user, "clinic-1");
  });

  it("rejects mismatched clinicId for non-superadmin", async () => {
    const { requireClinic } = await import("../auth-guard");
    const user = {
      uid: "u1",
      email: "owner@clinic.com",
      clinicId: "clinic-1",
      role: "owner" as const,
    };
    expect(() => requireClinic(user, "clinic-2")).toThrow();
    try {
      requireClinic(user, "clinic-2");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiAuthError);
      expect((err as ApiAuthError).statusCode).toBe(403);
    }
  });
});

// ─── verifyCronRequest ──────────────────────────────────────────────────────

describe("verifyCronRequest", () => {
  const CRON_SECRET = "test-cron-secret-value";

  function makeRequest(authHeader?: string) {
    const headers = new Headers();
    if (authHeader) headers.set("authorization", authHeader);
    return { headers } as import("next/server").NextRequest;
  }

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
  });

  it("accepts valid cron secret", async () => {
    const { verifyCronRequest } = await import("../auth-guard");
    expect(() => verifyCronRequest(makeRequest(`Bearer ${CRON_SECRET}`))).not.toThrow();
  });

  it("rejects wrong cron secret", async () => {
    const { verifyCronRequest } = await import("../auth-guard");
    expect(() => verifyCronRequest(makeRequest("Bearer wrong-secret"))).toThrow(ApiAuthError);
    try {
      verifyCronRequest(makeRequest("Bearer wrong-secret"));
    } catch (err) {
      expect((err as ApiAuthError).statusCode).toBe(401);
    }
  });

  it("rejects missing authorization header", async () => {
    const { verifyCronRequest } = await import("../auth-guard");
    expect(() => verifyCronRequest(makeRequest())).toThrow(ApiAuthError);
  });

  it("rejects when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { verifyCronRequest } = await import("../auth-guard");
    expect(() => verifyCronRequest(makeRequest("Bearer something"))).toThrow(/CRON_SECRET not configured/);
  });

  it("uses timing-safe comparison (same-length wrong secret)", async () => {
    const { verifyCronRequest } = await import("../auth-guard");
    // Same length as CRON_SECRET but different content
    const sameLength = "x".repeat(CRON_SECRET.length);
    expect(() => verifyCronRequest(makeRequest(`Bearer ${sameLength}`))).toThrow(ApiAuthError);
  });
});
