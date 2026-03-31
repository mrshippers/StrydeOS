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
    const targetClinicId = (body.clinicId as string | undefined) ?? authenticatedUser?.clinicId;

    // Tenant isolation: non-superadmin, non-cron users can only target their own clinic
    if (targetClinicId && authenticatedUser && !isCronAuth) {
      requireClinic(authenticatedUser, targetClinicId);
    }

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
