import type { Firestore, WriteBatch } from "firebase-admin/firestore";
import type { StageResult } from "./types";
import { INTEGRATIONS_CONFIG, PIPELINE_DOC_ID, DEFAULT_TREATMENT_LENGTH } from "./types";
import { computeRiskScore } from "./compute-risk-score";
import type { LifecycleState } from "@/types";

const MAX_BATCH_SIZE = 500;
const CHURN_RISK_DAYS = 14;

/** Median of a numeric list (0 when empty). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * A patient's expected days between visits, derived from the median gap of their
 * own completed sessions. Needs >= 3 completed sessions (>= 2 gaps) to be trusted;
 * otherwise returns null so the caller falls back to the clinic default. This is
 * the condition-relative cadence that replaces the old flat 14-day rule.
 */
function expectedIntervalFromHistory(completedSortedIso: string[]): number | null {
  if (completedSortedIso.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < completedSortedIso.length; i++) {
    const days =
      (new Date(completedSortedIso[i]).getTime() -
        new Date(completedSortedIso[i - 1]).getTime()) /
      86_400_000;
    if (days > 0) gaps.push(days);
  }
  if (gaps.length === 0) return null;
  return median(gaps);
}

/**
 * Stage 5: Compute derived fields for each patient from their appointment history.
 *
 * - sessionCount: number of completed appointments
 * - lastSessionDate: most recent completed appointment dateTime
 * - nextSessionDate: earliest future scheduled appointment dateTime
 * - discharged: no sessions in 30 days AND no future appointment
 * - churnRisk: last session > 14 days ago AND no future appointment AND not discharged
 * - treatmentLength: from pipeline config default (typically 6)
 */
