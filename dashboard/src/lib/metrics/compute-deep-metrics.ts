/**
 * Deep Metrics Computation
 *
 * Derives the "intelligence" layer metrics from existing appointment + patient data.
 * These sit alongside WeeklyStats but answer the deeper questions:
 * - Where in the patient journey are we losing people? (Retention Curve)
 * - What does an empty chair actually cost us? (Cost of Empty Chair)
 * - Are we growing or shrinking? (Net Growth)
 * - How long are patients waiting between sessions? (Rebooking Lag)
 * - Are patients being properly discharged or ghosting? (Discharge Quality)
 * - What's a patient actually worth to us? (Patient Lifetime Value)
 *
 * Firestore writes: clinics/{clinicId}/deep_metrics/{weekStart}_{clinicianId}
 */

import type { Firestore } from "firebase-admin/firestore";
import type { Appointment, Patient } from "@/types";
import type { DeepMetrics, RetentionStep } from "@/types/value-ledger";
import { loadSessionRate as loadSessionRateCanonical } from "@/lib/intelligence/load-session-rate";
import { appendDataQualityIssues } from "@/lib/intelligence/compute-state";

// ─── Constants ───────────────────────────────────────────────────────────────
const ESTIMATED_SLOTS_PER_CLINICIAN_PER_WEEK = 40; // 8/day × 5 days
const GHOST_THRESHOLD_DAYS = 30;
const REBOOKING_LAG_RISK_DAYS = 14;
const MAX_RETENTION_SESSIONS = 6;

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function computeDeepMetricsForClinic(
  db: Firestore,
  clinicId: string,
  weekStart: string // ISO date of Monday (YYYY-MM-DD)
): Promise<{ written: number }> {
  // Load data
  const [appointments, patients, clinicians] = await Promise.all([
    loadAppointments(db, clinicId),
    loadPatients(db, clinicId),
    loadActiveClinicians(db, clinicId),
  ]);

  const sessionRateLookup = await loadSessionRateCanonical(db, clinicId);

  // INTELLIGENCE_AUDIT.md issue 2: skip deep metrics when session price is
  // not configured — silent £65 fallback corrupted LTV / empty-chair numbers.
  if (sessionRateLookup.rate === null) {
    await appendDataQualityIssues(db, clinicId, [
      {
        code: "SESSION_RATE_MISSING",
        message:
          "Skipped computeDeepMetricsForClinic — clinics/{clinicId}.sessionPricePence is not configured",
      },
    ]);
    return { written: 0 };
  }
  const sessionRate = sessionRateLookup.rate;

  // Compute clinic-wide ("all") + per-clinician
  const clinicianIds = ["all", ...clinicians.map((c) => c.id)];
  let written = 0;

  for (const clinicianId of clinicianIds) {
    const filteredAppointments =
      clinicianId === "all"
        ? appointments
        : appointments.filter((a) => a.clinicianId === clinicianId);

    const filteredPatients =
      clinicianId === "all"
        ? patients
        : patients.filter((p) => p.clinicianId === clinicianId);

    const activeCliniciansCount =
      clinicianId === "all" ? clinicians.length : 1;

    const metrics = computeDeepMetrics(
      clinicId,
      clinicianId,
      weekStart,
      filteredAppointments,
      filteredPatients,
      sessionRate,
      activeCliniciansCount
    );

    const docId = `${weekStart}_${clinicianId}`;
    await db
      .doc(`clinics/${clinicId}/deep_metrics/${docId}`)
      .set(metrics);
    written++;
  }

  return { written };
}

// ─── Core Computation ────────────────────────────────────────────────────────

