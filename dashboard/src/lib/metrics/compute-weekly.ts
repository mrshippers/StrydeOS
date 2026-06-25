/**
 * Compute weekly metrics from appointments and write to metrics_weekly subcollection.
 * All monetary values in integer pence. Multi-tenant: scoped to clinicId.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { Appointment, WeeklyStats } from "@/types";
import type { Clinician } from "@/types";
import type { AvaCallFactEvent } from "@/lib/contracts";

const COLLECTION_APPOINTMENTS = "appointments";
const COLLECTION_CLINICIANS = "clinicians";
const COLLECTION_PATIENTS = "patients";
const COLLECTION_REVIEWS = "reviews";
const COLLECTION_METRICS_WEEKLY = "metrics_weekly";
const COLLECTION_CALL_FACTS = "call_facts";

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

/**
 * Slots in a working day, LEARNED FROM THE DIARY. The working-day window is the
 * span from the earliest appointment start to the latest appointment finish
 * (start + slotMinutes) observed across the clinic's booked appointments, divided
 * into slotMinutes-length slots. This reads real availability from the booking
 * data instead of a manual hours config: a clinic that only ever books 09:00–17:00
 * gets a ~10-slot day, so a day with 9 of those filled reads 90%. Returns 0 when
 * there are no bookable appointments (utilisation then degrades to 0).
 */
function slotsPerWorkingDayFromDiary(
  appointments: { dateTime: string; status: string }[],
  slotMinutes: number,
): number {
  if (slotMinutes <= 0) return 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const a of appointments) {
    // Only slots that consume diary capacity define the window.
    if (a.status !== "completed" && a.status !== "dna" && a.status !== "scheduled") {
      continue;
    }
    const d = new Date(a.dateTime);
    const startMins = d.getHours() * 60 + d.getMinutes();
    if (startMins < minStart) minStart = startMins;
    if (startMins + slotMinutes > maxEnd) maxEnd = startMins + slotMinutes;
  }
  if (!Number.isFinite(minStart) || maxEnd <= minStart) return 0;
  return Math.max(1, Math.floor((maxEnd - minStart) / slotMinutes));
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
  id: string;
  clinicianId: string;
  sessionCount: number;
  treatmentLength: number;
  discharged: boolean;
  insuranceFlag?: boolean;
  /** dateTime of the patient's first-ever completed appointment (stable ordinality
   *  anchor for initial-assessment vs follow-up classification). */
  firstAppointmentDate?: string;
}

interface ReviewLike {
  rating: number;
  date: string;
  platform?: string;
}

/**
 * Subset of `AvaCallFactPayload` consumed by the voice-channel KPIs. Kept
 * structural rather than typed against `AvaCallFactEvent` so callers can pass
 * loose Firestore docs without forcing brand-cast gymnastics in tests.
 */
export interface CallFactLike {
  type?: string;
  payload: {
    booked?: boolean;
    transferred?: boolean;
    endedAt?: string;
  };
}

/**
 * Compute the three voice-channel KPIs for a rolling week from a pre-filtered
 * array of `AVA_CALL_ENDED` facts. Pure function — no Firestore access — so
 * the unit test can exercise it directly with fixtures.
 *
 * Returns `null` for every KPI when there are zero facts: absence of Ava
 * activity is meaningfully different from a zero rate.
 */
export function computeVoiceKpis(facts: CallFactLike[]): {
  voiceBookingConversionRate: number | null;
  voiceCallVolume: number | null;
  voiceTransferRate: number | null;
} {
  // Defensive type filter — only AVA_CALL_ENDED facts feed the rates. The
  // call_facts collection could grow other event types (AVA_BOOKING_ATTEMPTED,
  // AVA_CALL_ABANDONED) and those would distort the ratios.
  const ended = facts.filter(
    (f) => !f.type || f.type === "AVA_CALL_ENDED"
  );
  const total = ended.length;
  if (total === 0) {
    return {
      voiceBookingConversionRate: null,
      voiceCallVolume: null,
      voiceTransferRate: null,
    };
  }
  const booked = ended.filter((f) => f.payload.booked === true).length;
  const transferred = ended.filter((f) => f.payload.transferred === true).length;
  return {
    voiceBookingConversionRate: booked / total,
    voiceCallVolume: total,
    voiceTransferRate: transferred / total,
  };
}

