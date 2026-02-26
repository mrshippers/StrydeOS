import type { WeeklyStats, Clinician, Patient } from "@/types";

function ws(
  id: string,
  weekStart: string,
  clinicianId: string,
  clinicianName: string,
  followUpRate: number,
  physitrackRate: number,
  appointmentsTotal: number,
  utilisationRate: number,
  dnaRate: number,
  courseCompletionRate: number,
  revenuePerSessionPence: number
): WeeklyStats {
  return {
    id,
    weekStart,
    clinicianId,
    clinicianName,
    followUpRate,
    followUpTarget: 2.9,
    hepComplianceRate: physitrackRate,
    physitrackRate,
    physitrackTarget: 0.95,
    appointmentsTotal,
    utilisationRate,
    dnaRate,
    courseCompletionRate,
    revenuePerSessionPence,
    initialAssessments: Math.round(appointmentsTotal * 0.15),
    followUps: Math.round(appointmentsTotal * 0.85),
  };
}

const DEMO_WEEKLY_STATS_ALL: WeeklyStats[] = [
  ws("d1", "2026-01-12", "all", "All Clinicians", 2.68, 0.88, 61, 0.83, 0.09, 0.72, 7800),
  ws("d2", "2026-01-19", "all", "All Clinicians", 2.73, 0.89, 64, 0.85, 0.08, 0.74, 7850),
  ws("d3", "2026-01-26", "all", "All Clinicians", 2.81, 0.90, 66, 0.87, 0.07, 0.76, 7900),
  ws("d4", "2026-02-02", "all", "All Clinicians", 2.90, 0.91, 65, 0.88, 0.06, 0.77, 7950),
  ws("d5", "2026-02-09", "all", "All Clinicians", 2.98, 0.92, 67, 0.89, 0.06, 0.78, 8000),
  ws("d6", "2026-02-17", "all", "All Clinicians", 3.08, 0.93, 68, 0.91, 0.05, 0.79, 8050),
];

// Spires real trajectories (in-house manoeuvres + clinical excellence, no vanity marketing):
// Andrew: 1.9 → 2.5 (target 2.9). Max: 2.9 → 3.4 (~£10K/yr revenue impact). Jamal: 3.2 → 3.4.
const DEMO_CLINICIAN_STATS: Record<string, WeeklyStats[]> = {
  "c-andrew": [
    ws("ca1", "2026-01-12", "c-andrew", "Andrew", 1.90, 0.82, 22, 0.80, 0.12, 0.68, 8200),
    ws("ca2", "2026-01-19", "c-andrew", "Andrew", 1.98, 0.84, 23, 0.82, 0.11, 0.70, 8200),
    ws("ca3", "2026-01-26", "c-andrew", "Andrew", 2.10, 0.85, 23, 0.84, 0.10, 0.72, 8300),
    ws("ca4", "2026-02-02", "c-andrew", "Andrew", 2.22, 0.87, 22, 0.85, 0.09, 0.73, 8400),
    ws("ca5", "2026-02-09", "c-andrew", "Andrew", 2.35, 0.89, 23, 0.86, 0.08, 0.74, 8400),
    ws("ca6", "2026-02-17", "c-andrew", "Andrew", 2.50, 0.91, 24, 0.88, 0.07, 0.76, 8500),
  ],
  "c-max": [
    ws("cm1", "2026-01-12", "c-max", "Max", 2.90, 0.92, 20, 0.85, 0.07, 0.78, 7500),
    ws("cm2", "2026-01-19", "c-max", "Max", 2.98, 0.93, 21, 0.87, 0.06, 0.79, 7550),
    ws("cm3", "2026-01-26", "c-max", "Max", 3.08, 0.93, 22, 0.89, 0.06, 0.80, 7600),
    ws("cm4", "2026-02-02", "c-max", "Max", 3.18, 0.94, 22, 0.90, 0.05, 0.81, 7650),
    ws("cm5", "2026-02-09", "c-max", "Max", 3.28, 0.95, 22, 0.91, 0.05, 0.82, 7700),
    ws("cm6", "2026-02-17", "c-max", "Max", 3.40, 0.95, 23, 0.92, 0.04, 0.83, 7800),
  ],
  "c-jamal": [
    ws("cj1", "2026-01-12", "c-jamal", "Jamal", 3.20, 0.94, 19, 0.84, 0.06, 0.80, 7600),
    ws("cj2", "2026-01-19", "c-jamal", "Jamal", 3.22, 0.94, 20, 0.86, 0.05, 0.81, 7620),
    ws("cj3", "2026-01-26", "c-jamal", "Jamal", 3.26, 0.95, 21, 0.88, 0.05, 0.82, 7650),
    ws("cj4", "2026-02-02", "c-jamal", "Jamal", 3.30, 0.95, 21, 0.89, 0.04, 0.83, 7680),
    ws("cj5", "2026-02-09", "c-jamal", "Jamal", 3.35, 0.96, 22, 0.90, 0.04, 0.84, 7700),
    ws("cj6", "2026-02-17", "c-jamal", "Jamal", 3.40, 0.96, 21, 0.92, 0.03, 0.85, 7720),
  ],
};

