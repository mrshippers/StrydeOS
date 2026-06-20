import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  requireClinic,
  handleApiError,
  ApiAuthError,
} from "@/lib/auth-guard";
import type { VerifiedUser } from "@/lib/auth-guard";
import { withCronOrUser } from "@/lib/with-cron-or-user";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { detectInsightEvents } from "@/lib/intelligence/detect-insight-events";
import { sendUrgentAlerts } from "@/lib/intelligence/notify-owner";
import { enrichEventsWithNarratives } from "@/lib/intelligence/enrich-narratives";
import { consumeInsightEvents } from "@/lib/pulse/insight-event-consumer";
import { trackReengagement } from "@/lib/pulse/track-reengagement";
import { withRequestLog } from "@/lib/request-logger";
import { writeModuleHealth } from "@/lib/module-health";
import type { InsightEvent } from "@/types/insight-events";

/**
 * POST /api/intelligence/detect
 *
 * Runs the insight event detection engine for all clinics (cron)
 * or a specific clinic (authenticated user).
 *
 * Also triggers:
 *  - Pulse consumer for patient-actionable events
 *  - Urgent email alerts for critical events
 *  - Reengagement tracking
 */
async function handler(request: NextRequest) {
  try {
    // Auth: cron secret verified first (constant-time); falls through to user auth.
    // GET requests from Vercel cron carry the CRON_SECRET Bearer token.
    const auth = await withCronOrUser(request, {
      allowedRoles: ["owner", "admin", "superadmin"],
    });
    if (!auth.ok) {
      return handleApiError(new ApiAuthError(auth.message, auth.status));
    }

    const isCron = auth.mode === "cron";

    // Rate limit: 5 requests per IP per 60 seconds. Heavy route - triggers LLM
    // narrative enrichment + email alerts + Firestore writes per clinic.
    // Cron is exempt: it runs on a verified schedule, not an untrusted IP.
    if (!isCron) {
      const { limited, remaining } = await checkRateLimitAsync(request, {
        limit: 5,
        windowMs: 60_000,
        failClosed: true,
      });
      if (limited) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
        );
      }
    }

    const userId = isCron ? "cron" : auth.user.uid;
    const userClinicId = isCron ? undefined : auth.user.clinicId;
    const isSuperadmin = !isCron && auth.user.role === "superadmin";

    const db = getAdminDb();
    const body = request.method === "GET" ? {} : await request.json().catch(() => ({}));
    const targetClinicId = (body.clinicId as string | undefined) ?? userClinicId;

    const results: Array<{
      clinicId: string;
      detection: Awaited<ReturnType<typeof detectInsightEvents>>;
      pulse: Awaited<ReturnType<typeof consumeInsightEvents>>;
      reengagement: Awaited<ReturnType<typeof trackReengagement>>;
      urgentEmails: { sent: number; errors: string[] };
    }> = [];

    async function processClinic(clinicId: string) {
      // 1. Detect events
      const detection = await detectInsightEvents(db, clinicId);

      // 2. Load newly created events for downstream processing
      const newEventsSnap = await db
        .collection(`clinics/${clinicId}/insight_events`)
        .where("createdAt", ">=", new Date(Date.now() - 60000).toISOString())
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();

      const newEvents: InsightEvent[] = newEventsSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<InsightEvent, "id">),
      }));

      // 2b. Enrich events with AI coaching narratives (non-blocking)
      await enrichEventsWithNarratives(db, clinicId, newEvents);

      // 3. Pulse consumer for patient-actionable events
      const pulse = await consumeInsightEvents(db, clinicId, newEvents);

      // 4. Track reengagement (close the loop on resolved events)
      const reengagement = await trackReengagement(db, clinicId);

      // 5. Send urgent email alerts
      const urgentEmails = await sendUrgentAlerts(db, clinicId, newEvents);

      results.push({ clinicId, detection, pulse, reengagement, urgentEmails });

      // Heartbeat into the unified module-health surface read by /api/health.
      // Fire-and-forget, never blocks.
      const detectionErrors = detection.errors.length;
      const pulseErrors = pulse.errors.length;
      const totalErrors = detectionErrors + pulseErrors;
      const totalSucceeded = detection.eventsCreated + pulse.actioned;
      const totalSkipped = detection.eventsSkipped + pulse.skipped;
      await writeModuleHealth(db, clinicId, {
        module: "intelligence",
        status:
          totalErrors === 0
            ? "ok"
            : totalSucceeded > 0
              ? "degraded"
              : "error",
        counts: {
          processed: totalSucceeded + totalErrors + totalSkipped,
          succeeded: totalSucceeded,
          failed: totalErrors,
          skipped: totalSkipped,
        },
        lastError:
          totalErrors === 0
            ? null
            : detection.errors[0] ?? pulse.errors[0] ?? null,
        diagnostics: {
          eventsCreated: detection.eventsCreated,
          pulseActioned: pulse.actioned,
          urgentEmailsSent: urgentEmails.sent,
        },
      });
    }

    if (targetClinicId && !isSuperadmin && userId !== "cron") {
      // Tenant isolation: non-superadmin users can only target their own clinic
      requireClinic(
        { uid: userId, email: "", clinicId: userClinicId!, role: "clinician" } as VerifiedUser,
        targetClinicId,
      );
      // Single clinic (authenticated user)
      await processClinic(targetClinicId);
    } else if (targetClinicId) {
      // Specific clinic (superadmin or cron with target)
      await processClinic(targetClinicId);
    } else {
      // P0-14: explicit guard - a non-superadmin, non-cron user must never reach
      // the all-clinics branch. The implicit invariant (verifyApiRequest always
      // resolves a clinicId for non-superadmin) is not sufficient - make it
      // explicit so isolation does not rest on an assumption.
      if (!isSuperadmin && userId !== "cron") {
        if (!userClinicId) {
          return NextResponse.json({ error: "No clinic associated" }, { status: 400 });
        }
        // Route to the user's own clinic only
        await processClinic(userClinicId);
        return NextResponse.json({
          ok: true,
          processedAt: new Date().toISOString(),
          results,
        });
      }
      // All clinics (cron or superadmin without target)
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
            detection: {
              clinicId: clinicDoc.id,
              eventsCreated: 0,
              eventsSkipped: 0,
              errors: [err instanceof Error ? err.message : String(err)],
            },
            pulse: { actioned: 0, skipped: 0, errors: [] },
            reengagement: { resolved: 0, milestoneWritten: false, errors: [] },
            urgentEmails: { sent: 0, errors: [] },
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      results,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export const GET = withRequestLog(handler);
export const POST = withRequestLog(handler);