export function aggregateWeek(
  appointments: AppointmentLike[],
  weekStart: string,
  clinicianId: string,
  clinicianName: string,
  targets: { followUpRate: number; hepRate: number },
  patients: PatientLike[],
  reviews: ReviewLike[],
  sessionPricePence: number = 0,
  slotsPerDay: number = 12,
  callFacts: CallFactLike[] = [],
): Omit<WeeklyStats, "id"> {
  const completed = appointments.filter((a) => a.status === "completed");
  const total = completed.length;
  const withHep = completed.filter((a) => a.hepAssigned === true).length;
  const dnas = appointments.filter((a) => a.status === "dna");
  const dnaCount = dnas.length;
  // DNA rate: DNAs ÷ (completed + DNAs) — excludes cancelled/no-show-rescheduled
  const attendedOrDna = total + dnaCount;
  const dnaRate = attendedOrDna > 0 ? dnaCount / attendedOrDna : 0;
  // Initial-assessment vs follow-up by STABLE ORDINALITY, not the per-sync
  // appointmentType field (which flip-flops: sync-appointments passes the Cliniko
  // type ID where a name is expected, so it falls back to a non-deterministic
  // "first visit?" heuristic). A completed appointment is the initial assessment
  // iff its dateTime equals the patient's persisted firstAppointmentDate (their
  // first-ever completed session); every other completed appointment is a follow-up.
  // This matches how the clinic works: cases aren't closed, so each subsequent
  // visit is a follow-up. Stable across re-syncs and computable over any window.
  const firstApptByPatient = new Map(
    patients.map((p) => [p.id, p.firstAppointmentDate])
  );
  const initialAssessments = completed.filter((a) => {
    const first = a.patientId ? firstApptByPatient.get(a.patientId) : undefined;
    return first != null && a.dateTime === first;
  }).length;
  // Every completed appointment that is not the patient's first is a follow-up.
  const followUps = total - initialAssessments;

  // Follow-up rate (CLAUDE.md "KPI Metrics — Confirmed from Spires"): follow-ups ÷
  // initial assessments. A week with no NEW patient (no initial assessment in the
  // window) has an undefined per-week ratio → 0 here; the meaningful figure is the
  // rolling window aggregate in the KPI layer (computeRollingFollowUpRate).
  const followUpRate = initialAssessments > 0 ? followUps / initialAssessments : 0;

  const hepRate = total > 0 ? withHep / total : 0;
  const hepComplianceRate = hepRate;

  const revenueTotal = completed.reduce(
    (sum, a) => sum + (a.revenueAmountPence || sessionPricePence),
    0
  );
  const revenuePerSessionPence = total > 0 ? Math.round(revenueTotal / total) : 0;

  // Revenue by appointment type — PBB: "The industry is addicted to busyness over value"
  // This breaks revenue down so owners can see where margin comes from (IA vs FU vs review)
  const revenueByAppointmentType: Record<string, number> = {};
  for (const a of completed) {
    const type = a.appointmentType ?? "unknown";
    revenueByAppointmentType[type] = (revenueByAppointmentType[type] ?? 0) + (a.revenueAmountPence || sessionPricePence);
  }

  // Insurance vs self-pay revenue split — PBB: "PMI clinics: 83% more revenue but 5pp lower margin"
  // Tracks the revenue mix so owners can see their insurance dependency
  const patientInsuranceMap = new Map(
    patients.map((p) => [p.id, !!p.insuranceFlag])
  );
  let insuranceRevenuePence = 0;
  let selfPayRevenuePence = 0;
  for (const a of completed) {
    const revenue = a.revenueAmountPence || sessionPricePence;
    if (a.patientId && patientInsuranceMap.get(a.patientId)) {
      insuranceRevenuePence += revenue;
    } else {
      selfPayRevenuePence += revenue;
    }
  }

  // HEP compliance: patients given a programme / total patients seen
  const relevantPatients = patients.filter((p) =>
    clinicianId === "all" ? true : p.clinicianId === clinicianId
  );
  const completedTreatments = relevantPatients.filter(
    (p) => p.discharged && p.sessionCount >= p.treatmentLength
  ).length;
  const totalWithTreatment = relevantPatients.filter(
    (p) => p.discharged
  ).length;
  const treatmentCompletionRate =
    totalWithTreatment > 0 ? completedTreatments / totalWithTreatment : 0;

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

  // NPS score: ONLY from true 0-10 nps_sms responses (P0-11).
  // Standard NPS: promoters=9-10, passives=7-8, detractors=0-6.
  // Formula: (promoters - detractors) / total_nps_sms * 100
  // Returns null when no nps_sms reviews exist (absence-of-data, not zero).
  const npsSmsReviews = weekReviews.filter((r) => r.platform === "nps_sms");
  let npsScore: number | null = null;
  if (npsSmsReviews.length > 0) {
    let promoters = 0;
    let detractors = 0;
    for (const r of npsSmsReviews) {
      if (r.rating >= 9) promoters++;
      else if (r.rating <= 6) detractors++;
      // 7-8 = passives: neither promoter nor detractor
    }
    npsScore = Math.round(
      ((promoters - detractors) / npsSmsReviews.length) * 100
    );
  }

  // Average star rating: ONLY from non-nps_sms reviews (1-5 scale, P0-11).
  // Kept separate from npsScore — different scale, different metric.
  const starReviews = weekReviews.filter((r) => r.platform !== "nps_sms");
  const avgStarRating: number | null =
    starReviews.length > 0
      ? Math.round((starReviews.reduce((s, r) => s + r.rating, 0) / starReviews.length) * 10) / 10
      : null;

  // Utilisation (canonical, CLAUDE.md): booked slots ÷ available slots in the diary.
  // No PMS exposes a free-slot endpoint, so available slots are derived the same way
  // Ava derives them for booking: the working-hours window split into fixed-length
  // slots, counted only for (clinician, day) pairs that were actually worked. A
  // clinician who opens their diary one day is measured against that one day's slots,
  // not a phantom full week — so a 1-day, 10-slot diary with 9 booked reads 90%, not
  // 9/40. The previous flat `clinicians × 40` capacity was the bug.
  // Limitation (flagged in findings.md): with no roster feed, "days worked" is proxied
  // by days that have at least one completed/DNA appointment, so an entirely empty
  // available day does not drag utilisation down.
  const bookedSlots = total + dnaCount;
  const workedClinicianDays = new Set(
    appointments
      .filter((a) => a.status === "completed" || a.status === "dna")
      .map((a) => `${a.clinicianId ?? clinicianId}__${a.dateTime.slice(0, 10)}`)
  ).size;
  const availableSlots = workedClinicianDays * slotsPerDay;
  const utilisationRate = availableSlots > 0
    ? Math.min(1, bookedSlots / availableSlots)
    : 0;

  // Voice-channel KPIs from /clinics/{id}/call_facts. Voice activity is
  // clinic-wide (Ava doesn't route per clinician) so the same three values
  // get stamped onto every per-clinician WeeklyStats doc as well as the
  // "all" rollup. Owners viewing a single clinician's row still see the
  // shared denominator — intentional, until per-clinician routing exists.
  const voiceKpis = computeVoiceKpis(callFacts);

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
    treatmentCompletionRate,
    revenuePerSessionPence,
    revenueByAppointmentType,
    insuranceRevenuePence,
    selfPayRevenuePence,
    appointmentsTotal: total,
    initialAssessments,
    followUps,
    npsScore,
    avgStarRating,
    reviewCount,
    avgRating: avgRating ?? null,
    reviewVelocity: reviewCount - priorWeekReviewCount,
    dnaByDayOfWeek,
    dnaByTimeSlot,
    voiceBookingConversionRate: voiceKpis.voiceBookingConversionRate,
    voiceCallVolume: voiceKpis.voiceCallVolume,
    voiceTransferRate: voiceKpis.voiceTransferRate,
    computedAt: new Date().toISOString(),
    statisticallyRepresentative: total >= 5,
    caveatNote: total < 5 ? `Low volume week (${total} appointments)` : null,
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
  const sessionPricePence: number = clinicData?.sessionPricePence ?? 0;
  // Utilisation capacity is READ FROM THE DIARY, not a config: the working-day
  // window is learned from the actual span of booked appointment times (earliest
  // start to latest finish observed for this clinic), split into `slotMinutes`
  // slots. slotsPerDay is derived below once appointments are loaded. Replaces the
  // old flat 40-slots/week assumption and avoids depending on a manual hours config.
  const slotMinutes: number = clinicData?.targets?.slotMinutes ?? 45;
  const targets = {
    followUpRate: clinicData?.targets?.followUpRate ?? 4.0,
    hepRate: clinicData?.targets?.hepRate ?? clinicData?.targets?.physitrackRate ?? 95,
  };
  if (typeof targets.hepRate === "number" && targets.hepRate > 1) {
    targets.hepRate = targets.hepRate / 100;
  }

  const clinicBase = db.collection("clinics").doc(clinicId);

  const [cliniciansSnap, patientsSnap, reviewsSnap, callFactsSnap] = await Promise.all([
    clinicBase.collection(COLLECTION_CLINICIANS).get(),
    clinicBase.collection(COLLECTION_PATIENTS).get(),
    clinicBase.collection(COLLECTION_REVIEWS).get(),
    // call_facts is Ava-written, Intelligence-readable per COLLECTION_OWNERSHIP.
    // Failure is non-fatal — voice KPIs degrade to null, the rest still compute.
    clinicBase.collection(COLLECTION_CALL_FACTS).get().catch(() => null),
  ]);

  const clinicians: { id: string; name: string }[] = cliniciansSnap.docs.map(
    (d) => ({ id: d.id, name: (d.data() as Clinician).name ?? d.id })
  );

  const patients: PatientLike[] = patientsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      clinicianId: data.clinicianId ?? "",
      sessionCount: data.sessionCount ?? 0,
      treatmentLength: data.treatmentLength ?? data.courseLength ?? 6,
      discharged: data.discharged ?? false,
      insuranceFlag: data.insuranceFlag ?? false,
      firstAppointmentDate: data.firstAppointmentDate ?? undefined,
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

  // Hydrate call_facts into structural CallFactLike for in-memory week-bucketing.
  // We read the whole collection up front and filter per week (matches the
  // existing pattern for appointments/reviews above). For high-volume tenants
  // this should later move to a `where("payload.endedAt", ">=", fromDate)` query.
  const callFactsAll: CallFactLike[] = callFactsSnap
    ? callFactsSnap.docs.map((d) => {
        const data = d.data() as Partial<AvaCallFactEvent>;
        return {
          type: data.type,
          payload: {
            booked: data.payload?.booked,
            transferred: data.payload?.transferred,
            endedAt: data.payload?.endedAt,
          },
        };
      })
    : [];

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

  // Learn the clinic's working-day window from the diary itself and turn it into a
  // slots-per-working-day count for utilisation (booked ÷ available). Empty leading/
  // trailing capacity in the day is captured because the window spans the earliest
  // start to the latest finish actually observed across the clinic's appointments.
  const slotsPerDay: number = slotsPerWorkingDayFromDiary(appointments, slotMinutes);

  const metricsRef = clinicBase.collection(COLLECTION_METRICS_WEEKLY);

  let written = 0;

  for (const weekStart of weekStarts) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const weekAppointments = appointments.filter(
      (a) => a.dateTime >= weekStart && a.dateTime < weekEndStr
    );

    // Voice facts bucketed by payload.endedAt — that's the canonical "when did
    // the call complete" timestamp on AvaCallFactPayload. Facts without an
    // endedAt are dropped (Intelligence cannot place them in a week).
    const weekCallFacts = callFactsAll.filter((f) => {
      const ended = f.payload.endedAt;
      if (!ended) return false;
      const dayKey = ended.slice(0, 10);
      return dayKey >= weekStart && dayKey < weekEndStr;
    });

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
        reviews,
        sessionPricePence,
        slotsPerDay,
        weekCallFacts,
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
