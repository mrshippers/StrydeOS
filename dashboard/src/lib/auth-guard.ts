import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "./firebase-admin";
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
 * Reads clinicId / role / clinicianId from the JWT custom claims
 * (set via Admin SDK setCustomUserClaims). Zero Firestore reads.
 * clinicId is immutable from the client — only server-side
 * setCustomClaims can change it.
 *
 * Prerequisite: run `npx tsx scripts/migrate-custom-claims.ts` to stamp
 * existing users. New users get claims at signup / provision time.
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

  const clinicId = decoded.clinicId as string | undefined;
  const role = decoded.role as UserRole | undefined;
  const clinicianId = decoded.clinicianId as string | undefined;

  if (!role) {
    throw new ApiAuthError("User has no clinic assignment — contact support", 403);
  }

  if (role !== "superadmin" && !clinicId) {
    throw new ApiAuthError("User has no clinic assignment — contact support", 403);
  }

  return {
    uid: decoded.uid,
    email: decoded.email ?? "",
    clinicId: clinicId ?? "",
    clinicianId,
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
