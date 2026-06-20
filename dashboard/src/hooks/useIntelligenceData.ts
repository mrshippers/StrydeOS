"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  subscribeWeeklyStats,
  subscribeWeeklyStatsBatch,
  subscribePatients,
  subscribeReviews,
  subscribeOutcomeScoresAll,
  subscribeAppointments,
  subscribeGoogleReviewsSummary,
  type GoogleReviewsSummary,
} from "@/lib/queries";
import type { WeeklyStats, Patient, Review, OutcomeScore, OutcomeMeasureType, Appointment } from "@/types";
import {
  getDemoRevenueByClinician,
  getDemoRevenueByCondition,
  getDemoDnaByDay,
  getDemoDnaBySlot,
  getDemoReferralSources,
  getDemoOutcomeTrends,
  getDemoReviewVelocity,
  getDemoClinicianKpis,
  getDemoBenchmarks,
  type RevenueByClinician,
  type RevenueByCondition,
  type DnaByDay,
  type DnaBySlot,
  type ReferralSource,
  type OutcomeTrend,
  type ReviewVelocity,
  type ClinicianKpiRow,
  type BenchmarkComparison,
} from "@/hooks/useDemoIntelligence";
import { deriveRevenueByCondition } from "@/lib/intelligence/derive-revenue-by-condition";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

const SLOT_ORDER = ["early_morning", "morning", "afternoon", "evening"];
const SLOT_LABELS: Record<string, string> = {
  early_morning: "08:00–10:00",
  morning: "10:00–13:00",
  afternoon: "13:00–16:00",
  evening: "16:00–18:00",
};

function getISOWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

// ─── Derivations ─────────────────────────────────────────────────────────────

function deriveRevenueByClinician(
  allStats: WeeklyStats[],
  clinicians: { id: string; name: string }[]
): RevenueByClinician[] {
  const map = new Map<string, { name: string; totalPence: number; sessions: number; insuranceSessions: number }>();

  for (const stat of allStats) {
    if (stat.clinicianId === "all") continue;
    const existing = map.get(stat.clinicianId);
    const revenue = (stat.revenuePerSessionPence ?? 0) * (stat.appointmentsTotal ?? 0);
    if (existing) {
      existing.totalPence += revenue;
      existing.sessions += stat.appointmentsTotal ?? 0;
    } else {
      map.set(stat.clinicianId, {
        name: stat.clinicianName,
        totalPence: revenue,
        sessions: stat.appointmentsTotal ?? 0,
        insuranceSessions: 0,
      });
    }
  }

  return Array.from(map.entries()).map(([clinicianId, v]) => ({
    clinicianId,
    clinicianName: v.name,
    totalRevenuePence: v.totalPence,
    sessionsDelivered: v.sessions,
    revenuePerSessionPence: v.sessions > 0 ? Math.round(v.totalPence / v.sessions) : 0,
    insurancePct: 0, // not yet derivable without insurance flag on appointments
  }));
}

function deriveDnaByDay(allStats: WeeklyStats[], clinicianId: string): DnaByDay[] {
  const totals: Record<string, { dnaCount: number; total: number }> = {};
  for (const day of DAY_ORDER) {
    totals[day] = { dnaCount: 0, total: 0 };
  }

  const relevant = clinicianId === "all"
    ? allStats.filter((s) => s.clinicianId === "all")
    : allStats.filter((s) => s.clinicianId === clinicianId);

  for (const stat of relevant) {
    const byDay = stat.dnaByDayOfWeek ?? {};
    for (const [day, count] of Object.entries(byDay)) {
      if (totals[day]) totals[day].dnaCount += count as number;
    }
    // total appointments per day is not stored; use proportional estimate from appointmentsTotal
    // For now accumulate dna counts only and derive rate from overall dna rate
    // The total booked per day is not tracked individually — store dna count, total = dnaCount / dnaRate
    const dnaRate = stat.dnaRate ?? 0;
    const totalAppts = stat.appointmentsTotal ?? 0;
    const dnaTotal = Math.round(totalAppts * dnaRate);
    // distribute totalAppts proportionally by dna day counts
    const dayDnas = Object.entries(byDay);
    const dayDnaSum = dayDnas.reduce((s, [, c]) => s + (c as number), 0);
    if (dayDnaSum > 0) {
      for (const [day, count] of dayDnas) {
        if (totals[day]) {
          const frac = (count as number) / dayDnaSum;
          totals[day].total += Math.round(totalAppts * frac);
        }
      }
    }
  }

  return DAY_ORDER.map((day) => {
    const { dnaCount, total } = totals[day];
    return {
      day: DAY_LABELS[day] ?? day,
      shortDay: day,
      dnaCount,
      totalAppointments: total,
      dnaRate: total > 0 ? dnaCount / total : 0,
    };
  });
}

