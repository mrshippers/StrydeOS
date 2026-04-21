import type { Firestore } from "firebase-admin/firestore";
import type { InsightEngineMilestone } from "@/types/insight-events";

interface ReengagementResult {
  resolved: number;
  milestoneWritten: boolean;
  errors: string[];
}

/**
 * Track re-engagement: when a new appointment is created for a patient
 * with open PATIENT_DROPOUT_RISK events, close the loop.
 *
 * Also checks if this is the clinic's first-ever closed loop and writes
 * the InsightEngineMilestone document to trigger the unlock popup.
 *
 * Called from the pipeline after appointment sync, or can be called
 * on-demand from the detection API route.
 */
export async function trackReengagement(
  db: Firestore,
  clinicId: string
): Promise<ReengagementResult> {
  const result: ReengagementResult = { resolved: 0, milestoneWritten: false, errors: [] };

  // Find open PATIENT_DROPOUT_RISK events
  const openEventsSnap = await db
    .collection(`clinics/${clinicId}/insight_events`)
    .where("type", "==", "PATIENT_DROPOUT_RISK")
    .where("resolvedAt", "==", null)
    .get();

  if (openEventsSnap.empty) return result;

  for (const eventDoc of openEventsSnap.docs) {
    const event = eventDoc.data();
    const patientId = event.patientId as string | undefined;
    if (!patientId) continue;

    // Check if patient now has a future appointment
    const patientDoc = await db
      .doc(`clinics/${clinicId}/patients/${patientId}`)
      .get();

    if (!patientDoc.exists) continue;

    const patient = patientDoc.data()!;
    const nextSession = patient.nextSessionDate as string | undefined;

    if (!nextSession) continue;

    // Patient has rebooked — close the loop
    try {
      const now = new Date().toISOString();
      await eventDoc.ref.update({
        resolvedAt: now,
        resolution: "rebooked",
      });

      // If there's a linked comms_log entry, update its outcome
      const pulseActionId = event.pulseActionId as string | undefined;
      if (pulseActionId) {
        const logDoc = db.doc(`clinics/${clinicId}/comms_log/${pulseActionId}`);
        const logSnap = await logDoc.get();
        if (logSnap.exists) {
          await logDoc.update({
            outcome: "booked",
            attributedAppointmentId: nextSession,
          });
        }
      }

      result.resolved++;
    } catch (err) {
      result.errors.push(
        `Failed to resolve event ${eventDoc.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ── First-ever closed loop → write milestone ────────────────────────────
  if (result.resolved > 0) {
    try {
      const clinicRef = db.doc(`clinics/${clinicId}`);
      const clinicSnap = await clinicRef.get();
      const clinicData = clinicSnap.data();

      if (clinicData && !clinicData.insightEngineUnlockedAt) {
        // Aggregate stats from all nudged PATIENT_DROPOUT_RISK events
        const nudgedEventsSnap = await db
          .collection(`clinics/${clinicId}/insight_events`)
          .where("type", "==", "PATIENT_DROPOUT_RISK")
          .get();

        let patientsNudged = 0;
        let patientsRebooked = 0;
        let revenueRecovered = 0;
        let revenueAtRisk = 0;
        let triggeringEventId = "";
        let clinicianName: string | null = null;

        for (const doc of nudgedEventsSnap.docs) {
          const ev = doc.data();
          if (ev.pulseActionId) {
            patientsNudged++;
            revenueAtRisk += (ev.revenueImpact as number) ?? 0;
            if (ev.resolution === "rebooked") {
              patientsRebooked++;
              // Conservative: recovered = revenuePerSession × remaining sessions from metadata
              const meta = ev.metadata as Record<string, unknown> | undefined;
              const sessionCount = (meta?.sessionCount as number) ?? 0;
              const treatmentLength = (meta?.treatmentLength as number) ?? (meta?.courseLength as number) ?? 6;
              const revenuePerSession = 65; // default, matches InsightConfig default
              revenueRecovered += Math.max(0, treatmentLength - sessionCount) * revenuePerSession;
              if (!triggeringEventId) triggeringEventId = doc.id;
              if (!clinicianName && ev.clinicianName) {
                clinicianName = ev.clinicianName as string;
              }
            }
          }
        }

        // Only write milestone if we have meaningful data
        if (patientsRebooked > 0) {
          const milestone: InsightEngineMilestone = {
            unlockedAt: new Date().toISOString(),
            triggeringEventId,
            triggeringEventType: "PATIENT_DROPOUT_RISK",
            patientsNudged,
            patientsRebooked,
            revenueRecovered: Math.floor(revenueRecovered),
            revenueAtRisk: Math.floor(revenueAtRisk),
            clinicianName,
            displayedAt: null,
            dismissedAt: null,
          };

          await db
            .doc(`clinics/${clinicId}/milestones/insight_engine_unlocked`)
            .set(milestone);

          await clinicRef.update({
            insightEngineUnlockedAt: new Date().toISOString(),
          });

          result.milestoneWritten = true;
        }
      }
    } catch (err) {
      result.errors.push(
        `Failed to write milestone: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}
