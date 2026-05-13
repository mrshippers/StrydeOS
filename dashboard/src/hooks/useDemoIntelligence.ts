import type { OutcomeMeasureType } from "@/types";
import { getDemoRevPerSession, getDemoLatestAppts } from "./useDemoData";

// ─── Revenue Intelligence ────────────────────────────────────────────────────

export interface RevenueByClinician {
  clinicianId: string;
  clinicianName: string;
  totalRevenuePence: number;
  sessionsDelivered: number;
  revenuePerSessionPence: number;
  insurancePct: number;
}

export interface RevenueByCondition {
  condition: string;
  totalRevenuePence: number;
  sessions: number;
  avgSessionsPence: number;
}

// ─── DNA Analysis ────────────────────────────────────────────────────────────

export interface DnaByDay {
  day: string;
  shortDay: string;
  dnaCount: number;
  totalAppointments: number;
  dnaRate: number;
}

export interface DnaBySlot {
  slot: string;
  dnaCount: number;
  totalAppointments: number;
  dnaRate: number;
}

// ─── Referral Sources ────────────────────────────────────────────────────────

export interface ReferralSource {
  source: string;
  type: "gp" | "consultant" | "self" | "word_of_mouth" | "online" | "insurance";
  patientsReferred: number;
  convertedToBooking: number;
  totalRevenuePence: number;
  avgTreatmentLength: number;
}

// ─── Outcome Measures ────────────────────────────────────────────────────────

export interface OutcomeTrend {
  measureType: OutcomeMeasureType;
  shortName: string;
  dataPoints: { weekStart: string; avgScore: number; patientCount: number }[];
}

// ─── NPS & Reviews ───────────────────────────────────────────────────────────

export interface NpsData {
  score: number;
  promoters: number;
  passives: number;
  detractors: number;
  totalResponses: number;
  trend: { month: string; score: number }[];
}

export interface ReviewVelocity {
  platform: string;
  totalReviews: number;
  avgRating: number;
  monthlyVelocity: { month: string; count: number }[];
}

// ─── Demo Data ───────────────────────────────────────────────────────────────
// All revenue values are realistic for UK private physio practices.
// A 3-clinician practice doing ~60 sessions/week at ~£65-85/session = £3,900-£5,100/week.

export function getDemoRevenueByClinician(): RevenueByClinician[] {
  const rps = getDemoRevPerSession();
  // Clinician session splits: James 30%, Alex 38%, Sam 32% of total
  const totalAppts = getDemoLatestAppts();
  const jSessions = Math.round(totalAppts * 0.30);
  const aSessions = Math.round(totalAppts * 0.38);
  const sSessions = Math.round(totalAppts * 0.32);

  return [
    { clinicianId: "c-james", clinicianName: "James", totalRevenuePence: jSessions * rps, sessionsDelivered: jSessions, revenuePerSessionPence: rps, insurancePct: 0.14 },
    { clinicianId: "c-alex", clinicianName: "Alex", totalRevenuePence: aSessions * rps, sessionsDelivered: aSessions, revenuePerSessionPence: rps, insurancePct: 0.25 },
    { clinicianId: "c-sam", clinicianName: "Sam", totalRevenuePence: sSessions * rps, sessionsDelivered: sSessions, revenuePerSessionPence: rps, insurancePct: 0.30 },
  ];
}

export function getDemoRevenueByCondition(): RevenueByCondition[] {
  const rps = getDemoRevPerSession();
  return [
    { condition: "Low Back Pain", totalRevenuePence: 24 * rps, sessions: 24, avgSessionsPence: rps },
    { condition: "Shoulder Impingement", totalRevenuePence: 15 * rps, sessions: 15, avgSessionsPence: rps },
    { condition: "ACL Rehab (Post-Op)", totalRevenuePence: 12 * rps, sessions: 12, avgSessionsPence: Math.round(rps * 1.1) },
    { condition: "Neck Pain / Cervicogenic HA", totalRevenuePence: 10 * rps, sessions: 10, avgSessionsPence: rps },
    { condition: "Achilles Tendinopathy", totalRevenuePence: 7 * rps, sessions: 7, avgSessionsPence: Math.round(rps * 0.92) },
  ];
}

