import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyCronRequest,
  verifyApiRequest,
  requireRole,
} from "@/lib/auth-guard";
import { sendClinicianDigests } from "@/lib/intelligence/send-clinician-digests";
import { withRequestLog } from "@/lib/request-logger";

/**
 * GET /api/intelligence/clinician-digest
 *
 * Weekly clinician digest emails — each clinician receives their own stats.
 * Scheduled via Vercel cron (Monday 07:30 UTC — before clinic opens).
 *
 * Data scoping: each clinician's stats are queried by their clinicianId.
 * Revenue figures are never included. Benchmarks labelled "UK avg".
 */
async function handler(request: NextRequest) {
  try {
    verifyCronRequest(request);
  } catch {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
  }

  const db = getAdminDb();
  const allResults: Array<{
    clinicId: string;
    sent: number;
    skipped: number;
    errors: string[];
  }> = [];

  const clinicsSnap = await db
    .collection("clinics")
    .where("status", "in", ["live", "onboarding"])
    .get();

  for (const clinicDoc of clinicsSnap.docs) {
    try {
      const { results } = await sendClinicianDigests(db, clinicDoc.id);
      const sent = results.filter((r) => r.sent).length;
      const skipped = results.filter((r) => !r.sent).length;
      const errors = results
        .filter((r) => r.error && r.error !== "opted_out" && r.error !== "no_email" && r.error !== "no_stats")
        .map((r) => `${r.clinicianName}: ${r.error}`);

      allResults.push({ clinicId: clinicDoc.id, sent, skipped, errors });
    } catch (err) {
      allResults.push({
        clinicId: clinicDoc.id,
        sent: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processedAt: new Date().toISOString(),
    results: allResults,
  });
}

export const GET = withRequestLog(handler);