export async function computePatientFields(
  db: Firestore,
  clinicId: string
): Promise<StageResult> {
  const start = Date.now();
  const errors: string[] = [];
  let count = 0;

  try {
    // Load treatment length from pipeline config
    const pipelineSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection(INTEGRATIONS_CONFIG)
      .doc(PIPELINE_DOC_ID)
      .get();
    const treatmentLength =
      (pipelineSnap.data()?.defaultTreatmentLength as number) ??
      (pipelineSnap.data()?.defaultCourseLength as number) ??
      DEFAULT_TREATMENT_LENGTH;

    // Cadence-relative at-risk config (clinic.targets) — all optional, sane defaults.
    const clinicSnap = await db.collection("clinics").doc(clinicId).get();
    const targets = (clinicSnap.data()?.targets as Record<string, number> | undefined) ?? {};
    const cadenceConfig = {
      defaultRebookingDays: targets.defaultRebookingDays ?? 21,
      overdueFactor: targets.overdueFactor ?? 1.5,
      churnFactor: targets.churnFactor ?? 3,
      atRiskMaxDays: targets.atRiskMaxDays ?? 90,
    };

    const patientsRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("patients");
    const appointmentsRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("appointments");

    const patientsSnap = await patientsRef.get();
    const appointmentsSnap = await appointmentsRef.get();

    // Index appointments by patientId (using pmsExternalId stored as patientId in appointments)
    const apptsByPatient = new Map<
      string,
      { dateTime: string; status: string; followUpBooked: boolean; isInitialAssessment: boolean; appointmentType?: string }[]
    >();
    for (const doc of appointmentsSnap.docs) {
      const data = doc.data();
      const pid = data.patientId as string;
      if (!pid) continue;
      if (!apptsByPatient.has(pid)) apptsByPatient.set(pid, []);
      apptsByPatient.get(pid)!.push({
        dateTime: data.dateTime as string,
        status: data.status as string,
        followUpBooked: (data.followUpBooked as boolean) ?? false,
        isInitialAssessment: (data.isInitialAssessment as boolean) ?? false,
        appointmentType: data.appointmentType as string | undefined,
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    let batch: WriteBatch = db.batch();
    let batchCount = 0;

    for (const patientDoc of patientsSnap.docs) {
      const data = patientDoc.data();
      const pmsExtId = data.pmsExternalId as string | undefined;
      if (!pmsExtId) continue;

      const appointments = apptsByPatient.get(pmsExtId) ?? [];
      const completed = appointments
        .filter((a) => a.status === "completed")
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

      const future = appointments
        .filter((a) => a.status === "scheduled" && a.dateTime > nowIso)
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

      const sessionCount = completed.length;
      // Stable ordinality anchor: the patient's first-ever completed appointment.
      // `completed` is sorted ascending over the patient's FULL history (this stage
      // loads the whole appointments collection), so completed[0] is the true first
      // session = the initial assessment. Persisted so classification survives
      // re-syncs instead of being re-derived from the flaky appointmentType field.
      const firstAppointmentDate =
        completed.length > 0 ? completed[0].dateTime : undefined;
      const lastSessionDate =
        completed.length > 0
          ? completed[completed.length - 1].dateTime
          : undefined;
      const nextSessionDate =
        future.length > 0 ? future[0].dateTime : undefined;

      // ── Risk score + lifecycle state ────────────────────────────────────────
      const lastAppt = completed.length > 0 ? completed[completed.length - 1] : null;

      // Expected rebooking interval for THIS patient (condition-relative cadence):
      // median gap of their own completed sessions, else the clinic default.
      const expectedIntervalDays =
        expectedIntervalFromHistory(completed.map((a) => a.dateTime)) ??
        cadenceConfig.defaultRebookingDays;

      // Discharge BY PLAN (not mere inactivity): explicit discharge appointment, or
      // reaching course length with no follow-up intended. The old 30-day-silence
      // auto-discharge is gone — it conflated "course finished" with "ghosted", which
      // is exactly the distinction we now make in computeRiskScore's lifecycle logic.
      const discharged =
        lastAppt?.appointmentType === "discharge" ||
        (sessionCount >= treatmentLength && !(lastAppt?.followUpBooked ?? false));

      // churnRisk kept as the coarse comms signal that gates the CHURNED state.
      let churnRisk = false;
      if (lastSessionDate) {
        const daysSinceLastSession = Math.floor(
          (now.getTime() - new Date(lastSessionDate).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (
          daysSinceLastSession > CHURN_RISK_DAYS &&
          !nextSessionDate &&
          !discharged
        ) {
          churnRisk = true;
        }
      }
      // First 3 SLOTS (all statuses sorted by dateTime) — used to detect early DNAs
      const firstThreeSlots = [...appointments]
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
        .slice(0, 3);
      const dnaInFirstThree = firstThreeSlots.filter((a) => a.status === "dna").length;

      // Appointments in last 4 weeks
      const fourWeeksAgo = new Date(now.getTime() - 28 * 86_400_000).toISOString();
      const recentAppts = appointments.filter((a) => a.dateTime >= fourWeeksAgo);
      const recentScheduled = recentAppts.filter(
        (a) => a.status === "scheduled" || a.status === "completed" || a.status === "dna"
      ).length;
      const recentAttended = recentAppts.filter((a) => a.status === "completed").length;

      const priorLifecycleState = (data.lifecycleState as LifecycleState | undefined) ?? null;
      const lastSequenceSentAt = (data.lastSequenceSentAt as string | undefined) ?? null;

      const riskResult = computeRiskScore({
        sessionCount,
        courseLength: treatmentLength,
        lastSessionDate,
        nextSessionDate,
        discharged,
        churnRisk,
        insuranceFlag: (data.insuranceFlag as boolean) ?? false,
        hepProgramId: data.hepProgramId as string | undefined,
        hepComplianceData: !!(data.hepComplianceData),
        isInitialAssessmentWithNoFollowUp:
          sessionCount === 1 && lastAppt?.isInitialAssessment && !lastAppt?.followUpBooked,
        followUpBookedAtLastSession: lastAppt?.followUpBooked ?? false,
        dnasInFirstThreeSessions: dnaInFirstThree,
        sessionsAttendedLast4Weeks: recentAttended,
        sessionsScheduledLast4Weeks: recentScheduled,
        priorLifecycleState,
        lastSequenceSentAt,
        now,
        // Cadence-relative at-risk model
        expectedIntervalDays,
        lastAppointmentType: lastAppt?.appointmentType ?? null,
        effectiveCourseLength: treatmentLength,
        overdueFactor: cadenceConfig.overdueFactor,
        churnFactor: cadenceConfig.churnFactor,
        atRiskMaxDays: cadenceConfig.atRiskMaxDays,
      });

      const update: Record<string, unknown> = {
        sessionCount,
        firstAppointmentDate: firstAppointmentDate ?? null,
        lastSessionDate: lastSessionDate ?? null,
        nextSessionDate: nextSessionDate ?? null,
        discharged,
        churnRisk,
        treatmentLength,       // was courseLength — renamed 2026-04
        // New retention fields (additive)
        lifecycleState: riskResult.lifecycleState,
        riskScore: riskResult.riskScore,
        riskFactors: riskResult.riskFactors,
        sessionThresholdAlert: riskResult.sessionThresholdAlert,
        lifecycleUpdatedAt: nowIso,
        updatedAt: nowIso,
      };

      batch.update(patientsRef.doc(patientDoc.id), update);
      batchCount++;
      count++;

      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return {
    stage: "compute-patients",
    ok: errors.length === 0,
    count,
    errors,
    durationMs: Date.now() - start,
  };
}