export function getDemoDnaByDay(): DnaByDay[] {
  return [
    { day: "Monday", shortDay: "Mon", dnaCount: 1, totalAppointments: 14, dnaRate: 0.071 },
    { day: "Tuesday", shortDay: "Tue", dnaCount: 0, totalAppointments: 13, dnaRate: 0.0 },
    { day: "Wednesday", shortDay: "Wed", dnaCount: 2, totalAppointments: 15, dnaRate: 0.133 },
    { day: "Thursday", shortDay: "Thu", dnaCount: 0, totalAppointments: 13, dnaRate: 0.0 },
    { day: "Friday", shortDay: "Fri", dnaCount: 1, totalAppointments: 13, dnaRate: 0.077 },
  ];
}

export function getDemoDnaBySlot(): DnaBySlot[] {
  return [
    { slot: "08:00–10:00", dnaCount: 2, totalAppointments: 16, dnaRate: 0.125 },
    { slot: "10:00–12:00", dnaCount: 0, totalAppointments: 18, dnaRate: 0.0 },
    { slot: "12:00–14:00", dnaCount: 0, totalAppointments: 10, dnaRate: 0.0 },
    { slot: "14:00–16:00", dnaCount: 1, totalAppointments: 14, dnaRate: 0.071 },
    { slot: "16:00–18:00", dnaCount: 1, totalAppointments: 10, dnaRate: 0.1 },
  ];
}

export function getDemoReferralSources(): ReferralSource[] {
  const rps = getDemoRevPerSession();
  return [
    { source: "Local GP Practice", type: "gp", patientsReferred: 8, convertedToBooking: 7, totalRevenuePence: 7 * 5.6 * rps, avgTreatmentLength: 5.6 },
    { source: "Self-referred (Google)", type: "online", patientsReferred: 12, convertedToBooking: 10, totalRevenuePence: 10 * 4.2 * rps, avgTreatmentLength: 4.2 },
    { source: "Consultant Referral (Ortho)", type: "consultant", patientsReferred: 4, convertedToBooking: 4, totalRevenuePence: 4 * 7.0 * rps, avgTreatmentLength: 7.0 },
    { source: "Word of Mouth", type: "word_of_mouth", patientsReferred: 6, convertedToBooking: 5, totalRevenuePence: 5 * 4.8 * rps, avgTreatmentLength: 4.8 },
    { source: "Bupa Direct", type: "insurance", patientsReferred: 5, convertedToBooking: 5, totalRevenuePence: 5 * 6.0 * rps, avgTreatmentLength: 6.0 },
    { source: "AXA Health", type: "insurance", patientsReferred: 3, convertedToBooking: 3, totalRevenuePence: 3 * 5.5 * rps, avgTreatmentLength: 5.5 },
  ];
}

export function getDemoOutcomeTrends(): OutcomeTrend[] {
  return [
    {
      measureType: "nprs",
      shortName: "NPRS",
      dataPoints: [
        { weekStart: "2026-01-12", avgScore: 6.2, patientCount: 18 },
        { weekStart: "2026-01-19", avgScore: 5.8, patientCount: 20 },
        { weekStart: "2026-01-26", avgScore: 5.3, patientCount: 22 },
        { weekStart: "2026-02-02", avgScore: 4.8, patientCount: 21 },
        { weekStart: "2026-02-09", avgScore: 4.4, patientCount: 23 },
        { weekStart: "2026-02-17", avgScore: 3.9, patientCount: 24 },
      ],
    },
    {
      measureType: "psfs",
      shortName: "PSFS",
      dataPoints: [
        { weekStart: "2026-01-12", avgScore: 4.1, patientCount: 15 },
        { weekStart: "2026-01-19", avgScore: 4.5, patientCount: 17 },
        { weekStart: "2026-01-26", avgScore: 5.0, patientCount: 19 },
        { weekStart: "2026-02-02", avgScore: 5.4, patientCount: 18 },
        { weekStart: "2026-02-09", avgScore: 5.8, patientCount: 20 },
        { weekStart: "2026-02-17", avgScore: 6.3, patientCount: 22 },
      ],
    },
  ];
}

