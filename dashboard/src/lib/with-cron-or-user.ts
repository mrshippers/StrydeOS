/**
 * withCronOrUser - cron-vs-user authz helper (P0-14)
 *
 * Consolidates the duplicated try-cron-then-user pattern found across
 * api/intelligence/{detect,digest,clinician-digest,value}/route.ts and
 * api/pipeline/{run,backfill}/route.ts into one tested helper.
 *
 * Protocol (fail-closed):
 *   1. If no Authorization header -> reject 401 immediately.
 *   2. Attempt verifyCronRequest (constant-time, uses existing primitive).
 *      - On success -> return { ok: true, mode: "cron" }. User auth never runs.
 *   3. On cron failure -> attempt verifyApiRequest + requireRole + requireClinic.
 *      - On success -> return { ok: true, mode: "user", user }.
 *   4. Any auth failure (cron or user) -> return { ok: false, status, message }.
 *
 * The caller uses the result discriminant to branch on cron vs user behaviour
 * (e.g. skip clinic scoping for cron, read scopeClinicId from user.clinicId).
 *
 * Options:
 *   allowedRoles    - roles allowed to call the route in user mode (required)
 *   targetClinicId  - when provided, requireClinic is called for non-superadmin
 *                     users; omit when the caller derives the clinic after auth
 */

import type { NextRequest } from "next/server";
import type { UserRole } from "@/types";
import {
  verifyCronRequest,
  verifyApiRequest,
  requireRole,
  requireClinic,
  ApiAuthError,
} from "./auth-guard";
import type { VerifiedUser } from "./auth-guard";

export interface CronOrUserOptions {
  /** Roles allowed to call this route in user mode. */
  allowedRoles: UserRole[];
  /**
   * If the route knows the target clinic ID at auth time, pass it here.
   * requireClinic will be enforced for non-superadmin users.
   * Leave undefined when the handler derives the clinic from user.clinicId
   * after auth (the caller is then responsible for clinic scoping).
   */
  targetClinicId?: string;
}

export type CronOrUserResult =
  | { ok: true; mode: "cron" }
  | { ok: true; mode: "user"; user: VerifiedUser }
  | { ok: false; status: number; message: string };

/**
 * Verify incoming request as either a valid Vercel cron call or an
 * authenticated user with the required role. Returns a typed discriminated
 * union so the handler can branch on mode without re-checking auth.
 */
export async function withCronOrUser(
  request: NextRequest,
  options: CronOrUserOptions
): Promise<CronOrUserResult> {
  const { allowedRoles, targetClinicId } = options;

  // Step 1: Reject fast if there is no Authorization header at all.
  // Both cron and user paths require it - this prevents any ambiguity.
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { ok: false, status: 401, message: "Missing Authorization header" };
  }

  // Step 2: Try the cron secret FIRST (constant-time via verifyCronRequest).
  // A successful cron check short-circuits - user auth is never attempted.
  try {
    verifyCronRequest(request);
    // Cron verified. Return immediately in cron mode.
    return { ok: true, mode: "cron" };
  } catch (cronErr) {
    // Not a valid cron request. If CRON_SECRET is misconfigured (500-class
    // error), do NOT fall through to user auth - fail closed.
    if (cronErr instanceof ApiAuthError && cronErr.statusCode >= 500) {
      return { ok: false, status: cronErr.statusCode, message: cronErr.message };
    }
    // Otherwise (401 - wrong secret or not the cron token), fall through to
    // user auth. A legitimate user with a Firebase Bearer token will succeed here.
  }

  // Step 3: User auth path. ALWAYS runs verifyApiRequest + requireRole.
  // requireClinic is called when targetClinicId is provided AND user is not
  // superadmin (superadmin bypasses clinic scoping per existing requireClinic impl).
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, allowedRoles);

    if (targetClinicId && user.role !== "superadmin") {
      requireClinic(user, targetClinicId);
    }

    return { ok: true, mode: "user", user };
  } catch (userErr) {
    if (userErr instanceof ApiAuthError) {
      return { ok: false, status: userErr.statusCode, message: userErr.message };
    }
    // Unexpected error - fail closed at 500
    return { ok: false, status: 500, message: "Internal auth error" };
  }
}
