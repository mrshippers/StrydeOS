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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (!isProtected) return NextResponse.next();

  const session = request.cookies.get("__session")?.value;
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
