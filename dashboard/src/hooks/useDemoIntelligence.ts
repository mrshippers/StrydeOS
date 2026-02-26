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
    { clinicianId: "c-jamal", clinicianName: "Jamal", totalRevenuePence: 1620000, sessionsDelivered: 21, revenuePerSessionPence: 7720, insurancePct: 0.14 },
    { clinicianId: "c-andrew", clinicianName: "Andrew", totalRevenuePence: 2040000, sessionsDelivered: 24, revenuePerSessionPence: 8500, insurancePct: 0.25 },
    { clinicianId: "c-max", clinicianName: "Max", totalRevenuePence: 1794000, sessionsDelivered: 23, revenuePerSessionPence: 7800, insurancePct: 0.30 },
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
