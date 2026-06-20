import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { ApiAuthError, handleApiError } from "@/lib/auth-guard";
import { withCronOrUser } from "@/lib/with-cron-or-user";
import { checkRateLimitAsync } from "@/lib/rate-limit";
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
  const auth = await withCronOrUser(request, {
    allowedRoles: ["owner", "admin", "superadmin"],
  });
  if (!auth.ok) {
    return handleApiError(new ApiAuthError(auth.message, auth.status));
  }

  // Rate limit: 3 requests per IP per 300 seconds. Clinician digest sends one
  // email per clinician - unthrottled calls would flood individual clinicians.
  // Cron is exempt: it runs on a verified schedule, not an untrusted IP.
  if (auth.mode !== "cron") {
    const { limited, remaining } = await checkRateLimitAsync(request, {
      limit: 3,
      windowMs: 300_000,
      failClosed: true,
    });
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
      );
    }
  }

  // Cron scope = null (all clinics). User scope = own clinic unless superadmin.
  let scopeClinicId: string | null = null;
  if (auth.mode === "user" && auth.user.role !== "superadmin") {
    scopeClinicId = auth.user.clinicId ?? null;
  }

  const db = getAdminDb();
  const weekKey = currentWeekKey();
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
    if (scopeClinicId && clinicDoc.id !== scopeClinicId) continue;
    // Once per clinic per week — manual triggers and cron double-fires must
    // not send clinicians duplicate digests.
    if (clinicDoc.data().clinicianDigestLastWeek === weekKey) {
      allResults.push({ clinicId: clinicDoc.id, sent: 0, skipped: 0, errors: ["already_sent_this_week"] });
      continue;
    }
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
