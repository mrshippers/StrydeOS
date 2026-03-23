/**
 * Compute weekly metrics from appointments and write to metrics_weekly subcollection.
 * All monetary values in integer pence. Multi-tenant: scoped to clinicId.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { Appointment, WeeklyStats } from "@/types";
import type { Clinician } from "@/types";

const COLLECTION_APPOINTMENTS = "appointments";
const COLLECTION_CLINICIANS = "clinicians";
const COLLECTION_PATIENTS = "patients";
const COLLECTION_REVIEWS = "reviews";
const COLLECTION_METRICS_WEEKLY = "metrics_weekly";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function getTimeSlot(dateTime: string): string {
  const hour = new Date(dateTime).getHours();
  if (hour < 10) return "early_morning";
  if (hour < 13) return "morning";
  if (hour < 16) return "afternoon";
  return "evening";
}

interface AppointmentLike {
  clinicianId: string;
  patientId?: string;
  dateTime: string;
  status: string;
  appointmentType?: string;
  hepAssigned?: boolean;
  revenueAmountPence?: number;
}

interface PatientLike {
  clinicianId: string;
  sessionCount: number;
  courseLength: number;
  discharged: boolean;
}

interface ReviewLike {
  rating: number;
  date: string;
  platform?: string;
}

function aggregateWeek(
  appointments: AppointmentLike[],
  weekStart: string,
  clinicianId: string,
  clinicianName: string,
  targets: { followUpRate: number; hepRate: number },
  patients: PatientLike[],
  reviews: ReviewLike[]
): Omit<WeeklyStats, "id"> {
  const completed = appointments.filter((a) => a.status === "completed");
  const total = completed.length;
  const withHep = completed.filter((a) => a.hepAssigned === true).length;
  const dnas = appointments.filter((a) => a.status === "dna");
  const dnaCount = dnas.length;
  // DNA rate: DNAs ÷ (completed + DNAs) — excludes cancelled/no-show-rescheduled
  const attendedOrDna = total + dnaCount;
  const dnaRate = attendedOrDna > 0 ? dnaCount / attendedOrDna : 0;
  const initialAssessments = completed.filter(
    (a) => a.appointmentType === "initial_assessment"
  ).length;
  const followUps = completed.filter(
    (a) => a.appointmentType === "follow_up" || a.appointmentType === "review"
  ).length;

  const uniquePatients = new Set(
    completed.map((a) => a.patientId).filter(Boolean)
  ).size;
  // Follow-up rate: total completed sessions ÷ unique patients seen this week
  // This gives sessions-per-patient which is what the dashboard displays
  const followUpRate = uniquePatients > 0 ? total / uniquePatients : 0;

  const hepRate = total > 0 ? withHep / total : 0;
  const hepComplianceRate = hepRate;

  const revenueTotal = completed.reduce(
    (sum, a) => sum + (a.revenueAmountPence ?? 0),
    0
  );
  const revenuePerSessionPence = total > 0 ? Math.round(revenueTotal / total) : 0;

  // HEP compliance: patients given a programme / total patients seen
  const relevantPatients = patients.filter((p) =>
    clinicianId === "all" ? true : p.clinicianId === clinicianId
  );
  const completedCourses = relevantPatients.filter(
    (p) => p.discharged && p.sessionCount >= p.courseLength
  ).length;
  const totalWithCourse = relevantPatients.filter(
    (p) => p.discharged
  ).length;
  const courseCompletionRate =
    totalWithCourse > 0 ? completedCourses / totalWithCourse : 0;

  // DNA breakdown by day of week and time slot
  const dnaByDayOfWeek: Record<string, number> = {};
  const dnaByTimeSlot: Record<string, number> = {};
  for (const dna of dnas) {
    const d = new Date(dna.dateTime);
    const day = DAYS[d.getDay()];
    dnaByDayOfWeek[day] = (dnaByDayOfWeek[day] ?? 0) + 1;
    const slot = getTimeSlot(dna.dateTime);
    dnaByTimeSlot[slot] = (dnaByTimeSlot[slot] ?? 0) + 1;
  }

  // Review metrics for the week
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);
  const weekReviews = reviews.filter(
    (r) => r.date >= weekStart && r.date < weekEndStr
  );

  // Prior week review count for velocity (week-over-week delta)
  const priorWeekStart = new Date(weekStart);
  priorWeekStart.setDate(priorWeekStart.getDate() - 7);
  const priorWeekStartStr = priorWeekStart.toISOString().slice(0, 10);
  const priorWeekReviewCount = reviews.filter(
    (r) => r.date >= priorWeekStartStr && r.date < weekStart
  ).length;
  const reviewCount = weekReviews.length;
  const avgRating =
    reviewCount > 0
      ? weekReviews.reduce((s, r) => s + r.rating, 0) / reviewCount
      : undefined;

  // NPS score: separate nps_sms (0–10 scale) from platform reviews (1–5 stars)
  // nps_sms: 9-10 promoter, 7-8 passive, 0-6 detractor
  // Platform: 5-star promoter, 4-star passive, 1-3 star detractor
  // Formula: (promoters - detractors) / total * 100
  let npsScore: number | undefined;
  if (reviewCount > 0) {
    let promoters = 0;
    let detractors = 0;
    for (const r of weekReviews) {
      if (r.platform === "nps_sms") {
        if (r.rating >= 9) promoters++;
        else if (r.rating <= 6) detractors++;
      } else {
        if (r.rating >= 5) promoters++;
        else if (r.rating <= 3) detractors++;
      }
    }
    npsScore = Math.round(
      ((promoters - detractors) / reviewCount) * 100
    );
  }

  // Utilisation: booked slots (completed + DNA) ÷ available capacity
  // Estimate capacity as 8 slots/day × 5 working days = 40 slots/week per clinician
  // For "all" aggregate, scale by number of clinicians with appointments
  const bookedSlots = total + dnaCount;
  const activeClinicians = clinicianId === "all"
    ? new Set(appointments.map((a) => a.clinicianId)).size || 1
    : 1;
  const estimatedCapacity = activeClinicians * 40; // 8 patients/day × 5 days
  const utilisationRate = estimatedCapacity > 0
    ? Math.min(1, bookedSlots / estimatedCapacity)
    : 0;

  return {
    clinicianId,
    clinicianName,
    weekStart,
    followUpRate,
    followUpTarget: targets.followUpRate,
    hepComplianceRate,
    hepRate,
    hepTarget: targets.hepRate,
    utilisationRate,
    dnaRate,
    courseCompletionRate,
    revenuePerSessionPence,
    appointmentsTotal: total,
    initialAssessments,
    followUps,
    npsScore,
    reviewCount,
    avgRating,
    reviewVelocity: reviewCount - priorWeekReviewCount,
    dnaByDayOfWeek,
    dnaByTimeSlot,
    computedAt: new Date().toISOString(),
    statisticallyRepresentative: total >= 5,
    caveatNote: total < 5 ? `Low volume week (${total} appointments)` : undefined,
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
    followUpRate: clinicData?.targets?.followUpRate ?? 4.0,
    hepRate: clinicData?.targets?.hepRate ?? clinicData?.targets?.physitrackRate ?? 95,
  };
  if (typeof targets.hepRate === "number" && targets.hepRate > 1) {
    targets.hepRate = targets.hepRate / 100;
  }

  const clinicBase = db.collection("clinics").doc(clinicId);

  const [cliniciansSnap, patientsSnap, reviewsSnap] = await Promise.all([
    clinicBase.collection(COLLECTION_CLINICIANS).get(),
    clinicBase.collection(COLLECTION_PATIENTS).get(),
    clinicBase.collection(COLLECTION_REVIEWS).get(),
  ]);

  const clinicians: { id: string; name: string }[] = cliniciansSnap.docs.map(
    (d) => ({ id: d.id, name: (d.data() as Clinician).name ?? d.id })
  );

  const patients: PatientLike[] = patientsSnap.docs.map((d) => {
    const data = d.data();
    return {
      clinicianId: data.clinicianId ?? "",
      sessionCount: data.sessionCount ?? 0,
      courseLength: data.courseLength ?? 6,
      discharged: data.discharged ?? false,
    };
  });

  const reviews: ReviewLike[] = reviewsSnap.docs.map((d) => {
    const data = d.data();
    return {
      rating: data.rating ?? 0,
      date: data.date ?? "",
      platform: (data.platform as string) ?? undefined,
    };
  });

  const weekStarts = getWeeksToCompute(weeksBack);
  const fromDate = weekStarts[weekStarts.length - 1];
  const toDate = new Date(weekStarts[0]);
  toDate.setDate(toDate.getDate() + 7);
  const toDateStr = toDate.toISOString().slice(0, 10);

  const appointmentsSnap = await clinicBase
    .collection(COLLECTION_APPOINTMENTS)
    .where("dateTime", ">=", fromDate)
    .where("dateTime", "<", toDateStr)
    .get();

  const appointments = appointmentsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as (Appointment & { patientId: string })[];

  const metricsRef = clinicBase.collection(COLLECTION_METRICS_WEEKLY);

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
        targets,
        patients,
        reviews
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
