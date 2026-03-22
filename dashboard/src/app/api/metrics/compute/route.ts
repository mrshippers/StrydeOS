import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, verifyCronRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { computeWeeklyMetricsForClinic, computeWeeklyMetricsForAllClinics } from "@/lib/metrics/compute-weekly";
import { withRequestLog } from "@/lib/request-logger";

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
    const clinicId = body.clinicId as string | undefined;
    const weeksBack = Math.min(12, Math.max(1, Number(body.weeksBack) || 6));

    if (clinicId) {
      const { written } = await computeWeeklyMetricsForClinic(db, clinicId, weeksBack);
      return NextResponse.json({ clinicId, written });
    }

    const results = await computeWeeklyMetricsForAllClinics(db, weeksBack);
    return NextResponse.json({ results });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
