import * as Sentry from "@sentry/nextjs";
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase-admin";
import type { UserRole } from "@/types";

export interface VerifiedUser {
  uid: string;
  email: string;
  clinicId: string;
  clinicianId?: string;
  role: UserRole;
}

export async function verifyApiRequest(
  request: NextRequest
): Promise<VerifiedUser> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiAuthError("Missing or invalid Authorization header", 401);
  }

  const token = authHeader.slice(7);

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[verifyApiRequest] Firebase token verification failed:", msg);
    throw new ApiAuthError(`Token verification failed: ${msg}`, 401);
  }

  let userDoc;
  try {
    userDoc = await getAdminDb()
      .collection("users")
      .doc(decoded.uid)
      .get();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[verifyApiRequest] Firestore user lookup failed:", msg);
    throw new ApiAuthError("Unable to verify user profile", 500);
  }

  if (!userDoc.exists) {
    throw new ApiAuthError("User profile not found", 403);
  }

  const data = userDoc.data()!;
  const role = data.role as UserRole;

  // Session version check: if the user doc specifies a sessionVersion, reject
  // tokens issued before the latest password change to force re-authentication.
  // Tokens without a `v` claim (issued before versioning) are allowed through
  // for backward compatibility — new sessions will include `v` going forward.
  const tokenVersion = (decoded as Record<string, unknown>).v as number | undefined;
  if (
    typeof data.sessionVersion === "number" &&
    typeof tokenVersion === "number" &&
    tokenVersion !== data.sessionVersion
  ) {
    throw new ApiAuthError("Session invalidated — please sign in again", 401);
  }

  if (role !== "superadmin" && (!data.clinicId || !data.role)) {
    throw new ApiAuthError("User profile incomplete — missing clinicId or role", 403);
  }

  // Throttled idle-timeout check (30 min idle, updates at most every 5 min)
  const lastActive = data.lastActiveAt ? new Date(data.lastActiveAt).getTime() : 0;
  const now = Date.now();
  const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
  const ACTIVITY_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

  if (lastActive > 0 && (now - lastActive) > IDLE_TIMEOUT_MS) {
    throw new ApiAuthError("Session expired due to inactivity", 401);
  }

  if ((now - lastActive) > ACTIVITY_UPDATE_INTERVAL_MS) {
    // Fire-and-forget — don't block the request
    userDoc.ref.update({ lastActiveAt: new Date().toISOString() }).catch(() => {});
  }

  return {
    uid: decoded.uid,
    email: decoded.email ?? "",
    clinicId: data.clinicId,
    clinicianId: data.clinicianId,
    role,
  };
}

export function requireRole(
  user: VerifiedUser,
  allowed: UserRole[]
): void {
  if (!allowed.includes(user.role)) {
    throw new ApiAuthError("Insufficient permissions", 403);
  }
}

export function requireClinic(
  user: VerifiedUser,
  clinicId: string
): void {
  if (user.role === "superadmin") return;
  if (user.clinicId !== clinicId) {
    throw new ApiAuthError("Access denied for this clinic", 403);
  }
}

export class ApiAuthError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "ApiAuthError";
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiAuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }

  console.error("[handleApiError] Unhandled:", error);
  Sentry.captureException(error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}

export function verifyCronRequest(request: NextRequest): void {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (!secret) {
    throw new ApiAuthError("CRON_SECRET not configured", 500);
  }
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const expected = `Bearer ${secret}`;
  if (
    auth.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
  ) {
    throw new ApiAuthError("Invalid cron secret", 401);
  }
}
