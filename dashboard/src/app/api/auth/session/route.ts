import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";

/**
 * POST /api/auth/session
 * Receives a Firebase ID token, verifies it server-side,
 * and sets an HMAC-signed HttpOnly session cookie.
 */
async function postHandler(request: NextRequest) {
  // Rate limit: 10 requests per IP per minute to mitigate brute-force token replay
  // Uses async check to prefer Upstash Redis (distributed) over in-memory (per cold-start only)
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    const { idToken } = await request.json();
    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const signed = await signSession(decoded.uid);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, signed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return response;
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid token" },
      { status: 401 }
    );
  }
}

/**
 * DELETE /api/auth/session
 * Clears the session cookie on logout.
 */
async function deleteHandler(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export const POST = withRequestLog(postHandler);
export const DELETE = withRequestLog(deleteHandler);