export function getDemoNps(): NpsData {
  return {
    score: 72,
    promoters: 31,
    passives: 8,
    detractors: 3,
    totalResponses: 42,
    trend: [
      { month: "Oct", score: 64 },
      { month: "Nov", score: 67 },
      { month: "Dec", score: 69 },
      { month: "Jan", score: 70 },
      { month: "Feb", score: 72 },
    ],
  };
}

export function getDemoReviewVelocity(): ReviewVelocity {
  return {
    platform: "Google",
    totalReviews: 47,
    avgRating: 4.8,
    monthlyVelocity: [
      { month: "Oct", count: 3 },
      { month: "Nov", count: 5 },
      { month: "Dec", count: 4 },
      { month: "Jan", count: 7 },
      { month: "Feb", count: 9 },
    ],
  };
}

// ─── Clinician KPI Sparklines ─────────────────────────────────────────────────

export interface ClinicianKpiRow {
  clinicianId: string;
  clinicianName: string;
  rebookRate: number;
  utilisationRate: number;
  dnaRate: number;
  activePatients: number;
  rebookTrend: number[];
  utilisationTrend: number[];
  dnaTrend: number[];
  hepComplianceRate: number;       // 0–1
  hepTrend: number[];              // weekly values
  revenuePerSessionPence: number;
  revPerSessionTrend: number[];
  drilldown: {
    active: { name: string; sessions: string; lastSeen: string }[];
    droppedOff: { name: string; lastSeen: string; reason: string }[];
    completed: { name: string; sessions: number }[];
  };
}

export function getDemoClinicianKpis(): ClinicianKpiRow[] {
  return [
    {
      clinicianId: "c-alex",
      clinicianName: "Alex",
      rebookRate: 2.9,
      utilisationRate: 0.88,
      dnaRate: 0.04,
      activePatients: 24,
      rebookTrend: [2.4, 2.5, 2.6, 2.7, 2.8, 2.9],
      utilisationTrend: [0.82, 0.84, 0.87, 0.85, 0.88, 0.88],
      dnaTrend: [0.08, 0.06, 0.05, 0.05, 0.04, 0.04],
      hepComplianceRate: 0.71,
      hepTrend: [0.65, 0.68, 0.71, 0.74, 0.71, 0.73, 0.71, 0.72],
      revenuePerSessionPence: 7500,
      revPerSessionTrend: [7200, 7400, 7500, 7600, 7500, 7800, 7500, 7600],
      drilldown: {
        active: [
          { name: "Sarah Mitchell", sessions: "3/6", lastSeen: "2d" },
          { name: "David Chen", sessions: "2/5", lastSeen: "4d" },
          { name: "Mark Jeffries", sessions: "5/8", lastSeen: "1d" },
        ],
        droppedOff: [
          { name: "Rachel Hume", lastSeen: "24d", reason: "No rebooking after session 3" },
          { name: "Oliver Park", lastSeen: "18d", reason: "No rebooking after session 2" },
        ],
        completed: [
          { name: "Karen Walsh", sessions: 6 },
          { name: "Brendan Lee", sessions: 8 },
        ],
      },
    },
    {
      clinicianId: "c-sam",
      clinicianName: "Sam",
      rebookRate: 2.5,
      utilisationRate: 0.84,
      dnaRate: 0.07,
      activePatients: 23,
      rebookTrend: [2.1, 2.2, 2.3, 2.3, 2.4, 2.5],
      utilisationTrend: [0.80, 0.81, 0.82, 0.83, 0.83, 0.84],
      dnaTrend: [0.09, 0.09, 0.08, 0.08, 0.07, 0.07],
      hepComplianceRate: 0.55,
      hepTrend: [0.48, 0.50, 0.52, 0.54, 0.55, 0.55, 0.56, 0.55],
      revenuePerSessionPence: 6800,
      revPerSessionTrend: [6500, 6600, 6700, 6800, 6750, 6800, 6850, 6800],
      drilldown: {
        active: [
          { name: "Tom Edwards", sessions: "4/6", lastSeen: "2d" },
          { name: "Priya Nair", sessions: "1/5", lastSeen: "6d" },
        ],
        droppedOff: [
          { name: "George Morton", lastSeen: "31d", reason: "No rebooking after session 4" },
        ],
        completed: [
          { name: "Sophie Clarke", sessions: 5 },
        ],
      },
    },
    {
      clinicianId: "c-james",
      clinicianName: "James",
      rebookRate: 3.4,
      utilisationRate: 0.76,
      dnaRate: 0.03,
      activePatients: 21,
      rebookTrend: [2.9, 3.0, 3.1, 3.2, 3.3, 3.4],
      utilisationTrend: [0.71, 0.72, 0.74, 0.75, 0.75, 0.76],
      dnaTrend: [0.06, 0.05, 0.04, 0.04, 0.03, 0.03],
      hepComplianceRate: 0.84,
      hepTrend: [0.79, 0.81, 0.82, 0.83, 0.84, 0.85, 0.84, 0.84],
      revenuePerSessionPence: 8200,
      revPerSessionTrend: [7900, 8000, 8100, 8200, 8150, 8200, 8250, 8200],
      drilldown: {
        active: [
          { name: "Amy Richardson", sessions: "2/6", lastSeen: "3d" },
          { name: "Dan O'Brien", sessions: "6/8", lastSeen: "1d" },
          { name: "Chloe Evans", sessions: "1/5", lastSeen: "5d" },
        ],
        droppedOff: [],
        completed: [
          { name: "James Patel", sessions: 6 },
          { name: "Natalie Ross", sessions: 4 },
          { name: "Will Chambers", sessions: 8 },
        ],
      },
    },
  ];
}

