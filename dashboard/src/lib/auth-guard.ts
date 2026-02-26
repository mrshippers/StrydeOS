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
  const decoded = await getAdminAuth().verifyIdToken(token);

  const userDoc = await getAdminDb()
    .collection("users")
    .doc(decoded.uid)
    .get();

  if (!userDoc.exists) {
    throw new ApiAuthError("User profile not found", 403);
  }

  const data = userDoc.data()!;
  return {
    uid: decoded.uid,
    email: decoded.email ?? "",
    clinicId: data.clinicId,
    clinicianId: data.clinicianId,
    role: data.role as UserRole,
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

  console.error("[API Error]", error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}

const CRON_SECRET = process.env.CRON_SECRET;

export function verifyCronRequest(request: NextRequest): void {
  if (!CRON_SECRET) {
    throw new ApiAuthError("CRON_SECRET not configured", 500);
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${CRON_SECRET}`) {
    throw new ApiAuthError("Invalid cron secret", 401);
  }
}