const DEMO_CLINICIANS: Clinician[] = [
  { id: "c-jamal", name: "Jamal", role: "Owner / Lead Physio", active: true },
  { id: "c-andrew", name: "Andrew", role: "Physiotherapist", active: true },
  { id: "c-max", name: "Max", role: "Physiotherapist", active: true },
];

const now = new Date().toISOString();

const DEMO_PATIENTS: Patient[] = [
  { id: "p1", name: "James Whitfield", clinicianId: "c-andrew", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-18", nextSessionDate: "2026-02-25", sessionCount: 3, courseLength: 6, discharged: false, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p2", name: "Catherine Bose", clinicianId: "c-andrew", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-14", nextSessionDate: "2026-02-21", sessionCount: 4, courseLength: 6, discharged: false, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p3", name: "Daniel Marr", clinicianId: "c-max", contact: {}, insuranceFlag: true, insurerName: "Bupa", preAuthStatus: "confirmed", lastSessionDate: "2026-02-01", sessionCount: 2, courseLength: 6, discharged: false, churnRisk: true, createdAt: now, updatedAt: now },
  { id: "p4", name: "Emma Richardson", clinicianId: "c-max", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-17", nextSessionDate: "2026-02-24", sessionCount: 5, courseLength: 6, discharged: false, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p5", name: "Oliver Shaw", clinicianId: "c-andrew", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-28", sessionCount: 3, courseLength: 6, discharged: false, churnRisk: true, createdAt: now, updatedAt: now },
  { id: "p6", name: "Sophie Turner", clinicianId: "c-jamal", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-19", nextSessionDate: "2026-02-26", sessionCount: 2, courseLength: 4, discharged: false, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p7", name: "Liam Bradshaw", clinicianId: "c-andrew", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-10", sessionCount: 6, courseLength: 6, discharged: true, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p8", name: "Rachel Obi", clinicianId: "c-max", contact: {}, insuranceFlag: true, insurerName: "AXA Health", preAuthStatus: "confirmed", lastSessionDate: "2026-02-12", sessionCount: 4, courseLength: 4, discharged: true, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p9", name: "Marcus Thorne", clinicianId: "c-andrew", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-30", sessionCount: 2, courseLength: 8, discharged: false, churnRisk: true, createdAt: now, updatedAt: now },
  { id: "p10", name: "Nina Aslam", clinicianId: "c-jamal", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-15", nextSessionDate: "2026-02-22", sessionCount: 1, courseLength: 6, discharged: false, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p11", name: "George Kemp", clinicianId: "c-max", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-25", sessionCount: 3, courseLength: 6, discharged: false, churnRisk: true, createdAt: now, updatedAt: now },
  { id: "p12", name: "Helen Corr", clinicianId: "c-jamal", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-05", sessionCount: 6, courseLength: 6, discharged: true, churnRisk: false, createdAt: now, updatedAt: now },
];

export function useDemoWeeklyStats(clinicianId: string): WeeklyStats[] {
  if (clinicianId === "all") return DEMO_WEEKLY_STATS_ALL;
  return DEMO_CLINICIAN_STATS[clinicianId] ?? [];
}

export function useDemoClinicians(): Clinician[] {
  return DEMO_CLINICIANS;
}

export function useDemoPatients(clinicianId?: string): Patient[] {
  if (!clinicianId || clinicianId === "all") return DEMO_PATIENTS;
  return DEMO_PATIENTS.filter((p) => p.clinicianId === clinicianId);
}

export function getDemoLatestWeekStats(): {
  clinicianId: string;
  clinicianName: string;
  stats: WeeklyStats;
}[] {
  return Object.entries(DEMO_CLINICIAN_STATS).map(([cid, weeks]) => ({
    clinicianId: cid,
    clinicianName: weeks[weeks.length - 1].clinicianName,
    stats: weeks[weeks.length - 1],
  }));
}
