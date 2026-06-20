/**
 * Tests for withCronOrUser helper (P0-14).
 *
 * Strategy:
 *   - No cron secret + no user token -> rejects (401)
 *   - Invalid cron secret + no user token -> rejects (401)
 *   - Valid cron secret -> cron mode, handler called with { mode: "cron" }
 *   - Valid user token -> user mode, requireClinic enforced
 *   - A user cannot reach cron-mode bypass even with a Bearer token that is
 *     NOT the cron secret (falls through to user auth, NOT cron mode)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const CRON_SECRET = "super-secret-cron-value";

// ── Mock factories (hoisted so vi.mock factory can reference them) ──────────

const { mockVerifyApiRequest, mockRequireRole, mockRequireClinic } = vi.hoisted(() => ({
  mockVerifyApiRequest: vi.fn(),
  mockRequireRole: vi.fn(),
  mockRequireClinic: vi.fn(),
}));

vi.mock("../auth-guard", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../auth-guard")>();
  return {
    ...orig,
    verifyApiRequest: mockVerifyApiRequest,
    requireRole: mockRequireRole,
    requireClinic: mockRequireClinic,
  };
});

// ── Shared request factory ─────────────────────────────────────────────────

function makeRequest(authHeader?: string): import("next/server").NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return { headers, method: "POST" } as import("next/server").NextRequest;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("withCronOrUser", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    // resetAllMocks clears call history AND one-time return/implementation queues,
    // preventing unconsumed once-stubs from leaking across tests.
    vi.resetAllMocks();
  });

  // 1. No auth header at all -> reject before touching user layer
  it("rejects with 401 when no Authorization header is present", async () => {
    const { withCronOrUser } = await import("../with-cron-or-user");
    const req = makeRequest(); // no auth header
    const result = await withCronOrUser(req, { allowedRoles: ["owner", "admin", "superadmin"] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
    expect(mockVerifyApiRequest).not.toHaveBeenCalled();
  });

  // 2. Bearer token present but wrong cron secret AND verifyApiRequest throws -> reject
  it("rejects with 401 when cron secret is wrong and user auth fails", async () => {
    const { withCronOrUser } = await import("../with-cron-or-user");
    const { ApiAuthError } = await import("../auth-guard");
    const req = makeRequest("Bearer wrong-secret");
    mockVerifyApiRequest.mockRejectedValueOnce(new ApiAuthError("Authentication failed", 401));
    const result = await withCronOrUser(req, { allowedRoles: ["owner", "admin", "superadmin"] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  // 3. Valid cron secret -> cron mode, user auth NOT called
  it("returns cron mode for valid cron secret", async () => {
    const { withCronOrUser } = await import("../with-cron-or-user");
    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const result = await withCronOrUser(req, { allowedRoles: ["owner", "admin", "superadmin"] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe("cron");
    }
    // Must never reach user auth path
    expect(mockVerifyApiRequest).not.toHaveBeenCalled();
    expect(mockRequireRole).not.toHaveBeenCalled();
    expect(mockRequireClinic).not.toHaveBeenCalled();
  });

  // 4. Valid user token -> user mode, requireRole + requireClinic both called
  it("returns user mode for valid user token and calls requireRole + requireClinic", async () => {
    const { withCronOrUser } = await import("../with-cron-or-user");
    const req = makeRequest("Bearer valid-firebase-token");
    const fakeUser = {
      uid: "uid-1",
      email: "owner@clinic.com",
      clinicId: "clinic-abc",
      role: "owner" as const,
    };
    mockVerifyApiRequest.mockResolvedValueOnce(fakeUser);
    mockRequireRole.mockReturnValueOnce(undefined);
    mockRequireClinic.mockReturnValueOnce(undefined);

    const result = await withCronOrUser(req, {
      allowedRoles: ["owner", "admin", "superadmin"],
      targetClinicId: "clinic-abc",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe("user");
      if (result.mode === "user") {
        expect(result.user).toMatchObject({ uid: "uid-1", clinicId: "clinic-abc" });
      }
    }
    expect(mockVerifyApiRequest).toHaveBeenCalledOnce();
    expect(mockRequireRole).toHaveBeenCalledOnce();
    expect(mockRequireClinic).toHaveBeenCalledOnce();
  });

  // 5. User with wrong-length Bearer token (not cron secret) falls to user auth
  it("a user token that is not the cron secret falls through to user auth (never reaches cron mode)", async () => {
    const { withCronOrUser } = await import("../with-cron-or-user");
    const req = makeRequest("Bearer some-firebase-id-token");
    const fakeUser = {
      uid: "uid-2",
      email: "admin@clinic.com",
      clinicId: "clinic-xyz",
      role: "admin" as const,
    };
    mockVerifyApiRequest.mockResolvedValueOnce(fakeUser);
    mockRequireRole.mockReturnValueOnce(undefined);
    mockRequireClinic.mockReturnValueOnce(undefined);

    const result = await withCronOrUser(req, {
      allowedRoles: ["owner", "admin", "superadmin"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // MUST be user mode, never cron
      expect(result.mode).toBe("user");
    }
    expect(mockVerifyApiRequest).toHaveBeenCalledOnce();
  });

  // 6. Superadmin user -> requireClinic NOT called (superadmin bypasses clinic scope)
  it("does not call requireClinic for superadmin users", async () => {
    const { withCronOrUser } = await import("../with-cron-or-user");
    const req = makeRequest("Bearer some-firebase-id-token");
    const fakeUser = {
      uid: "uid-3",
      email: "super@strydeos.com",
      clinicId: "any",
      role: "superadmin" as const,
    };
    mockVerifyApiRequest.mockResolvedValueOnce(fakeUser);
    mockRequireRole.mockReturnValueOnce(undefined);

    const result = await withCronOrUser(req, {
      allowedRoles: ["owner", "admin", "superadmin"],
      targetClinicId: "some-clinic",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe("user");
    }
    // requireClinic not called for superadmin
    expect(mockRequireClinic).not.toHaveBeenCalled();
  });

  // 7. requireRole rejection propagates correctly
  it("rejects with 403 when requireRole throws for insufficient role", async () => {
    const { withCronOrUser } = await import("../with-cron-or-user");
    const { ApiAuthError } = await import("../auth-guard");
    const req = makeRequest("Bearer some-firebase-id-token");
    const fakeUser = {
      uid: "uid-4",
      email: "clinician@clinic.com",
      clinicId: "clinic-abc",
      role: "clinician" as const,
    };
    mockVerifyApiRequest.mockResolvedValueOnce(fakeUser);
    mockRequireRole.mockImplementationOnce(() => {
      throw new ApiAuthError("Insufficient permissions", 403);
    });

    const result = await withCronOrUser(req, { allowedRoles: ["owner", "admin", "superadmin"] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  // 8. requireClinic rejection propagates correctly
  it("rejects with 403 when requireClinic throws for clinic mismatch", async () => {
    const { withCronOrUser } = await import("../with-cron-or-user");
    const { ApiAuthError } = await import("../auth-guard");
    const req = makeRequest("Bearer some-firebase-id-token");
    const fakeUser = {
      uid: "uid-5",
      email: "owner@other-clinic.com",
      clinicId: "clinic-other",
      role: "owner" as const,
    };
    mockVerifyApiRequest.mockResolvedValueOnce(fakeUser);
    mockRequireRole.mockReturnValueOnce(undefined);
    mockRequireClinic.mockImplementationOnce(() => {
      throw new ApiAuthError("Access denied for this clinic", 403);
    });

    const result = await withCronOrUser(req, {
      allowedRoles: ["owner", "admin", "superadmin"],
      targetClinicId: "clinic-abc",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  // 9. CRON_SECRET not configured -> fail closed, never cron-mode
  it("fails closed when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { withCronOrUser } = await import("../with-cron-or-user");
    const { ApiAuthError } = await import("../auth-guard");
    const req = makeRequest("Bearer anything");
    // verifyApiRequest will also fail since no valid Firebase token
    mockVerifyApiRequest.mockRejectedValueOnce(new ApiAuthError("Authentication failed", 401));

    const result = await withCronOrUser(req, { allowedRoles: ["owner", "admin", "superadmin"] });
    // Must not be cron mode - must fail closed
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Either 401 from user auth or 500 from unconfigured cron - never a cron bypass
      expect([401, 500]).toContain(result.status);
    }
  });
});
