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
/** Monday of the current week as YYYY-MM-DD — the dedup key for weekly sends. */
function currentWeekKey(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

async function handler(request: NextRequest) {
  // Cron processes every active clinic. A signed-in owner/admin can trigger a
  // re-send, but only for their own clinic — never the whole tenant base.
  let scopeClinicId: string | null = null;

  try {
    verifyCronRequest(request);
  } catch {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    if (user.role !== "superadmin") scopeClinicId = user.clinicId;
  }

  const db = getAdminDb();
  const weekKey = currentWeekKey();
  const results: Array<{ clinicId: string; sent: boolean; error?: string }> = [];

  const clinicsSnap = await db
    .collection("clinics")
    .where("status", "in", ["live", "onboarding"])
    .get();

  for (const clinicDoc of clinicsSnap.docs) {
    if (scopeClinicId && clinicDoc.id !== scopeClinicId) continue;
    // Once per clinic per week — a manual trigger after the cron (or a cron
    // double-fire) must not email owners twice.
    if (clinicDoc.data().weeklyDigestLastWeek === weekKey) {
      results.push({ clinicId: clinicDoc.id, sent: false, error: "already_sent_this_week" });
      continue;
    }
    try {
      const digestResult = await sendWeeklyDigest(db, clinicDoc.id);
      if (digestResult.sent) {
        await clinicDoc.ref.update({ weeklyDigestLastWeek: weekKey });
      }
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
