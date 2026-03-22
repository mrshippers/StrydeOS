import type { WeeklyStats, Clinician, Patient } from "@/types";

function ws(
  id: string,
  weekStart: string,
  clinicianId: string,
  clinicianName: string,
  followUpRate: number,
  hepRate: number,
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
    followUpTarget: 4.0,
    hepComplianceRate: hepRate,
    hepRate,
    hepTarget: 0.95,
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
  ws("d1", "2026-01-12", "all", "All Clinicians", 3.20, 0.88, 61, 0.70, 0.09, 0.72, 6500),
  ws("d2", "2026-01-19", "all", "All Clinicians", 3.30, 0.89, 64, 0.71, 0.08, 0.74, 6500),
  ws("d3", "2026-01-26", "all", "All Clinicians", 3.45, 0.90, 66, 0.72, 0.07, 0.76, 6500),
  ws("d4", "2026-02-02", "all", "All Clinicians", 3.60, 0.91, 65, 0.73, 0.06, 0.77, 6500),
  ws("d5", "2026-02-09", "all", "All Clinicians", 3.78, 0.92, 67, 0.74, 0.06, 0.78, 6500),
  ws("d6", "2026-02-17", "all", "All Clinicians", 3.95, 0.93, 68, 0.76, 0.05, 0.79, 6500),
];

