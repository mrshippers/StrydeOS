import type { OutcomeMeasureType } from "@/types";

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
  avgCourseLength: number;
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

export function getDemoRevenueByClinician(): RevenueByClinician[] {
  return [
    { clinicianId: "c-james", clinicianName: "James", totalRevenuePence: 1620000, sessionsDelivered: 21, revenuePerSessionPence: 7720, insurancePct: 0.14 },
    { clinicianId: "c-alex", clinicianName: "Alex", totalRevenuePence: 2040000, sessionsDelivered: 24, revenuePerSessionPence: 8500, insurancePct: 0.25 },
    { clinicianId: "c-sam", clinicianName: "Sam", totalRevenuePence: 1794000, sessionsDelivered: 23, revenuePerSessionPence: 7800, insurancePct: 0.30 },
  ];
}

export function getDemoRevenueByCondition(): RevenueByCondition[] {
  return [
    { condition: "Low Back Pain", totalRevenuePence: 1890000, sessions: 24, avgSessionsPence: 7875 },
    { condition: "Shoulder Impingement", totalRevenuePence: 1260000, sessions: 15, avgSessionsPence: 8400 },
    { condition: "ACL Rehab (Post-Op)", totalRevenuePence: 1050000, sessions: 12, avgSessionsPence: 8750 },
    { condition: "Neck Pain / Cervicogenic HA", totalRevenuePence: 780000, sessions: 10, avgSessionsPence: 7800 },
    { condition: "Achilles Tendinopathy", totalRevenuePence: 474000, sessions: 7, avgSessionsPence: 6771 },
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
  return [
    { source: "Dr. Sarah Howell (GP)", type: "gp", patientsReferred: 8, convertedToBooking: 7, totalRevenuePence: 3920000, avgCourseLength: 5.6 },
    { source: "Self-referred (Google)", type: "online", patientsReferred: 12, convertedToBooking: 10, totalRevenuePence: 4200000, avgCourseLength: 4.2 },
    { source: "Mr. James Chen (Ortho)", type: "consultant", patientsReferred: 4, convertedToBooking: 4, totalRevenuePence: 2800000, avgCourseLength: 7.0 },
    { source: "Word of Mouth", type: "word_of_mouth", patientsReferred: 6, convertedToBooking: 5, totalRevenuePence: 2100000, avgCourseLength: 4.8 },
    { source: "Bupa Direct", type: "insurance", patientsReferred: 5, convertedToBooking: 5, totalRevenuePence: 3500000, avgCourseLength: 6.0 },
    { source: "AXA Health", type: "insurance", patientsReferred: 3, convertedToBooking: 3, totalRevenuePence: 2100000, avgCourseLength: 5.5 },
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

export function getDemoBenchmarks(): BenchmarkComparison[] {
  return [
    { metric: "Rebook Rate", yourValue: 2.9, peerMedian: 2.2, peerTop25: 3.5, unit: "ratio", higherIsBetter: true },
    { metric: "DNA Rate", yourValue: 0.05, peerMedian: 0.08, peerTop25: 0.04, unit: "percent", higherIsBetter: false },
    { metric: "Utilisation", yourValue: 0.83, peerMedian: 0.74, peerTop25: 0.90, unit: "percent", higherIsBetter: true },
    { metric: "NPS Score", yourValue: 72, peerMedian: 58, peerTop25: 78, unit: "number", higherIsBetter: true },
    { metric: "Rev / Session", yourValue: 8340, peerMedian: 7500, peerTop25: 9000, unit: "pence", higherIsBetter: true },
  ];
}
