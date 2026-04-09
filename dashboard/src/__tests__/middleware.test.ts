/**
 * P0 tests for middleware.ts — route protection, session validation,
 * auth redirects, and security headers.
 *
 * Middleware is the first line of defence for all non-API routes.
 * These tests verify that unauthenticated users can't reach protected
 * pages and authenticated users skip the login flow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mock session verification ──────────────────────────────────────────────

vi.mock("@/lib/session", () => ({
  verifySession: vi.fn(),
}));

import { verifySession } from "@/lib/session";
import { middleware } from "../middleware";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(path: string, cookies?: Record<string, string>): NextRequest {
  const url = `http://localhost:3000${path}`;
  const req = new NextRequest(url);
  if (cookies) {
    for (const [name, value] of Object.entries(cookies)) {
      req.cookies.set(name, value);
    }
  }
  return req;
}

function isRedirect(response: ReturnType<typeof middleware> extends Promise<infer R> ? R : never): boolean {
  // NextResponse.redirect returns 307 by default
  return response.status === 307 || response.status === 308;
}

function redirectLocation(response: { headers: Headers }): string | null {
  return response.headers.get("location");
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Unprotected routes ─────────────────────────────────────────────────────

describe("Unprotected routes (no session required)", () => {
  it("passes through requests to /login without session cookie", async () => {
    const response = await middleware(makeRequest("/login"));

    // Should pass through (NextResponse.next() = 200)
    expect(response.status).toBe(200);
    expect(isRedirect(response)).toBe(false);
  });

  it("passes through requests to root /", async () => {
    const response = await middleware(makeRequest("/"));

    expect(response.status).toBe(200);
    expect(isRedirect(response)).toBe(false);
  });

  it("passes through static asset requests", async () => {
    // The matcher config excludes _next/static, _next/image, favicon.ico, and api/
    // but those are handled by Next.js matcher — middleware never sees them.
    // Routes like /signup should pass through as unprotected.
    const response = await middleware(makeRequest("/signup"));

    expect(response.status).toBe(200);
    expect(isRedirect(response)).toBe(false);
  });
});

// ─── Protected routes (unauthenticated) ─────────────────────────────────────

describe("Protected routes — unauthenticated users", () => {
  const protectedPaths = [
    "/dashboard",
    "/dashboard/clinician/abc",
    "/intelligence",
    "/intelligence/metrics",
    "/continuity",
    "/receptionist",
    "/admin",
    "/billing",
    "/settings",
    "/clinicians",
    "/patients",
    "/compliance",
  ];

  for (const path of protectedPaths) {
    it(`redirects unauthenticated user from ${path} to /login`, async () => {
      const response = await middleware(makeRequest(path));

      expect(isRedirect(response)).toBe(true);
      const location = redirectLocation(response);
      expect(location).toContain("/login");
    });
  }

  it("preserves the original path as ?next= on the login redirect", async () => {
    const response = await middleware(makeRequest("/dashboard"));

    const location = redirectLocation(response)!;
    const url = new URL(location);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/dashboard");
  });

  it("preserves nested path in ?next= param", async () => {
    const response = await middleware(makeRequest("/settings/integrations"));

    const location = redirectLocation(response)!;
    const url = new URL(location);
    expect(url.searchParams.get("next")).toBe("/settings/integrations");
  });
});

// ─── Protected routes (authenticated with valid session) ────────────────────

describe("Protected routes — authenticated users with valid session", () => {
  beforeEach(() => {
    vi.mocked(verifySession).mockResolvedValue({
      uid: "user-123",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  it("allows access to /dashboard with valid session", async () => {
    const response = await middleware(
      makeRequest("/dashboard", { __session: "valid-cookie" }),
    );

    expect(response.status).toBe(200);
    expect(isRedirect(response)).toBe(false);
  });

  it("allows access to nested protected route", async () => {
    const response = await middleware(
      makeRequest("/settings/integrations", { __session: "valid-cookie" }),
    );

    expect(response.status).toBe(200);
    expect(isRedirect(response)).toBe(false);
  });

  it("calls verifySession with the cookie value", async () => {
    await middleware(
      makeRequest("/dashboard", { __session: "my-session-cookie" }),
    );

    expect(verifySession).toHaveBeenCalledWith("my-session-cookie");
  });
});

// ─── Expired/invalid session on protected routes ────────────────────────────

describe("Protected routes — expired or invalid session", () => {
  beforeEach(() => {
    vi.mocked(verifySession).mockResolvedValue(null);
  });

  it("redirects to /login when session cookie is expired", async () => {
    const response = await middleware(
      makeRequest("/dashboard", { __session: "expired-cookie" }),
    );

    expect(isRedirect(response)).toBe(true);
    expect(redirectLocation(response)).toContain("/login");
  });

  it("clears the expired session cookie on redirect", async () => {
    const response = await middleware(
      makeRequest("/dashboard", { __session: "expired-cookie" }),
    );

    const setCookie = response.cookies.get("__session");
    expect(setCookie).toBeDefined();
    expect(setCookie!.value).toBe("");
    // maxAge=0 forces browser to expire the cookie
    expect(setCookie!.maxAge).toBe(0);
  });
});

// ─── Auth redirect (authenticated user hitting /login) ──────────────────────

describe("Auth redirect — authenticated user on /login", () => {
  beforeEach(() => {
    vi.mocked(verifySession).mockResolvedValue({
      uid: "user-123",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  it("redirects authenticated user from /login to /dashboard", async () => {
    const response = await middleware(
      makeRequest("/login", { __session: "valid-cookie" }),
    );

    expect(isRedirect(response)).toBe(true);
    expect(redirectLocation(response)).toContain("/dashboard");
  });

  it("redirects to ?next= path when present on /login", async () => {
    const response = await middleware(
      makeRequest("/login?next=/settings", { __session: "valid-cookie" }),
    );

    expect(isRedirect(response)).toBe(true);
    const location = redirectLocation(response)!;
    expect(new URL(location).pathname).toBe("/settings");
  });

  it("ignores ?next= values that could be open redirect attacks", async () => {
    // next=//evil.com should be rejected (starts with //)
    const response = await middleware(
      makeRequest("/login?next=//evil.com", { __session: "valid-cookie" }),
    );

    expect(isRedirect(response)).toBe(true);
    const location = redirectLocation(response)!;
    expect(new URL(location).pathname).toBe("/dashboard");
  });

  it("ignores ?next= values that don't start with /", async () => {
    const response = await middleware(
      makeRequest("/login?next=https://evil.com", { __session: "valid-cookie" }),
    );

    expect(isRedirect(response)).toBe(true);
    const location = redirectLocation(response)!;
    expect(new URL(location).pathname).toBe("/dashboard");
  });

  it("clears invalid session cookie when user hits /login with expired cookie", async () => {
    vi.mocked(verifySession).mockResolvedValue(null);

    const response = await middleware(
      makeRequest("/login", { __session: "expired-cookie" }),
    );

    // Should pass through to login (not redirect), but clear the bad cookie
    expect(response.status).toBe(200);
    const setCookie = response.cookies.get("__session");
    expect(setCookie).toBeDefined();
    expect(setCookie!.value).toBe("");
    expect(setCookie!.maxAge).toBe(0);
  });
});

// ─── Security headers ───────────────────────────────────────────────────────

describe("Security headers on authenticated protected routes", () => {
  beforeEach(() => {
    vi.mocked(verifySession).mockResolvedValue({
      uid: "user-123",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  it("sets X-Content-Type-Options: nosniff", async () => {
    const response = await middleware(
      makeRequest("/dashboard", { __session: "valid-cookie" }),
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY", async () => {
    const response = await middleware(
      makeRequest("/dashboard", { __session: "valid-cookie" }),
    );
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets Strict-Transport-Security with long max-age", async () => {
    const response = await middleware(
      makeRequest("/dashboard", { __session: "valid-cookie" }),
    );
    const hsts = response.headers.get("Strict-Transport-Security")!;
    expect(hsts).toContain("max-age=63072000");
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
  });

  it("sets X-XSS-Protection: 1; mode=block", async () => {
    const response = await middleware(
      makeRequest("/dashboard", { __session: "valid-cookie" }),
    );
    expect(response.headers.get("X-XSS-Protection")).toBe("1; mode=block");
  });

  it("sets Referrer-Policy: strict-origin-when-cross-origin", async () => {
    const response = await middleware(
      makeRequest("/dashboard", { __session: "valid-cookie" }),
    );
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("sets Permissions-Policy blocking camera, mic, geo", async () => {
    const response = await middleware(
      makeRequest("/dashboard", { __session: "valid-cookie" }),
    );
    const pp = response.headers.get("Permissions-Policy")!;
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
  });

  it("sets Content-Security-Policy with default-src 'self'", async () => {
    const response = await middleware(
      makeRequest("/dashboard", { __session: "valid-cookie" }),
    );
    const csp = response.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("does NOT set security headers on unprotected routes", async () => {
    // Unprotected routes call NextResponse.next() without setSecurityHeaders
    const response = await middleware(makeRequest("/"));

    expect(response.headers.get("X-Frame-Options")).toBeNull();
    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
  });
});
