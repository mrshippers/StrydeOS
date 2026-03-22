/**
 * Tests for auth-guard pure logic functions.
 *
 * Run: npx tsx --test src/lib/__tests__/auth-guard.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiAuthError } from "../auth-guard";

// ─── requireRole logic ──────────────────────────────────────────────────────

describe("ApiAuthError", () => {
  it("stores statusCode and message", () => {
    const err = new ApiAuthError("Forbidden", 403);
    assert.equal(err.message, "Forbidden");
    assert.equal(err.statusCode, 403);
    assert.equal(err.name, "ApiAuthError");
  });

  it("is an instance of Error", () => {
    const err = new ApiAuthError("Unauthorized", 401);
    assert.ok(err instanceof Error);
    assert.ok(err instanceof ApiAuthError);
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
    assert.throws(
      () => requireRole(user, ["owner", "superadmin"]),
      (err: unknown) =>
        err instanceof ApiAuthError && err.statusCode === 403
    );
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
    assert.throws(
      () => requireClinic(user, "clinic-2"),
      (err: unknown) =>
        err instanceof ApiAuthError && err.statusCode === 403
    );
  });
});
