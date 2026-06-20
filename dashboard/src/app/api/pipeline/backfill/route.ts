import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  handleApiError,
  ApiAuthError,
} from "@/lib/auth-guard";
import { withCronOrUser } from "@/lib/with-cron-or-user";
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
    // Auth: cron secret verified first (constant-time); falls through to user auth.
    const auth = await withCronOrUser(request, {
      allowedRoles: ["owner", "admin", "superadmin"],
    });
    if (!auth.ok) {
      return handleApiError(new ApiAuthError(auth.message, auth.status));
    }

    const isCron = auth.mode === "cron";
    const authenticatedUser = auth.mode === "user" ? auth.user : null;

    const db = getAdminDb();
    const body = await request.json().catch(() => ({}));
    const targetClinicId = body.clinicId as string | undefined;

    if (targetClinicId) {
      // Tenant isolation: non-superadmin, non-cron users can only target their own clinic.
      // requireClinic is called via withCronOrUser only when targetClinicId is known at
      // auth time. Here the clinicId comes from the body, so we check inline.
      if (!isCron && authenticatedUser && authenticatedUser.role !== "superadmin") {
        if (authenticatedUser.clinicId !== targetClinicId) {
          return NextResponse.json({ error: "Access denied for this clinic" }, { status: 403 });
        }
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
