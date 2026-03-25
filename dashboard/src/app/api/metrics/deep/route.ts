import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyApiRequest,
  verifyCronRequest,
  handleApiError,
  requireRole,
} from "@/lib/auth-guard";
import { computeDeepMetricsForClinic } from "@/lib/metrics/compute-deep-metrics";
import { withRequestLog } from "@/lib/request-logger";

/**
 * POST /api/metrics/deep
 *
 * Computes deep metrics (retention curve, cost of empty chair, net growth,
 * rebooking lag, discharge quality, patient LTV) for a clinic.
 *
 * Called on the same schedule as /api/metrics/compute (after it).
 *
 * Body: { clinicId?: string, weekStart?: string }
 */
async function handler(request: NextRequest) {
  try {
    const isCron = request.headers.get("authorization")?.startsWith("Bearer ");
    let userClinicId: string | undefined;

    if (isCron) {
      try {
        verifyCronRequest(request);
      } catch {
        const user = await verifyApiRequest(request);
        requireRole(user, ["owner", "admin", "superadmin"]);
        userClinicId = user.clinicId;
      }
    } else {
      const user = await verifyApiRequest(request);
      requireRole(user, ["owner", "admin", "superadmin"]);
      userClinicId = user.clinicId;
    }

    const db = getAdminDb();
    const body = await request.json().catch(() => ({}));
    const targetClinicId = (body.clinicId as string | undefined) ?? userClinicId;

    // Default to current week's Monday
    const weekStart =
      (body.weekStart as string | undefined) ?? getCurrentWeekStart();

    const results: Array<{
      clinicId: string;
      written: number;
      error?: string;
    }> = [];

    async function processClinic(clinicId: string) {
      const { written } = await computeDeepMetricsForClinic(
        db,
        clinicId,
        weekStart
      );
      results.push({ clinicId, written });
    }

    if (targetClinicId) {
      await processClinic(targetClinicId);
    } else {
      const clinicsSnap = await db
        .collection("clinics")
        .where("status", "in", ["live", "onboarding"])
        .get();

      for (const clinicDoc of clinicsSnap.docs) {
        try {
          await processClinic(clinicDoc.id);
        } catch (err) {
          results.push({
            clinicId: clinicDoc.id,
            written: 0,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      weekStart,
      processedAt: new Date().toISOString(),
      results,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff);
  return monday.toISOString().slice(0, 10);
}

export const POST = withRequestLog(handler);