function computeDeepMetrics(
  clinicId: string,
  clinicianId: string,
  weekStart: string,
  appointments: AppointmentLike[],
  patients: PatientLike[],
  sessionRate: number,
  activeCliniciansCount: number
): Omit<DeepMetrics, never> {
  const now = new Date().toISOString();
  const weekStartDate = new Date(weekStart);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 7);

  // Week-scoped appointments
  const weekAppts = appointments.filter((a) => {
    const d = new Date(a.dateTime);
    return d >= weekStartDate && d < weekEndDate;
  });

  const completedWeek = weekAppts.filter((a) => a.status === "completed");
  const dnaWeek = weekAppts.filter((a) => a.status === "dna");
  const scheduledWeek = weekAppts.filter(
    (a) => a.status === "completed" || a.status === "scheduled" || a.status === "dna"
  );

  // ── Cost of Empty Chair ──
  const dnaSlots = dnaWeek.length;
  const totalCapacity = activeCliniciansCount * ESTIMATED_SLOTS_PER_CLINICIAN_PER_WEEK;
  const bookedSlots = scheduledWeek.length;
  const unfilledSlots = Math.max(0, totalCapacity - bookedSlots);
  const costOfEmptyChairPence = (dnaSlots + unfilledSlots) * sessionRate;
  const costOfEmptyChairAnnualisedPence = costOfEmptyChairPence * 52;

  // ── Patient Retention Curve ──
  const retentionCurve = computeRetentionCurve(patients, sessionRate);
  const biggestDropoff = retentionCurve.reduce(
    (max, step) =>
      step.dropoffFromPrevious > max.dropoff
        ? { session: step.session, dropoff: step.dropoffFromPrevious }
        : max,
    { session: 1, dropoff: 0 }
  );

  // ── Net Growth ──
  const weekIAs = completedWeek.filter((a) => a.isInitialAssessment);
  const newPatients = weekIAs.length;

  // Patients discharged this week
  const dischargedPatients = patients.filter((p) => {
    if (!p.discharged) return false;
    const updatedAt = new Date(p.updatedAt);
    return updatedAt >= weekStartDate && updatedAt < weekEndDate;
  }).length;

  // Ghost patients (>30 days no activity, not discharged)
  const ghostPatients = patients.filter((p) => {
    if (p.discharged) return false;
    if (!p.lastSessionDate) return false;
    const lastSession = new Date(p.lastSessionDate);
    const daysSince = Math.floor(
      (weekEndDate.getTime() - lastSession.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSince > GHOST_THRESHOLD_DAYS && !p.nextSessionDate;
  }).length;

  const netGrowth = newPatients - dischargedPatients;

  // ── Rebooking Lag ──
  const { avgLag, medianLag, overThreshold } = computeRebookingLag(
    appointments,
    patients
  );

  // ── Discharge Quality ──
  const discharged = patients.filter((p) => p.discharged);
  const properDischarges = discharged.filter(
    (p) => p.sessionCount >= p.treatmentLength && p.treatmentLength > 0
  ).length;
  const ghostDischarges = ghostPatients; // Ghost patients are effectively unmanaged discharges
  const dischargeQualityRate =
    properDischarges + ghostDischarges > 0
      ? properDischarges / (properDischarges + ghostDischarges)
      : 1;

  // ── Revenue Per Delivered Hour ──
  const totalRevenuePence = completedWeek.reduce(
    (sum, a) => sum + (a.revenueAmountPence || 0),
    0
  );
  // Estimate hours from appointment count (assume ~45 min average)
  const deliveredHours = completedWeek.length * 0.75;
  const revenuePerDeliveredHourPence =
    deliveredHours > 0 ? Math.round(totalRevenuePence / deliveredHours) : 0;

  // ── Patient Lifetime Value ──
  const { avgLtv, medianLtv, topSourceByLtv, insuranceLtv, selfPayLtv } =
    computeLifetimeValue(patients, appointments, sessionRate);

  return {
    clinicId,
    clinicianId,
    weekStart,
    costOfEmptyChairPence,
    costOfEmptyChairAnnualisedPence,
    dnaSlots,
    unfilledSlots,
    retentionCurve,
    biggestDropoffSession: biggestDropoff.session,
    biggestDropoffPercent: biggestDropoff.dropoff,
    newPatients,
    dischargedPatients,
    ghostPatients,
    netGrowth,
    avgRebookingLagDays: avgLag,
    medianRebookingLagDays: medianLag,
    patientsOverThreshold: overThreshold,
    properDischarges,
    ghostDischarges,
    dischargeQualityRate,
    revenuePerDeliveredHourPence,
    avgLifetimeValuePence: avgLtv,
    medianLifetimeValuePence: medianLtv,
    topReferralSourceByLtv: topSourceByLtv,
    insuranceLtvPence: insuranceLtv,
    selfPayLtvPence: selfPayLtv,
    computedAt: now,
  };
}

// ─── Retention Curve ─────────────────────────────────────────────────────────

function computeRetentionCurve(
  patients: PatientLike[],
  sessionRate: number
): RetentionStep[] {
  // Only include patients who've had at least 1 session (exclude brand new)
  const activePatients = patients.filter((p) => p.sessionCount > 0);
  const totalIAs = activePatients.length;

  if (totalIAs === 0) {
    return Array.from({ length: MAX_RETENTION_SESSIONS }, (_, i) => ({
      session: i + 1,
      patientsReached: 0,
      percentOfInitial: 0,
      dropoffFromPrevious: 0,
      revenueLostPence: 0,
    }));
  }

  const steps: RetentionStep[] = [];

  for (let session = 1; session <= MAX_RETENTION_SESSIONS; session++) {
    const reached = activePatients.filter(
      (p) => p.sessionCount >= session
    ).length;
    const percentOfInitial = (reached / totalIAs) * 100;
    const previousReached =
      session === 1
        ? totalIAs
        : steps[session - 2].patientsReached;
    const droppedOff = previousReached - reached;
    const dropoffFromPrevious =
      previousReached > 0 ? (droppedOff / previousReached) * 100 : 0;

    // Revenue lost = patients who dropped off × remaining sessions × rate
    const remainingSessions = MAX_RETENTION_SESSIONS - session;
    const revenueLostPence = droppedOff * remainingSessions * sessionRate;

    steps.push({
      session,
      patientsReached: reached,
      percentOfInitial,
      dropoffFromPrevious,
      revenueLostPence,
    });
  }

  return steps;
}

// ─── Rebooking Lag ───────────────────────────────────────────────────────────

function computeRebookingLag(
  appointments: AppointmentLike[],
  patients: PatientLike[]
): { avgLag: number; medianLag: number; overThreshold: number } {
  // Group completed appointments by patient, sorted by date
  const patientAppts = new Map<string, AppointmentLike[]>();
  const completed = appointments
    .filter((a) => a.status === "completed")
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  for (const appt of completed) {
    const existing = patientAppts.get(appt.patientId) || [];
    existing.push(appt);
    patientAppts.set(appt.patientId, existing);
  }

  const lags: number[] = [];
  const patientMaxLags = new Map<string, number>();

  for (const [patientId, appts] of patientAppts) {
    if (appts.length < 2) continue;

    let maxLag = 0;
    for (let i = 1; i < appts.length; i++) {
      const prev = new Date(appts[i - 1].dateTime);
      const curr = new Date(appts[i].dateTime);
      const lagDays = Math.floor(
        (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
      );
      lags.push(lagDays);
      maxLag = Math.max(maxLag, lagDays);
    }
    patientMaxLags.set(patientId, maxLag);
  }

  if (lags.length === 0) {
    return { avgLag: 0, medianLag: 0, overThreshold: 0 };
  }

  const sorted = [...lags].sort((a, b) => a - b);
  const avgLag = Math.round(lags.reduce((s, l) => s + l, 0) / lags.length);
  const medianLag = sorted[Math.floor(sorted.length / 2)];

  // Count patients whose max lag exceeds threshold (active, not discharged)
  const activePatientIds = new Set(
    patients.filter((p) => !p.discharged).map((p) => p.id)
  );
  let overThreshold = 0;
  for (const [patientId, maxLag] of patientMaxLags) {
    if (activePatientIds.has(patientId) && maxLag > REBOOKING_LAG_RISK_DAYS) {
      overThreshold++;
    }
  }

  return { avgLag, medianLag, overThreshold };
}

// ─── Patient Lifetime Value ──────────────────────────────────────────────────

function computeLifetimeValue(
  patients: PatientLike[],
  appointments: AppointmentLike[],
  sessionRate: number
): {
  avgLtv: number;
  medianLtv: number;
  topSourceByLtv: string | undefined;
  insuranceLtv: number | undefined;
  selfPayLtv: number | undefined;
} {
  // Only consider discharged patients or patients with 2+ sessions for meaningful LTV
  const eligiblePatients = patients.filter(
    (p) => p.discharged || p.sessionCount >= 2
  );

  if (eligiblePatients.length === 0) {
    return {
      avgLtv: 0,
      medianLtv: 0,
      topSourceByLtv: undefined,
      insuranceLtv: undefined,
      selfPayLtv: undefined,
    };
  }

  // Sum revenue per patient from appointments
  const revenueByPatient = new Map<string, number>();
  for (const appt of appointments) {
    if (appt.status !== "completed") continue;
    const current = revenueByPatient.get(appt.patientId) || 0;
    revenueByPatient.set(
      appt.patientId,
      current + (appt.revenueAmountPence || 0)
    );
  }

  // Calculate LTV per patient
  const ltvs: number[] = [];
  const ltvBySource = new Map<string, number[]>();
  const insuranceLtvs: number[] = [];
  const selfPayLtvs: number[] = [];

  for (const patient of eligiblePatients) {
    const revenue = revenueByPatient.get(patient.id) || 0;
    // If no revenue data, estimate from session count
    const ltv = revenue > 0 ? revenue : patient.sessionCount * sessionRate;
    ltvs.push(ltv);

    // By referral source
    const source = patient.referralSource?.type || "unknown";
    const sourceLtvs = ltvBySource.get(source) || [];
    sourceLtvs.push(ltv);
    ltvBySource.set(source, sourceLtvs);

    // Insurance vs self-pay
    if (patient.insuranceFlag) {
      insuranceLtvs.push(ltv);
    } else {
      selfPayLtvs.push(ltv);
    }
  }

  const sorted = [...ltvs].sort((a, b) => a - b);
  const avgLtv = Math.round(ltvs.reduce((s, l) => s + l, 0) / ltvs.length);
  const medianLtv = sorted[Math.floor(sorted.length / 2)];

  // Top referral source by avg LTV
  let topSourceByLtv: string | undefined;
  let topSourceAvgLtv = 0;
  for (const [source, sourceLtvs] of ltvBySource) {
    if (sourceLtvs.length < 3) continue; // Need meaningful sample
    const sourceAvg = sourceLtvs.reduce((s, l) => s + l, 0) / sourceLtvs.length;
    if (sourceAvg > topSourceAvgLtv) {
      topSourceAvgLtv = sourceAvg;
      topSourceByLtv = source;
    }
  }

  return {
    avgLtv,
    medianLtv,
    topSourceByLtv,
    insuranceLtv:
      insuranceLtvs.length > 0
        ? Math.round(insuranceLtvs.reduce((s, l) => s + l, 0) / insuranceLtvs.length)
        : undefined,
    selfPayLtv:
      selfPayLtvs.length > 0
        ? Math.round(selfPayLtvs.reduce((s, l) => s + l, 0) / selfPayLtvs.length)
        : undefined,
  };
}

// ─── Data Loading Helpers ────────────────────────────────────────────────────

type AppointmentLike = Pick<
  Appointment,
  | "id"
  | "patientId"
  | "clinicianId"
  | "dateTime"
  | "status"
  | "appointmentType"
  | "isInitialAssessment"
  | "revenueAmountPence"
>;

type PatientLike = Pick<
  Patient,
  | "id"
  | "clinicianId"
  | "sessionCount"
  | "treatmentLength"
  | "discharged"
  | "lastSessionDate"
  | "nextSessionDate"
  | "updatedAt"
  | "referralSource"
  | "insuranceFlag"
>;

async function loadAppointments(
  db: Firestore,
  clinicId: string
): Promise<AppointmentLike[]> {
  const snap = await db
    .collection(`clinics/${clinicId}/appointments`)
    .orderBy("dateTime", "desc")
    .limit(5000) // Reasonable ceiling
    .get();
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as AppointmentLike
  );
}

async function loadPatients(
  db: Firestore,
  clinicId: string
): Promise<PatientLike[]> {
  const snap = await db.collection(`clinics/${clinicId}/patients`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PatientLike);
}

async function loadActiveClinicians(
  db: Firestore,
  clinicId: string
): Promise<{ id: string }[]> {
  const snap = await db
    .collection(`clinics/${clinicId}/clinicians`)
    .where("active", "==", true)
    .get();
  return snap.docs.map((d) => ({ id: d.id }));
}

