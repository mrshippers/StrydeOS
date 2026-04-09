/**
 * P0 tests for the auth/session route handler (POST + DELETE).
 *
 * Validates session cookie creation from Firebase ID tokens, rejection of
 * invalid/missing tokens, rate limiting, and cookie clearing on logout.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks (must be hoisted before route import) ────────────────────────────

vi.mock("@/lib/firebase-admin", () => ({
  getAdminAuth: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  signSession: vi.fn(),
  SESSION_COOKIE: "__session",
  SESSION_MAX_AGE: 28800,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn(),
}));

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: <H extends Function>(handler: H) => handler,
}));

import { getAdminAuth } from "@/lib/firebase-admin";
import { signSession, SESSION_COOKIE } from "@/lib/session";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { POST, DELETE } from "../session/route";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(
  method: string,
  body?: Record<string, unknown>,
): NextRequest {
  const url = "http://localhost:3000/api/auth/session";
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: rate limit allows through
  vi.mocked(checkRateLimitAsync).mockResolvedValue({
    limited: false,
    remaining: 9,
  });

  // Default: Firebase verifyIdToken succeeds
  vi.mocked(getAdminAuth).mockReturnValue({
    verifyIdToken: vi.fn().mockResolvedValue({ uid: "firebase-uid-123" }),
  } as unknown as ReturnType<typeof getAdminAuth>);

  // Default: signSession returns a deterministic cookie string
  vi.mocked(signSession).mockResolvedValue("signed-session-token");
});

// ─── POST /api/auth/session ─────────────────────────────────────────────────

describe("POST /api/auth/session", () => {
  it("creates session cookie from a valid Firebase ID token", async () => {
    const request = makeRequest("POST", { idToken: "valid-firebase-token" });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });

    // Verify the auth flow ran
    const mockAuth = vi.mocked(getAdminAuth)();
    expect(mockAuth.verifyIdToken).toHaveBeenCalledWith("valid-firebase-token");
    expect(signSession).toHaveBeenCalledWith("firebase-uid-123");

    // Verify session cookie is set
    const setCookie = response.cookies.get(SESSION_COOKIE);
    expect(setCookie).toBeDefined();
    expect(setCookie!.value).toBe("signed-session-token");
  });

  it("sets cookie with correct security attributes", async () => {
    const request = makeRequest("POST", { idToken: "valid-firebase-token" });
    const response = await POST(request);

    const setCookie = response.cookies.get(SESSION_COOKIE);
    expect(setCookie).toBeDefined();
    expect(setCookie!.httpOnly).toBe(true);
    expect(setCookie!.sameSite).toBe("lax");
    expect(setCookie!.path).toBe("/");
  });

  it("returns 400 when idToken is missing from body", async () => {
    const request = makeRequest("POST", {});
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Missing idToken");
  });

  it("returns 400 when idToken is not a string", async () => {
    const request = makeRequest("POST", { idToken: 12345 });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Missing idToken");
  });

  it("returns 401 when Firebase rejects the ID token", async () => {
    vi.mocked(getAdminAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockRejectedValue(new Error("Token expired")),
    } as unknown as ReturnType<typeof getAdminAuth>);

    const request = makeRequest("POST", { idToken: "expired-token" });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Invalid token");
  });

  it("returns 401 when signSession throws", async () => {
    vi.mocked(signSession).mockRejectedValue(new Error("sign failed"));

    const request = makeRequest("POST", { idToken: "valid-firebase-token" });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Invalid token");
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimitAsync).mockResolvedValue({
      limited: true,
      remaining: 0,
    });

    const request = makeRequest("POST", { idToken: "valid-firebase-token" });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error).toContain("Too many requests");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");

    // Should never reach Firebase when rate limited
    const mockAuth = vi.mocked(getAdminAuth)();
    expect(mockAuth.verifyIdToken).not.toHaveBeenCalled();
  });

  it("passes correct rate limit config (10 req / 60s window)", async () => {
    const request = makeRequest("POST", { idToken: "valid-firebase-token" });
    await POST(request);

    expect(checkRateLimitAsync).toHaveBeenCalledWith(request, {
      limit: 10,
      windowMs: 60_000,
    });
  });
});

// ─── DELETE /api/auth/session ───────────────────────────────────────────────

describe("DELETE /api/auth/session", () => {
  it("clears session cookie and returns 200", async () => {
    const request = makeRequest("DELETE");
    const response = await DELETE(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });

    const setCookie = response.cookies.get(SESSION_COOKIE);
    expect(setCookie).toBeDefined();
    // Cookie value cleared (empty string)
    expect(setCookie!.value).toBe("");
  });

  it("sets maxAge=0 to expire the cookie immediately", async () => {
    const request = makeRequest("DELETE");
    const response = await DELETE(request);

    const setCookie = response.cookies.get(SESSION_COOKIE);
    expect(setCookie).toBeDefined();
    expect(setCookie!.maxAge).toBe(0);
  });

  it("returns 200 even when no session cookie exists", async () => {
    // No cookie on request — should still succeed
    const request = new NextRequest(
      "http://localhost:3000/api/auth/session",
      { method: "DELETE" },
    );
    const response = await DELETE(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("sets cookie with httpOnly and sameSite=lax on delete", async () => {
    const request = makeRequest("DELETE");
    const response = await DELETE(request);

    const setCookie = response.cookies.get(SESSION_COOKIE);
    expect(setCookie!.httpOnly).toBe(true);
    expect(setCookie!.sameSite).toBe("lax");
    expect(setCookie!.path).toBe("/");
  });
});