// ─── Peer Benchmark Data ──────────────────────────────────────────────────────

export interface BenchmarkComparison {
  metric: string;
  yourValue: number;
  peerMedian: number;
  peerTop25: number;
  unit: "percent" | "number" | "pence" | "ratio";
  higherIsBetter: boolean;
}

// Peer benchmarks sourced from the UK Private Practice Barometer 2026 (HMDG, n=715 UK clinic owners).
// https://hmdg.co.uk/private-practice-barometer/
// - Rebook ratio (follow-ups per initial) derived from PPB "sessions per episode": median 5.0 → 4.0 follow-ups, top-25 6.0 → 5.0 follow-ups.
// - DNA: 11% without automated reminders, 6.3% with (PPB "Technology Impact").
// - Utilisation: 72.3% industry avg, 70–80% optimal zone (PPB "Operations").
// - NPS: no UK physio-specific benchmark; broader healthcare NPS median ~37, excellent 50+ (Retently 2026, CustomerGauge).
// - Rev/session (pence): physio median £63 follow-up / £74 initial per PPB pricing table; blended ~£68 = 6800 pence.
export function getDemoBenchmarks(): BenchmarkComparison[] {
  const rps = getDemoRevPerSession();
  return [
    { metric: "Rebook Rate", yourValue: 2.9, peerMedian: 4.0, peerTop25: 5.0, unit: "ratio", higherIsBetter: true },
    { metric: "DNA Rate", yourValue: 0.063, peerMedian: 0.11, peerTop25: 0.063, unit: "percent", higherIsBetter: false },
    { metric: "Utilisation", yourValue: 0.76, peerMedian: 0.723, peerTop25: 0.80, unit: "percent", higherIsBetter: true },
    { metric: "NPS Score", yourValue: 50, peerMedian: 37, peerTop25: 58, unit: "number", higherIsBetter: true },
    { metric: "Rev / Session", yourValue: rps, peerMedian: 6800, peerTop25: 7400, unit: "pence", higherIsBetter: true },
  ];
}