function deriveDnaBySlot(allStats: WeeklyStats[], clinicianId: string): DnaBySlot[] {
  const totals: Record<string, { dnaCount: number; total: number }> = {};
  for (const slot of SLOT_ORDER) {
    totals[slot] = { dnaCount: 0, total: 0 };
  }

  const relevant = clinicianId === "all"
    ? allStats.filter((s) => s.clinicianId === "all")
    : allStats.filter((s) => s.clinicianId === clinicianId);

  for (const stat of relevant) {
    const bySlot = stat.dnaByTimeSlot ?? {};
    const totalAppts = stat.appointmentsTotal ?? 0;
    const slotEntries = Object.entries(bySlot);
    const slotDnaSum = slotEntries.reduce((s, [, c]) => s + (c as number), 0);

    for (const [slot, count] of slotEntries) {
      if (totals[slot]) {
        totals[slot].dnaCount += count as number;
        if (slotDnaSum > 0) {
          totals[slot].total += Math.round(totalAppts * ((count as number) / slotDnaSum));
        }
      }
    }
  }

  return SLOT_ORDER.map((slot) => {
    const { dnaCount, total } = totals[slot];
    return {
      slot: SLOT_LABELS[slot] ?? slot,
      dnaCount,
      totalAppointments: total,
      dnaRate: total > 0 ? dnaCount / total : 0,
    };
  });
}

function deriveReferrals(patients: Patient[], avgRevPerSession: number): ReferralSource[] {
  const map = new Map<string, {
    source: string;
    type: ReferralSource["type"];
    patientsReferred: number;
    convertedToBooking: number;
    totalRevenuePence: number;
    totalTreatmentLength: number;
  }>();

  for (const p of patients) {
    const ref = p.referralSource;
    if (!ref?.name) continue;
    const key = ref.name;
    const existing = map.get(key);
    const revenue = (p.sessionCount ?? 0) * avgRevPerSession;
    if (existing) {
      existing.patientsReferred += 1;
      if (p.sessionCount > 0) existing.convertedToBooking += 1;
      existing.totalRevenuePence += revenue;
      existing.totalTreatmentLength += p.treatmentLength ?? 0;
    } else {
      map.set(key, {
        source: ref.name,
        type: (ref.type ?? "self") as ReferralSource["type"],
        patientsReferred: 1,
        convertedToBooking: p.sessionCount > 0 ? 1 : 0,
        totalRevenuePence: revenue,
        totalTreatmentLength: p.treatmentLength ?? 0,
      });
    }
  }

  return Array.from(map.values())
    .map((v) => ({
      source: v.source,
      type: v.type,
      patientsReferred: v.patientsReferred,
      convertedToBooking: v.convertedToBooking,
      totalRevenuePence: v.totalRevenuePence,
      avgTreatmentLength: v.patientsReferred > 0
        ? Math.round((v.totalTreatmentLength / v.patientsReferred) * 10) / 10
        : 0,
    }))
    .sort((a, b) => b.totalRevenuePence - a.totalRevenuePence);
}

