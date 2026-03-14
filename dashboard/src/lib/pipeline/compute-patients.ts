import type { Firestore, WriteBatch } from "firebase-admin/firestore";
import type { StageResult } from "./types";
import { INTEGRATIONS_CONFIG, PIPELINE_DOC_ID, DEFAULT_COURSE_LENGTH } from "./types";
import { computeRiskScore } from "./compute-risk-score";
import type { LifecycleState } from "@/types";

const MAX_BATCH_SIZE = 500;
const CHURN_RISK_DAYS = 14;
const DISCHARGE_INACTIVE_DAYS = 30;

/**
 * Stage 5: Compute derived fields for each patient from their appointment history.
 *
 * - sessionCount: number of completed appointments
 * - lastSessionDate: most recent completed appointment dateTime
 * - nextSessionDate: earliest future scheduled appointment dateTime
 * - discharged: no sessions in 30 days AND no future appointment
 * - churnRisk: last session > 14 days ago AND no future appointment AND not discharged
 * - courseLength: from pipeline config default (typically 6)
 */
export async function computePatientFields(
  db: Firestore,
  clinicId: string
): Promise<StageResult> {
  const start = Date.now();
  const errors: string[] = [];
  let count = 0;

  try {
    // Load course length from pipeline config
    const pipelineSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection(INTEGRATIONS_CONFIG)
      .doc(PIPELINE_DOC_ID)
      .get();
    const courseLength =
      (pipelineSnap.data()?.defaultCourseLength as number) ??
      DEFAULT_COURSE_LENGTH;

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
      { dateTime: string; status: string; followUpBooked: boolean; isInitialAssessment: boolean }[]
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
      const lastSessionDate =
        completed.length > 0
          ? completed[completed.length - 1].dateTime
          : undefined;
      const nextSessionDate =
        future.length > 0 ? future[0].dateTime : undefined;

      // Compute discharge and churn risk
      let discharged = false;
      let churnRisk = false;

      if (lastSessionDate) {
        const daysSinceLastSession = Math.floor(
          (now.getTime() - new Date(lastSessionDate).getTime()) /
            (1000 * 60 * 60 * 24)
        );

        if (daysSinceLastSession > DISCHARGE_INACTIVE_DAYS && !nextSessionDate) {
          discharged = true;
        } else if (
          daysSinceLastSession > CHURN_RISK_DAYS &&
          !nextSessionDate &&
          !discharged
        ) {
          churnRisk = true;
        }
      }

      // ── Risk score + lifecycle state ────────────────────────────────────────
      const lastAppt = completed.length > 0 ? completed[completed.length - 1] : null;
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
        courseLength,
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
      });

      const update: Record<string, unknown> = {
        sessionCount,
        lastSessionDate: lastSessionDate ?? null,
        nextSessionDate: nextSessionDate ?? null,
        discharged,
        churnRisk,
        courseLength,
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
