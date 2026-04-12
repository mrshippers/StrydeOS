import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/intelligence",
  "/continuity",
  "/receptionist",
  "/admin",
  "/billing",
  "/settings",
  "/clinicians",
  "/patients",
  "/compliance",
];

// Routes that authenticated users should NOT see (redirect to /dashboard)
const AUTH_REDIRECT_PATHS = ["/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("__session")?.value;

  // Demo mode uses an HMAC-signed session cookie with uid "demo" — same
  // verification path as real users. The uid "demo" has no Firestore documents.
  const isDemoSession = false; // retained for future demo-specific routing if needed

  // ── Authenticated users hitting login/trial → bounce to dashboard ──
  const isAuthRedirect = AUTH_REDIRECT_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (isAuthRedirect && session) {
    if (isDemoSession) {
      // Demo session — let them back through to login (they can dismiss demo there)
      return NextResponse.next();
    }
    const payload = await verifySession(session);
    if (payload) {
      // Valid session — skip login/trial, go straight to dashboard
      // Preserve ?next param from /login if present
      const next = request.nextUrl.searchParams.get("next");
      const dest = next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/dashboard";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    // Invalid/expired session — clear it and let them through to login/trial
    const response = NextResponse.next();
    response.cookies.set("__session", "", { path: "/", maxAge: 0 });
    return response;
  }

  // ── Protected routes → require valid session ──
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (!isProtected) return NextResponse.next();

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Demo mode bypasses HMAC — allow through to protected routes
  if (isDemoSession) {
    const response = NextResponse.next();
    setSecurityHeaders(response);
    return response;
  }

  // Verify HMAC-signed session — reject if tampered or expired
  const payload = await verifySession(session);
  if (!payload) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set("__session", "", { path: "/", maxAge: 0 });
    return response;
  }

  const response = NextResponse.next();
  setSecurityHeaders(response);
  return response;
}

function setSecurityHeaders(response: NextResponse): void {
  // Generate a per-request nonce for CSP script-src.
  // Next.js 15 app router reads this from the x-nonce response header.
  const nonce = crypto.randomUUID();
  response.headers.set("x-nonce", nonce);

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} 'wasm-unsafe-eval' https://*.firebaseio.com https://*.googleapis.com https://*.sentry.io https://*.vercel-insights.com https://*.vercel-scripts.com`,
      // unsafe-inline kept for style-src — Tailwind/Next.js injects styles that
      // cannot practically be nonce-gated without a custom document wrapper.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://*.sentry.io https://*.vercel-insights.com https://api.stripe.com https://*.strydeos.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
    ].join("; ")
  );
}

export const config = {
  // API routes are intentionally excluded — they use Bearer token auth via
  // verifyApiRequest() in lib/auth-guard.ts, not session cookies. Defense-in-depth
  // for API routes is handled at that layer, not in middleware.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/).*)"],
};
