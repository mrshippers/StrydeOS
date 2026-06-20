import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { ApiAuthError, handleApiError } from "@/lib/auth-guard";
import { withCronOrUser } from "@/lib/with-cron-or-user";
import { checkRateLimitAsync } from "@/lib/rate-limit";
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
  const auth = await withCronOrUser(request, {
    allowedRoles: ["owner", "admin", "superadmin"],
  });
  if (!auth.ok) {
    return handleApiError(new ApiAuthError(auth.message, auth.status));
  }

  // Rate limit: 3 requests per IP per 300 seconds. Digest triggers per-clinic
  // email sends - unthrottled user calls would flood owners with duplicate emails.
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
