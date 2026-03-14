/**
 * compute-attribution.ts
 *
 * Stage 5c: Last-touch revenue attribution.
 *
 * For each appointment updated since the last pipeline run that results in a booking,
 * finds the most recent comms_log entry for the same patient within the sequence's
 * attribution window where patientLifecycleStateAtSend was AT_RISK, LAPSED, or RE_ENGAGED.
 * Updates that comms_log entry with outcome='booked' and attributedRevenuePence.
 *
 * pre_auth_collection entries (attributionWindowDays=null) are excluded.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { StageResult } from "./types";

const ATTRIBUTABLE_STATES = new Set(["AT_RISK", "LAPSED", "RE_ENGAGED"]);

export async function computeAttribution(
  db: Firestore,
  clinicId: string,
  lastRunAt?: string  // ISO string from pipeline config; limits appointment scan to recent updates
): Promise<StageResult> {
  const start = Date.now();
  const errors: string[] = [];
  let count = 0;

  try {
    const clinicRef = db.collection("clinics").doc(clinicId);

    // Scope to appointments updated since last pipeline run (or last 48h as fallback)
    const sinceDate = lastRunAt ?? new Date(Date.now() - 48 * 3_600_000).toISOString();

    const apptSnap = await clinicRef
      .collection("appointments")
      .where("status", "in", ["scheduled", "completed"])
      .where("updatedAt", ">=", sinceDate)
      .get();

    for (const apptDoc of apptSnap.docs) {
      const appt = apptDoc.data();
      const patientId = appt.patientId as string | undefined;
      if (!patientId) continue;

      const apptDateTime = appt.dateTime as string;

      // Find comms_log entries for this patient that are unattributed
      const logsSnap = await clinicRef
        .collection("comms_log")
        .where("patientId", "==", patientId)
        .where("outcome", "!=", "booked")
        .get();

      // Filter to entries where patientLifecycleStateAtSend is attributable
      // and sentAt is within attributionWindowDays before apptDateTime
      const candidates = logsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
        .filter((entry) => {
          const state = entry.patientLifecycleStateAtSend as string | undefined;
          if (!state || !ATTRIBUTABLE_STATES.has(state)) return false;

          const windowDays = entry.attributionWindowDays as number | null | undefined;
          if (windowDays === null || windowDays === undefined) return false; // pre_auth excluded

          const sentAt = new Date(entry.sentAt as string);
          const apptDate = new Date(apptDateTime);
          const daysBefore = Math.floor(
            (apptDate.getTime() - sentAt.getTime()) / 86_400_000
          );
          return daysBefore >= 0 && daysBefore <= windowDays;
        })
        .sort((a, b) =>
          (b.sentAt as string).localeCompare(a.sentAt as string)
        ); // newest first

      if (candidates.length === 0) continue;

      // Last-touch: most recent qualifying entry
      const winner = candidates[0];
      await clinicRef.collection("comms_log").doc(winner.id).set(
        {
          outcome: "booked",
          attributedRevenuePence: (appt.revenueAmountPence as number) ?? 0,
          attributedAppointmentId: apptDoc.id,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      count++;
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return {
    stage: "compute-attribution",
    ok: errors.length === 0,
    count,
    errors,
    durationMs: Date.now() - start,
  };
}
