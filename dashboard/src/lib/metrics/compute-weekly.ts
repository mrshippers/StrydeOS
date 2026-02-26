/**
 * Compute weekly metrics from appointments and write to metrics_weekly subcollection.
 * All monetary values in integer pence. Multi-tenant: scoped to clinicId.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { Appointment, WeeklyStats } from "@/types";
import type { Clinician } from "@/types";

const COLLECTION_APPOINTMENTS = "appointments";
const COLLECTION_CLINICIANS = "clinicians";
const COLLECTION_METRICS_WEEKLY = "metrics_weekly";

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function getWeeksToCompute(weeksBack: number): string[] {
  const weeks: string[] = [];
  const now = new Date();
  for (let i = 0; i < weeksBack; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    weeks.push(getWeekStart(d));
  }
  return weeks;
}

interface AppointmentLike {
  clinicianId: string;
  dateTime: string;
  status: string;
  appointmentType?: string;
  hepAssigned?: boolean;
  revenueAmountPence?: number;
}

function aggregateWeek(
  appointments: AppointmentLike[],
  weekStart: string,
  clinicianId: string,
  clinicianName: string,
  targets: { followUpRate: number; physitrackRate: number }
): Omit<WeeklyStats, "id"> {
  const completed = appointments.filter((a) => a.status === "completed");
  const total = completed.length;
  const withHep = completed.filter((a) => a.hepAssigned === true).length;
  const dnaCount = appointments.filter((a) => a.status === "dna").length;
  const totalInclDna = appointments.length;
  const dnaRate = totalInclDna > 0 ? dnaCount / totalInclDna : 0;
  const initialAssessments = completed.filter(
    (a) => a.appointmentType === "initial_assessment"
  ).length;
  const followUps = completed.filter(
    (a) => a.appointmentType === "follow_up" || a.appointmentType === "review"
  ).length;

  const uniquePatients = new Set(
    appointments.map((a) => (a as AppointmentLike & { patientId?: string }).patientId)
  ).size;
  const followUpRate = uniquePatients > 0 ? total / uniquePatients : 0;

  const physitrackRate = total > 0 ? withHep / total : 0;
  const hepComplianceRate = physitrackRate;

  const revenueTotal = completed.reduce(
    (sum, a) => sum + (a.revenueAmountPence ?? 0),
    0
  );
  const revenuePerSessionPence = total > 0 ? Math.round(revenueTotal / total) : 0;

  const courseCompletionRate = 0; // Requires course-length logic; stub

  return {
    clinicianId,
    clinicianName,
    weekStart,
    followUpRate,
    followUpTarget: targets.followUpRate,
    hepComplianceRate,
    physitrackRate,
    physitrackTarget: targets.physitrackRate / 100,
    utilisationRate: 0,
    dnaRate,
    courseCompletionRate,
    revenuePerSessionPence,
    appointmentsTotal: total,
    initialAssessments,
    followUps,
    computedAt: new Date().toISOString(),
  };
}

export async function computeWeeklyMetricsForClinic(
  db: Firestore,
  clinicId: string,
  weeksBack: number = 6
): Promise<{ written: number }> {
  const clinicDoc = await db.collection("clinics").doc(clinicId).get();
  if (!clinicDoc.exists) return { written: 0 };
  const clinicData = clinicDoc.data();
  const targets = {
    followUpRate: clinicData?.targets?.followUpRate ?? 2.9,
    physitrackRate: clinicData?.targets?.physitrackRate ?? 95,
  };
  if (typeof targets.physitrackRate === "number" && targets.physitrackRate > 1) {
    targets.physitrackRate = targets.physitrackRate / 100;
  }

  const cliniciansSnap = await db
    .collection("clinics")
    .doc(clinicId)
    .collection(COLLECTION_CLINICIANS)
    .get();
  const clinicians: { id: string; name: string }[] = cliniciansSnap.docs.map(
    (d) => ({ id: d.id, name: (d.data() as Clinician).name ?? d.id })
  );

  const weekStarts = getWeeksToCompute(weeksBack);
  const fromDate = weekStarts[weekStarts.length - 1];
  const toDate = new Date(weekStarts[0]);
  toDate.setDate(toDate.getDate() + 7);
  const toDateStr = toDate.toISOString().slice(0, 10);

  const appointmentsSnap = await db
    .collection("clinics")
    .doc(clinicId)
    .collection(COLLECTION_APPOINTMENTS)
    .where("dateTime", ">=", fromDate)
    .where("dateTime", "<", toDateStr)
    .get();

  const appointments = appointmentsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as (Appointment & { patientId: string })[];

  const metricsRef = db
    .collection("clinics")
    .doc(clinicId)
    .collection(COLLECTION_METRICS_WEEKLY);

  let written = 0;

  for (const weekStart of weekStarts) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const weekAppointments = appointments.filter(
      (a) => a.dateTime >= weekStart && a.dateTime < weekEndStr
    );

    const clinicianIds = new Set(weekAppointments.map((a) => a.clinicianId));
    const allIds = new Set(clinicianIds);
    clinicians.forEach((c) => allIds.add(c.id));
    allIds.add("all");

    for (const cid of allIds) {
      const name = clinicians.find((c) => c.id === cid)?.name ?? cid;
      const subset =
        cid === "all"
          ? weekAppointments
          : weekAppointments.filter((a) => a.clinicianId === cid);
      const stats = aggregateWeek(
        subset,
        weekStart,
        cid,
        cid === "all" ? "All Clinicians" : name,
        targets
      );
      const docId = `${weekStart}_${cid}`;
      await metricsRef.doc(docId).set(stats);
      written++;
    }
  }

  return { written };
}

export async function computeWeeklyMetricsForAllClinics(
  db: Firestore,
  weeksBack: number = 6
): Promise<{ clinicId: string; written: number }[]> {
  const clinicsSnap = await db.collection("clinics").get();
  const results: { clinicId: string; written: number }[] = [];
  for (const doc of clinicsSnap.docs) {
    const { written } = await computeWeeklyMetricsForClinic(db, doc.id, weeksBack);
    results.push({ clinicId: doc.id, written });
  }
  return results;
}
