import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyApiRequest,
  verifyCronRequest,
  handleApiError,
  requireRole,
} from "@/lib/auth-guard";
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
    const isCron = request.headers.get("authorization")?.startsWith("Bearer ");
    if (isCron) {
      try {
        verifyCronRequest(request);
      } catch {
        const user = await verifyApiRequest(request);
        requireRole(user, ["owner", "admin", "superadmin"]);
      }
    } else {
      const user = await verifyApiRequest(request);
      requireRole(user, ["owner", "admin", "superadmin"]);
    }

    const db = getAdminDb();
    const body = await request.json().catch(() => ({}));
    const targetClinicId = body.clinicId as string | undefined;

    if (targetClinicId) {
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
