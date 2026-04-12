import { NextResponse } from "next/server";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

/**
 * POST /api/auth/demo
 * Issues an HMAC-signed session cookie for the demo user (uid "demo").
 * No Firebase token required — demo data is synthetic and never touches real Firestore docs.
 * The demo UID "demo" can never be created as a real Firebase Auth user (reserved).
 */
export async function POST() {
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
