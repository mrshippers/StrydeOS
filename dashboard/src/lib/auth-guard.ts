import * as Sentry from "@sentry/nextjs";
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

/**
 * Verify a Firebase ID token and extract identity from custom claims.
 *
 * Primary path: reads clinicId / role / clinicianId from the JWT custom
 * claims (set via Admin SDK setCustomUserClaims). Zero Firestore reads.
 *
 * Fallback path: if custom claims are missing (pre-migration user whose
 * token hasn't been refreshed yet), falls back to the Firestore user doc.
 * This keeps the app working during the migration window — once every user
 * has refreshed their token the fallback is never hit.
 */
export async function verifyApiRequest(
  request: NextRequest
): Promise<VerifiedUser> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiAuthError("Missing or invalid Authorization header", 401);
  }

  const token = authHeader.slice(7);
  const decoded = await getAdminAuth().verifyIdToken(token);

  const claimsRole = decoded.role as UserRole | undefined;
  const claimsClinicId = decoded.clinicId as string | undefined;

  // Fast path — custom claims present
  if (claimsRole && (claimsRole === "superadmin" || claimsClinicId)) {
    return {
      uid: decoded.uid,
      email: decoded.email ?? "",
      clinicId: claimsClinicId ?? "",
      clinicianId: decoded.clinicianId as string | undefined,
      role: claimsRole,
    };
  }

  // Fallback — read from Firestore (pre-migration users)
  const userDoc = await getAdminDb()
    .collection("users")
    .doc(decoded.uid)
    .get();

  if (!userDoc.exists) {
    throw new ApiAuthError("User profile not found", 403);
  }

  const data = userDoc.data()!;
  const role = data.role as UserRole;

  if (role !== "superadmin" && (!data.clinicId || !data.role)) {
    throw new ApiAuthError("User profile incomplete — missing clinicId or role", 403);
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
  const auth = request.headers.get("authorization")?.trim();
  if (auth !== `Bearer ${secret}`) {
    throw new ApiAuthError("Invalid cron secret", 401);
  }
}