const DEMO_CLINICIAN_STATS: Record<string, WeeklyStats[]> = {
  "c-alex": [
    ws("ca1", "2026-01-12", "c-alex", "Alex Pemberton", 2.20, 0.82, 22, 0.68, 0.12, 0.68, 6500),
    ws("ca2", "2026-01-19", "c-alex", "Alex Pemberton", 2.35, 0.84, 23, 0.69, 0.11, 0.70, 6500),
    ws("ca3", "2026-01-26", "c-alex", "Alex Pemberton", 2.50, 0.85, 23, 0.70, 0.10, 0.72, 6500),
    ws("ca4", "2026-02-02", "c-alex", "Alex Pemberton", 2.65, 0.87, 22, 0.71, 0.09, 0.73, 6500),
    ws("ca5", "2026-02-09", "c-alex", "Alex Pemberton", 2.80, 0.89, 23, 0.72, 0.08, 0.74, 6500),
    ws("ca6", "2026-02-17", "c-alex", "Alex Pemberton", 2.95, 0.91, 24, 0.73, 0.07, 0.76, 6500),
  ],
  "c-sam": [
    ws("cm1", "2026-01-12", "c-sam", "Sam Okoro", 3.50, 0.92, 20, 0.72, 0.07, 0.78, 6500),
    ws("cm2", "2026-01-19", "c-sam", "Sam Okoro", 3.60, 0.93, 21, 0.73, 0.06, 0.79, 6500),
    ws("cm3", "2026-01-26", "c-sam", "Sam Okoro", 3.72, 0.93, 22, 0.74, 0.06, 0.80, 6500),
    ws("cm4", "2026-02-02", "c-sam", "Sam Okoro", 3.85, 0.94, 22, 0.75, 0.05, 0.81, 6500),
    ws("cm5", "2026-02-09", "c-sam", "Sam Okoro", 3.95, 0.95, 22, 0.76, 0.05, 0.82, 6500),
    ws("cm6", "2026-02-17", "c-sam", "Sam Okoro", 4.10, 0.95, 23, 0.77, 0.04, 0.83, 6500),
  ],
  "c-james": [
    ws("cj1", "2026-01-12", "c-james", "James Chen", 4.00, 0.94, 19, 0.73, 0.06, 0.80, 6500),
    ws("cj2", "2026-01-19", "c-james", "James Chen", 4.05, 0.94, 20, 0.74, 0.05, 0.81, 6500),
    ws("cj3", "2026-01-26", "c-james", "James Chen", 4.10, 0.95, 21, 0.75, 0.05, 0.82, 6500),
    ws("cj4", "2026-02-02", "c-james", "James Chen", 4.15, 0.95, 21, 0.76, 0.04, 0.83, 6500),
    ws("cj5", "2026-02-09", "c-james", "James Chen", 4.22, 0.96, 22, 0.77, 0.04, 0.84, 6500),
    ws("cj6", "2026-02-17", "c-james", "James Chen", 4.30, 0.96, 21, 0.78, 0.03, 0.85, 6500),
  ],
  "c-kate": [
    { ...ws("ck1", "2026-01-12", "c-kate", "Kate Martin", 4.50, 1.00, 2, 0.20, 0.00, 1.00, 6500), statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { ...ws("ck2", "2026-01-19", "c-kate", "Kate Martin", 4.50, 1.00, 2, 0.20, 0.00, 1.00, 6500), statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { ...ws("ck3", "2026-01-26", "c-kate", "Kate Martin", 4.50, 1.00, 2, 0.20, 0.00, 1.00, 6500), statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { ...ws("ck4", "2026-02-02", "c-kate", "Kate Martin", 4.50, 1.00, 2, 0.20, 0.00, 1.00, 6500), statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { ...ws("ck5", "2026-02-09", "c-kate", "Kate Martin", 4.50, 1.00, 2, 0.20, 0.00, 1.00, 6500), statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { ...ws("ck6", "2026-02-17", "c-kate", "Kate Martin", 4.50, 1.00, 2, 0.20, 0.00, 1.00, 6500), statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
  ],
};

const DEMO_CLINICIANS: Clinician[] = [
  { id: "c-james", name: "James Chen", role: "Owner / Lead Physio", active: true },
  { id: "c-alex", name: "Alex Pemberton", role: "Physiotherapist", active: true },
  { id: "c-sam", name: "Sam Okoro", role: "Physiotherapist", active: true },
  { id: "c-kate", name: "Kate Martin", role: "Owner / Admin", active: true },
];

const now = new Date().toISOString();

const DEMO_PATIENTS: Patient[] = [
  { id: "p1", name: "James Whitfield", clinicianId: "c-alex", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-18", nextSessionDate: "2026-02-25", sessionCount: 3, courseLength: 6, discharged: false, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p2", name: "Catherine Bose", clinicianId: "c-alex", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-14", nextSessionDate: "2026-02-21", sessionCount: 4, courseLength: 6, discharged: false, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p3", name: "Daniel Marr", clinicianId: "c-sam", contact: {}, insuranceFlag: true, insurerName: "Bupa", preAuthStatus: "confirmed", lastSessionDate: "2026-02-01", sessionCount: 2, courseLength: 6, discharged: false, churnRisk: true, createdAt: now, updatedAt: now },
  { id: "p4", name: "Emma Richardson", clinicianId: "c-sam", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-17", nextSessionDate: "2026-02-24", sessionCount: 5, courseLength: 6, discharged: false, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p5", name: "Oliver Shaw", clinicianId: "c-alex", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-28", sessionCount: 3, courseLength: 6, discharged: false, churnRisk: true, createdAt: now, updatedAt: now },
  { id: "p6", name: "Sophie Turner", clinicianId: "c-james", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-19", nextSessionDate: "2026-02-26", sessionCount: 2, courseLength: 4, discharged: false, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p7", name: "Liam Bradshaw", clinicianId: "c-alex", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-10", sessionCount: 6, courseLength: 6, discharged: true, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p8", name: "Rachel Obi", clinicianId: "c-sam", contact: {}, insuranceFlag: true, insurerName: "AXA Health", preAuthStatus: "confirmed", lastSessionDate: "2026-02-12", sessionCount: 4, courseLength: 4, discharged: true, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p9", name: "Marcus Thorne", clinicianId: "c-alex", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-30", sessionCount: 2, courseLength: 8, discharged: false, churnRisk: true, createdAt: now, updatedAt: now },
  { id: "p10", name: "Nina Aslam", clinicianId: "c-james", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-15", nextSessionDate: "2026-02-22", sessionCount: 1, courseLength: 6, discharged: false, churnRisk: false, createdAt: now, updatedAt: now },
  { id: "p11", name: "George Kemp", clinicianId: "c-sam", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-25", sessionCount: 3, courseLength: 6, discharged: false, churnRisk: true, createdAt: now, updatedAt: now },
  { id: "p12", name: "Helen Corr", clinicianId: "c-james", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-05", sessionCount: 6, courseLength: 6, discharged: true, churnRisk: false, createdAt: now, updatedAt: now },
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
