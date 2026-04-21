import type { Firestore } from "firebase-admin/firestore";
import type { InsightEvent } from "@/types/insight-events";
import {
  generateCoachingNarrative,
  type CoachingContext,
} from "./coaching-prompts";
import { appendDataQualityIssues, writeComputeState } from "./compute-state";

/**
 * Enrich newly detected insight events with AI-generated coaching narratives.
 *
 * Runs sequentially (not parallel) to respect API rate limits.
 * Failures are logged but never block the pipeline — events remain
 * valid with their original static title/description as fallback.
 */
export async function enrichEventsWithNarratives(
  db: Firestore,
  clinicId: string,
  events: InsightEvent[]
): Promise<{ enriched: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let enriched = 0;
  let skipped = 0;

  if (events.length === 0) return { enriched: 0, skipped: 0, errors: [] };

  // Load clinic context once for all events
  const clinicDoc = await db.doc(`clinics/${clinicId}`).get();
  if (!clinicDoc.exists) {
    return { enriched: 0, skipped: events.length, errors: ["Clinic not found"] };
  }

  const clinicData = clinicDoc.data()!;
  const clinicName = (clinicData.name as string) ?? "Your Clinic";

  // INTELLIGENCE_AUDIT.md issue 4: canonical session price lives on the clinic
  // root document. Using settings.insightConfig.revenuePerSession produced
  // narratives that disagreed with insight detection. No hardcoded £65 fallback —
  // skip enrichment if unconfigured.
  const sessionPricePence = clinicData.sessionPricePence as number | undefined;
  if (
    typeof sessionPricePence !== "number" ||
    !Number.isFinite(sessionPricePence) ||
    sessionPricePence <= 0
  ) {
    await appendDataQualityIssues(db, clinicId, [
      {
        code: "NARRATIVE_SKIPPED",
        message:
          "Skipped coaching narrative enrichment — clinics/{clinicId}.sessionPricePence is not configured",
      },
    ]);
    return { enriched: 0, skipped: events.length, errors: [] };
  }
  const revenuePerSession = Math.round(sessionPricePence / 100);

  for (const event of events) {
    // Skip events that already have narratives (idempotent)
    if (event.ownerNarrative) {
      skipped++;
      continue;
    }

    try {
      const ctx: CoachingContext = {
        clinicName,
        clinicianName: event.clinicianName ?? undefined,
        patientName: event.patientName ?? undefined,
        revenuePerSession,
        metadata: event.metadata,
      };

      const narrative = await generateCoachingNarrative(event, ctx);

      // Write narratives back to the event document
      if (event.id && (narrative.ownerNarrative || narrative.clinicianNarrative)) {
        await db
          .doc(`clinics/${clinicId}/insight_events/${event.id}`)
          .update({
            ownerNarrative: narrative.ownerNarrative || null,
            clinicianNarrative: narrative.clinicianNarrative || null,
            narrativeGeneratedAt: new Date().toISOString(),
          });

        // Also update the in-memory event for downstream consumers
        event.ownerNarrative = narrative.ownerNarrative || null;
        event.clinicianNarrative = narrative.clinicianNarrative || null;
        event.narrativeGeneratedAt = new Date().toISOString();

        enriched++;
      } else {
        skipped++;
      }
    } catch (err) {
      // Never block the pipeline — capture the error into computeState so
      // operators can see it from the dashboard (INTELLIGENCE_AUDIT.md issue 9).
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${event.type}: ${msg}`);
      skipped++;
    }
  }

  // Persist the last enrichment error (if any) to computeState so it surfaces
  // to operators instead of disappearing into the server logs.
  if (errors.length > 0) {
    try {
      await writeComputeState(db, clinicId, {
        status: "degraded",
        lastError: `enrich-narratives: ${errors[errors.length - 1]}`,
      });
    } catch {
      // computeState is best-effort — don't fail enrichment on write failures.
    }
  }

  return { enriched, skipped, errors };
}
