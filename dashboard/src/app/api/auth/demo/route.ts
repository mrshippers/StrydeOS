import { NextRequest, NextResponse } from "next/server";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { checkRateLimitAsync } from "@/lib/rate-limit";

/**
 * POST /api/auth/demo
 * Issues an HMAC-signed session cookie for the demo user (uid "demo").
 * No Firebase token required — demo data is synthetic and never touches real Firestore docs.
 * The demo UID "demo" can never be created as a real Firebase Auth user (reserved).
 */
export async function POST(request: NextRequest) {
  // Rate limit: 5 requests per IP per 60 seconds
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 5, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }
  const signed = await signSession("demo");

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}
