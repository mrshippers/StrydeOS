import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyCronRequest,
  verifyApiRequest,
  requireRole,
} from "@/lib/auth-guard";
import { sendWeeklyDigest } from "@/lib/intelligence/notify-owner";
import { withRequestLog } from "@/lib/request-logger";

/**
 * GET /api/intelligence/digest
 *
 * Weekly State of the Clinic email digest.
 * Scheduled via Vercel cron (Sunday 07:00 UTC).
 */
async function handler(request: NextRequest) {
  let isCron = false;

  try {
    verifyCronRequest(request);
    isCron = true;
  } catch {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
  }

  const db = getAdminDb();
  const results: Array<{ clinicId: string; sent: boolean; error?: string }> = [];

  // Process all active clinics
  const clinicsSnap = await db
    .collection("clinics")
    .where("status", "in", ["live", "onboarding"])
    .get();

  for (const clinicDoc of clinicsSnap.docs) {
    try {
      const digestResult = await sendWeeklyDigest(db, clinicDoc.id);
      results.push({ clinicId: clinicDoc.id, ...digestResult });
    } catch (err) {
      results.push({
        clinicId: clinicDoc.id,
        sent: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processedAt: new Date().toISOString(),
    results,
  });
}

export const GET = withRequestLog(handler);
