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
  "/onboarding",
  "/compliance",
];

// Routes that authenticated users should NOT see (redirect to /dashboard)
const AUTH_REDIRECT_PATHS = ["/login", "/trial"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("__session")?.value;

  // ── Authenticated users hitting login/trial → bounce to dashboard ──
  const isAuthRedirect = AUTH_REDIRECT_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (isAuthRedirect && session) {
    // Demo users can access these pages (demo is a lightweight session)
    if (session === "demo") return NextResponse.next();

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

  // Allow demo mode (simple "demo" cookie value)
  if (session === "demo") return NextResponse.next();

  // Verify HMAC-signed session — reject if tampered or expired
  const payload = await verifySession(session);
  if (!payload) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set("__session", "", { path: "/", maxAge: 0 });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/).*)"],
};
