import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  handleApiError,
  ApiAuthError,
} from "@/lib/auth-guard";
import { withCronOrUser } from "@/lib/with-cron-or-user";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { runPipeline } from "@/lib/pipeline/run-pipeline";
import { withRequestLog } from "@/lib/request-logger";
import { BACKFILL_CONCURRENCY, BACKFILL_MAX_CLINICS } from "./backfill-limits";

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

    // Rate limit: 2 requests per IP per 300 seconds. Backfill is the most
    // expensive route - each clinic run re-processes up to 13 weeks of history.
    // Cron is exempt: it runs on a verified schedule, not an untrusted IP.
    if (!isCron) {
      const { limited, remaining } = await checkRateLimitAsync(request, {
        limit: 2,
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

    // P0-14: explicit guard - a non-superadmin, non-cron user must never reach
    // the all-clinics branch. Mirror the explicit guard in pipeline/run/route.ts
    // so isolation does not rest on an implicit invariant.
    if (!isCron && authenticatedUser && authenticatedUser.role !== "superadmin") {
      if (!authenticatedUser.clinicId) {
        return NextResponse.json({ error: "No clinic associated" }, { status: 400 });
      }
      const result = await runPipeline(db, authenticatedUser.clinicId, { backfill: true });
      return NextResponse.json(result);
    }

    const clinicsSnap = await db.collection("clinics").get();
    // Respect the hard ceiling to prevent runaway cost on large tenant bases.
    const allClinicIds = clinicsSnap.docs.slice(0, BACKFILL_MAX_CLINICS).map((d) => d.id);

    const settled: PromiseSettledResult<Awaited<ReturnType<typeof runPipeline>>>[] = [];
    for (let i = 0; i < allClinicIds.length; i += BACKFILL_CONCURRENCY) {
      const chunk = allClinicIds.slice(i, i + BACKFILL_CONCURRENCY);
      const chunkResults = await Promise.allSettled(
        chunk.map((id) => runPipeline(db, id, { backfill: true }))
      );
      settled.push(...chunkResults);
    }

    const results = settled.map((s, idx) => {
      if (s.status === "fulfilled") return s.value;
      return {
        clinicId: allClinicIds[idx],
        ok: false,
        error: s.reason instanceof Error ? s.reason.message : "Backfill failed",
      };
    });

    return NextResponse.json({ results });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
