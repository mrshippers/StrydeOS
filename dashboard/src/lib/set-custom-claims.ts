import { getAdminAuth } from "./firebase-admin";
import type { UserRole } from "@/types";

export interface StrydeCustomClaims {
  clinicId: string;
  role: UserRole;
  clinicianId?: string;
}

/**
 * Set custom claims on a Firebase Auth user token.
 *
 * These claims are embedded in the JWT and available via `verifyIdToken`
 * without a Firestore read — the primary perf + security win.
 * clinicId becomes immutable from the client (server-set only).
 *
 * Call this whenever clinicId, role, or clinicianId changes.
 */
export async function setCustomClaims(
  uid: string,
  claims: StrydeCustomClaims
): Promise<void> {
  const auth = getAdminAuth();
  await auth.setCustomUserClaims(uid, {
    clinicId: claims.clinicId,
    role: claims.role,
    ...(claims.clinicianId ? { clinicianId: claims.clinicianId } : {}),
  });
}