function deriveOutcomeTrends(outcomeScores: OutcomeScore[]): OutcomeTrend[] {
  // Group by measureType → weekStart → aggregate scores
  const byMeasure = new Map<OutcomeMeasureType, Map<string, { total: number; count: number }>>();

  for (const score of outcomeScores) {
    const weekStart = getISOWeekStart(score.recordedAt);
    if (!byMeasure.has(score.measureType)) {
      byMeasure.set(score.measureType, new Map());
    }
    const byWeek = byMeasure.get(score.measureType)!;
    const existing = byWeek.get(weekStart);
    if (existing) {
      existing.total += score.score;
      existing.count += 1;
    } else {
      byWeek.set(weekStart, { total: score.score, count: 1 });
    }
  }

  const SHORT_NAMES: Partial<Record<OutcomeMeasureType, string>> = {
    nprs: "NPRS", psfs: "PSFS", quickdash: "QuickDASH",
    odi: "ODI", ndi: "NDI", oxford_knee: "Oxford Knee",
    oxford_hip: "Oxford Hip", koos: "KOOS", hoos: "HOOS",
    visa_a: "VISA-A", visa_p: "VISA-P",
  };

  const trends: OutcomeTrend[] = [];
  for (const [measureType, byWeek] of byMeasure.entries()) {
    const dataPoints = Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, { total, count }]) => ({
        weekStart,
        avgScore: Math.round((total / count) * 10) / 10,
        patientCount: count,
      }));
    trends.push({
      measureType,
      shortName: SHORT_NAMES[measureType] ?? measureType.toUpperCase(),
      dataPoints,
    });
  }
  return trends;
}


function deriveReviewVelocity(reviews: Review[]): ReviewVelocity {
  if (reviews.length === 0) {
    return { platform: "Google", totalReviews: 0, avgRating: 0, monthlyVelocity: [] };
  }

  const google = reviews.filter((r) => r.platform === "google");
  const target = google.length > 0 ? google : reviews;
  const platform = google.length > 0 ? "Google" : "All platforms";
  const avgRating = target.reduce((s, r) => s + r.rating, 0) / target.length;

  const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthMap = new Map<string, number>();
  for (const r of target) {
    const month = r.date.slice(0, 7);
    monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
  }
  const monthlyVelocity = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([ym, count]) => ({
      month: MONTH_SHORT[parseInt(ym.slice(5, 7), 10) - 1] ?? ym,
      count,
    }));

  return {
    platform,
    totalReviews: target.length,
    avgRating: Math.round(avgRating * 10) / 10,
    monthlyVelocity,
  };
}

function deriveClinicianKpis(allStats: WeeklyStats[], patients: Patient[]): ClinicianKpiRow[] {
  // Collect unique clinicianIds (excluding "all")
  const clinicianIds = [...new Set(allStats.filter((s) => s.clinicianId !== "all").map((s) => s.clinicianId))];

  return clinicianIds.map((cid) => {
    const clinicianStats = allStats
      .filter((s) => s.clinicianId === cid)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    const latest = clinicianStats[clinicianStats.length - 1];
    const name = latest?.clinicianName ?? cid;

    const rebookTrend = clinicianStats.map((s) => s.followUpRate ?? 0);
    const utilisationTrend = clinicianStats.map((s) => s.utilisationRate ?? 0);
    const dnaTrend = clinicianStats.map((s) => s.dnaRate ?? 0);
    const hepTrend = clinicianStats.map((s) => s.hepComplianceRate ?? 0);
    const revPerSessionTrend = clinicianStats.map((s) => s.revenuePerSessionPence ?? 0);

    const myPatients = patients.filter((p) => p.clinicianId === cid);
    const active = myPatients
      .filter((p) => !p.discharged && !p.churnRisk)
      .map((p) => ({
        name: p.name,
        sessions: `${p.sessionCount}/${p.treatmentLength}`,
        lastSeen: p.lastSessionDate
          ? `${Math.round((Date.now() - new Date(p.lastSessionDate).getTime()) / 86400000)}d`
          : "—",
      }));
    const droppedOff = myPatients
      .filter((p) => p.churnRisk && !p.discharged)
      .map((p) => ({
        name: p.name,
        lastSeen: p.lastSessionDate
          ? `${Math.round((Date.now() - new Date(p.lastSessionDate).getTime()) / 86400000)}d`
          : "—",
        reason: `No rebooking after session ${p.sessionCount}`,
      }));
    const completed = myPatients
      .filter((p) => p.discharged)
      .map((p) => ({ name: p.name, sessions: p.sessionCount }));

    return {
      clinicianId: cid,
      clinicianName: name,
      rebookRate: latest?.followUpRate ?? 0,
      utilisationRate: latest?.utilisationRate ?? 0,
      dnaRate: latest?.dnaRate ?? 0,
      activePatients: active.length,
      rebookTrend,
      utilisationTrend,
      dnaTrend,
      hepComplianceRate: latest?.hepComplianceRate ?? 0,
      hepTrend,
      revenuePerSessionPence: latest?.revenuePerSessionPence ?? 0,
      revPerSessionTrend,
      drilldown: { active, droppedOff, completed },
    };
  });
}


// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface IntelligenceData {
  revByClinician: RevenueByClinician[];
  revByCondition: RevenueByCondition[];
  dnaByDay: DnaByDay[];
  dnaBySlot: DnaBySlot[];
  referrals: ReferralSource[];
  outcomeTrends: OutcomeTrend[];
  reviewVelocity: ReviewVelocity;
  clinicianKpis: ClinicianKpiRow[];
  benchmarks: BenchmarkComparison[];
  loading: boolean;
  /** True when the entire page is showing demo data (demo user) */
  usedDemo: boolean;
  /** True when outcomes tab is showing demo fallback (no real outcome_scores yet) */
  outcomesDemoFallback: boolean;
  /** True when reputation tab is showing demo fallback (no real reviews yet) */
  reputationDemoFallback: boolean;
  error: string | null;
}

export function useIntelligenceData(selectedClinician: string): IntelligenceData {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";
  const userRole = user?.role ?? "clinician";
  const userClinicianId = user?.clinicianId ?? null;

  // Clinician-scoped patient filter: clinicians only see their own patients,
  // owners/admins/superadmins see all (or the selected clinician filter).
  const effectivePatientClinicianId = useMemo(() => {
    if (userRole === "owner" || userRole === "admin" || userRole === "superadmin") {
      // Owners/admins can view any clinician or all
      return selectedClinician === "all" ? null : selectedClinician;
    }
    // Clinicians are always scoped to their own patients regardless of selection
    return userClinicianId;
  }, [userRole, userClinicianId, selectedClinician]);

  const [allStats, setAllStats] = useState<WeeklyStats[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [googleSummary, setGoogleSummary] = useState<GoogleReviewsSummary | null>(null);
  const [outcomeScores, setOutcomeScores] = useState<OutcomeScore[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [statsReady, setStatsReady] = useState(false);
  const [patientsReady, setPatientsReady] = useState(false);
  const [reviewsReady, setReviewsReady] = useState(false);
  const [outcomesReady, setOutcomesReady] = useState(false);
  const [appointmentsReady, setAppointmentsReady] = useState(false);

  const [usedDemo, setUsedDemo] = useState(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo || !clinicId) {
      setUsedDemo(true);
      setFirestoreError(null);
      setStatsReady(true);
      setPatientsReady(true);
      setReviewsReady(true);
      setOutcomesReady(true);
      setAppointmentsReady(true);
      return;
    }

    setFirestoreError(null);

    // "all" stats subscription — per-clinician stats merged below via single `in` query
    const unsubStats = subscribeWeeklyStats(
      clinicId,
      "all",
      (data) => { setAllStats(data); setStatsReady(true); },
      () => { setFirestoreError("Failed to load metrics. Check your connection and try again."); setStatsReady(true); }
    );

    const unsubPatients = subscribePatients(
      clinicId,
      effectivePatientClinicianId,
      (data) => { setPatients(data); setPatientsReady(true); },
      () => { setFirestoreError("Failed to load patient data. Check your connection and try again."); setPatientsReady(true); }
    );

    const unsubReviews = subscribeReviews(
      clinicId,
      (data) => { setReviews(data); setReviewsReady(true); },
      () => { setFirestoreError("Failed to load reviews. Check your connection and try again."); setReviewsReady(true); }
    );

    const unsubGoogleSummary = subscribeGoogleReviewsSummary(
      clinicId,
      (data) => { setGoogleSummary(data); },
      () => { /* non-fatal — falls back to cached review bodies */ }
    );

    const unsubOutcomes = subscribeOutcomeScoresAll(
      clinicId,
      (data) => { setOutcomeScores(data); setOutcomesReady(true); },
      () => { setFirestoreError("Failed to load outcome scores. Check your connection and try again."); setOutcomesReady(true); }
    );

    // Appointments for revenue-by-condition aggregation.
    // Scope: last 90 days, clinician filter honours Intelligence selection for clinicians
    // (owners/admins see all when `effectivePatientClinicianId` is null).
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const unsubAppointments = subscribeAppointments(
      clinicId,
      effectivePatientClinicianId,
      ninetyDaysAgo,
      (data) => { setAppointments(data); setAppointmentsReady(true); },
      () => { setFirestoreError("Failed to load appointments. Check your connection and try again."); setAppointmentsReady(true); }
    );

    return () => {
      unsubStats();
      unsubPatients();
      unsubReviews();
      unsubGoogleSummary();
      unsubOutcomes();
      unsubAppointments();
    };
  }, [clinicId, isDemo, effectivePatientClinicianId]);

  // Collect all unique clinicianIds from patients — stabilised to avoid listener thrashing
  const clinicianIdsRaw = useMemo(
    () => [...new Set(patients.map((p) => p.clinicianId).filter(Boolean))].sort(),
    [patients]
  );
  const clinicianIdsRef = useRef<string[]>([]);
  const clinicianIds = useMemo(() => {
    const key = clinicianIdsRaw.join(",");
    if (key !== clinicianIdsRef.current.join(",")) {
      clinicianIdsRef.current = clinicianIdsRaw;
    }
    return clinicianIdsRef.current;
  }, [clinicianIdsRaw]);

  const [perClinicianStatsMap, setPerClinicianStatsMap] = useState<Map<string, WeeklyStats[]>>(new Map());

  // Single batched Firestore listener replaces N per-clinician listeners
  useEffect(() => {
    if (isDemo || !clinicId || clinicianIds.length === 0) return;

    const unsub = subscribeWeeklyStatsBatch(
      clinicId,
      clinicianIds,
      (grouped) => setPerClinicianStatsMap(grouped),
      () => { /* Sentry captures via error boundary */ }
    );

    return unsub;
  }, [clinicId, isDemo, clinicianIds]);

  // Flatten per-clinician stats for derivations
  const flatPerClinicianStats = useMemo(() => {
    const result: WeeklyStats[] = [];
    for (const stats of perClinicianStatsMap.values()) {
      result.push(...stats);
    }
    return result;
  }, [perClinicianStatsMap]);

  const loading = !statsReady || !patientsReady || !reviewsReady || !outcomesReady || !appointmentsReady;

  const DEMO_RESULT = useMemo<IntelligenceData>(() => ({
    revByClinician: getDemoRevenueByClinician(),
    revByCondition: getDemoRevenueByCondition(),
    dnaByDay: getDemoDnaByDay(),
    dnaBySlot: getDemoDnaBySlot(),
    referrals: getDemoReferralSources(),
    outcomeTrends: getDemoOutcomeTrends(),
    reviewVelocity: getDemoReviewVelocity(),
    clinicianKpis: getDemoClinicianKpis(),
    benchmarks: getDemoBenchmarks(),
    loading: false,
    usedDemo: true,
    outcomesDemoFallback: true,
    reputationDemoFallback: true,
    error: null,
  }), []);

  const derived = useMemo<IntelligenceData>(() => {
    // Demo user — always show demo data with banner
    if (isDemo) return DEMO_RESULT;

    // Still loading — return empty skeleton state (never flash demo data for real users)
    if (loading) {
      return {
        revByClinician: [], revByCondition: [],
        dnaByDay: [], dnaBySlot: [],
        referrals: [], outcomeTrends: [],
        reviewVelocity: { platform: "Google", totalReviews: 0, avgRating: 0, monthlyVelocity: [] },
        clinicianKpis: [], benchmarks: [],
        loading: true, usedDemo: false,
        outcomesDemoFallback: false, reputationDemoFallback: false,
        error: null,
      };
    }

    // Firestore error — return empty data + error, never demo
    if (firestoreError) {
      return {
        revByClinician: [], revByCondition: [],
        dnaByDay: [], dnaBySlot: [],
        referrals: [], outcomeTrends: [],
        reviewVelocity: { platform: "Google", totalReviews: 0, avgRating: 0, monthlyVelocity: [] },
        clinicianKpis: [], benchmarks: [],
        loading: false, usedDemo: false,
        outcomesDemoFallback: false, reputationDemoFallback: false,
        error: firestoreError,
      };
    }

    // Get latest all-clinician stat for avg revenue per session
    const latestAll = [...allStats].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
    const avgRevPerSession = latestAll?.revenuePerSessionPence ?? 0;

    const revByClinician = deriveRevenueByClinician(flatPerClinicianStats, []);
    const revByCondition = deriveRevenueByCondition(appointments);
    const dnaByDay = deriveDnaByDay(
      selectedClinician === "all" ? allStats : flatPerClinicianStats,
      selectedClinician
    );
    const dnaBySlot = deriveDnaBySlot(
      selectedClinician === "all" ? allStats : flatPerClinicianStats,
      selectedClinician
    );
    const referrals = deriveReferrals(patients, avgRevPerSession);
    const outcomeTrends = deriveOutcomeTrends(outcomeScores);
    const reviewVelocityRaw = deriveReviewVelocity(reviews);
    // Google Places API only returns up to 5 review bodies per request, so the
    // cached review count massively understates reality. When we have the
    // aggregate summary from the pipeline, it wins for totals and avg rating.
    const reviewVelocity = googleSummary
      ? {
          ...reviewVelocityRaw,
          totalReviews: googleSummary.totalReviews || reviewVelocityRaw.totalReviews,
          avgRating: googleSummary.avgRating
            ? Math.round(googleSummary.avgRating * 10) / 10
            : reviewVelocityRaw.avgRating,
        }
      : reviewVelocityRaw;
    const clinicianKpis = deriveClinicianKpis(flatPerClinicianStats, patients);

    // Benchmarks: "You:" values derived from the canonical kpis/* projection
    // (written by compute-kpis.ts). Peer baselines are static until multi-clinic
    // aggregation is built. NPS sourced from kpis/nps, not a client-side recompute.
    const latestKpiAll = allStats
      .filter((s) => s.clinicianId === "all")
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
    const benchmarks: BenchmarkComparison[] = [
      { metric: "Rebook Rate", yourValue: Math.round((latestKpiAll?.followUpRate ?? 0) * 10) / 10, peerMedian: 2.2, peerTop25: 3.5, unit: "ratio", higherIsBetter: true },
      { metric: "DNA Rate", yourValue: Math.round((latestKpiAll?.dnaRate ?? 0) * 100) / 100, peerMedian: 0.08, peerTop25: 0.04, unit: "percent", higherIsBetter: false },
      { metric: "Utilisation", yourValue: Math.round((latestKpiAll?.utilisationRate ?? 0) * 100) / 100, peerMedian: 0.74, peerTop25: 0.90, unit: "percent", higherIsBetter: true },
      { metric: "NPS Score", yourValue: 0, peerMedian: 58, peerTop25: 78, unit: "number", higherIsBetter: true },
      { metric: "Rev / Session", yourValue: avgRevPerSession > 0 ? avgRevPerSession : 0, peerMedian: 7500, peerTop25: 9000, unit: "pence", higherIsBetter: true },
    ];

    // INTELLIGENCE_AUDIT.md issue 5: expose empty-state flags for the page to
    // render its own empty state. Do NOT substitute demo data for real clinics
    // with no outcome_scores or reviews yet. A connected Google Business
    // Profile with userRatingCount > 0 also lifts the reputation empty state.
    const outcomesDemoFallback = outcomeTrends.length === 0;
    const hasGoogleSummary = (googleSummary?.totalReviews ?? 0) > 0;
    const reputationDemoFallback = reviews.length === 0 && !hasGoogleSummary;

    return {
      revByClinician,
      revByCondition,
      dnaByDay,
      dnaBySlot,
      referrals,
      outcomeTrends, // empty array for real clinics with no outcome_scores - no demo substitute
      reviewVelocity,
      clinicianKpis,
      benchmarks,
      loading,
      error: null,
      usedDemo: false,
      outcomesDemoFallback,
      reputationDemoFallback,
    };
  }, [allStats, flatPerClinicianStats, patients, reviews, googleSummary, outcomeScores, appointments, loading, isDemo, selectedClinician, firestoreError, DEMO_RESULT]);

  return { ...derived, loading };
}
