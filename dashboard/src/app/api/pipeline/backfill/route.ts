import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyApiRequest,
  verifyCronRequest,
  handleApiError,
  requireRole,
  requireClinic,
} from "@/lib/auth-guard";
import type { VerifiedUser } from "@/lib/auth-guard";
import { runPipeline } from "@/lib/pipeline/run-pipeline";
import { withRequestLog } from "@/lib/request-logger";

/**
 * POST /api/pipeline/backfill
 *
 * One-time 90-day historical backfill. Runs the full pipeline with
 * backfill: true, which extends the appointment lookback to ~13 weeks.
 *
 * Body (optional): { clinicId?: string }
 */
async function handler(request: NextRequest) {
  try {
    let authenticatedUser: VerifiedUser | null = null;
    let isCronAuth = false;

    const isCron = request.headers.get("authorization")?.startsWith("Bearer ");
    if (isCron) {
      try {
        verifyCronRequest(request);
        isCronAuth = true;
      } catch {
        authenticatedUser = await verifyApiRequest(request);
        requireRole(authenticatedUser, ["owner", "admin", "superadmin"]);
      }
    } else {
      authenticatedUser = await verifyApiRequest(request);
      requireRole(authenticatedUser, ["owner", "admin", "superadmin"]);
    }

    const db = getAdminDb();
    const body = await request.json().catch(() => ({}));
    const targetClinicId = body.clinicId as string | undefined;

    if (targetClinicId) {
      // Tenant isolation: non-superadmin, non-cron users can only target their own clinic
      if (authenticatedUser && !isCronAuth) {
        requireClinic(authenticatedUser, targetClinicId);
      }
      const result = await runPipeline(db, targetClinicId, { backfill: true });
      return NextResponse.json(result);
    }

    const clinicsSnap = await db.collection("clinics").get();
    const results = [];
    for (const clinicDoc of clinicsSnap.docs) {
      const result = await runPipeline(db, clinicDoc.id, { backfill: true });
      results.push(result);
    }

    return NextResponse.json({ results });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
