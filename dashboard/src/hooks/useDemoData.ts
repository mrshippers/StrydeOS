import type { WeeklyStats, Clinician, Patient } from "@/types";

// ─── Scenario rotation ──────────────────────────────────────────────────────

const DEMO_SCENARIO_KEY = "strydeos_demo_scenario";

function getDemoScenarioIndex(): number {
  try {
    const stored = sessionStorage.getItem(DEMO_SCENARIO_KEY);
    if (stored !== null) {
      const idx = parseInt(stored, 10);
      if (idx >= 0 && idx < SCENARIOS.length) return idx;
    }
  } catch { /* sessionStorage unavailable */ }
  return 0;
}

// ─── Scenario definitions ────────────────────────────────────────────────────
// Each scenario represents a realistic UK private physio practice snapshot.
// Revenue per session in pence, rates as decimals.

interface Scenario {
  revPerSession: number;   // pence (£65 = 6500)
  baseAppts: number;       // weekly total for "all"
  fu: [number, number];    // follow-up rate [start, end] over 6 weeks
  hep: [number, number];   // HEP rate
  util: [number, number];  // utilisation rate
  dna: [number, number];   // DNA rate (goes DOWN)
  comp: [number, number];  // course completion rate
}

const SCENARIOS: Scenario[] = [
  // 0: Steady mid-size practice
  { revPerSession: 6500, baseAppts: 62, fu: [3.2, 4.0], hep: [0.88, 0.93], util: [0.70, 0.76], dna: [0.09, 0.05], comp: [0.72, 0.79] },
  // 1: Newer practice, lower volume, higher rates
  { revPerSession: 7500, baseAppts: 45, fu: [2.6, 3.4], hep: [0.78, 0.86], util: [0.60, 0.68], dna: [0.12, 0.08], comp: [0.64, 0.72] },
  // 2: Established high-volume practice
  { revPerSession: 5800, baseAppts: 78, fu: [3.6, 4.3], hep: [0.91, 0.96], util: [0.82, 0.89], dna: [0.06, 0.03], comp: [0.78, 0.84] },
  // 3: Premium boutique, low volume
  { revPerSession: 8500, baseAppts: 38, fu: [2.9, 3.6], hep: [0.82, 0.88], util: [0.65, 0.72], dna: [0.08, 0.05], comp: [0.70, 0.76] },
  // 4: Growing practice, good momentum
  { revPerSession: 6800, baseAppts: 58, fu: [3.4, 4.1], hep: [0.86, 0.93], util: [0.74, 0.82], dna: [0.07, 0.04], comp: [0.76, 0.82] },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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
    followUpRate: round2(followUpRate),
    followUpTarget: 4.0,
    hepComplianceRate: round2(hepRate),
    hepRate: round2(hepRate),
    hepTarget: 0.95,
    appointmentsTotal: Math.round(appointmentsTotal),
    utilisationRate: round2(utilisationRate),
    dnaRate: round2(dnaRate),
    courseCompletionRate: round2(courseCompletionRate),
    revenuePerSessionPence,
    initialAssessments: Math.round(appointmentsTotal * 0.15),
    followUps: Math.round(appointmentsTotal * 0.85),
  };
}

const WEEK_STARTS = [
  "2026-01-12",
  "2026-01-19",
  "2026-01-26",
  "2026-02-02",
  "2026-02-09",
  "2026-02-17",
];

// Clinician performance multipliers relative to "all" aggregate
// [followUp, hep, appts fraction, util, dna, completion]
const CLINICIAN_PROFILES: {
  id: string;
  name: string;
  role: string;
  fuMul: number;
  hepMul: number;
  apptsFrac: number;
  utilMul: number;
  dnaMul: number;
  compMul: number;
  isPartTime?: boolean;
}[] = [
  { id: "c-james", name: "James Chen", role: "Owner / Lead Physio", fuMul: 1.12, hepMul: 1.03, apptsFrac: 0.30, utilMul: 1.02, dnaMul: 0.70, compMul: 1.06 },
  { id: "c-alex", name: "Alex Pemberton", role: "Physiotherapist", fuMul: 0.78, hepMul: 0.94, apptsFrac: 0.38, utilMul: 0.96, dnaMul: 1.40, compMul: 0.92 },
  { id: "c-sam", name: "Sam Okoro", role: "Physiotherapist", fuMul: 1.02, hepMul: 1.01, apptsFrac: 0.32, utilMul: 0.98, dnaMul: 1.10, compMul: 1.00 },
];

function generateWeeklyStats(scenario: Scenario): {
  all: WeeklyStats[];
  byClinician: Record<string, WeeklyStats[]>;
} {
  const all: WeeklyStats[] = [];
  const byClinician: Record<string, WeeklyStats[]> = {};

  for (const cp of CLINICIAN_PROFILES) {
    byClinician[cp.id] = [];
  }

  for (let w = 0; w < 6; w++) {
    const t = w / 5; // 0..1 over 6 weeks
    const jitter = 1 + (w % 2 === 0 ? 0.01 : -0.01); // tiny week-to-week variance

    const fu = lerp(scenario.fu[0], scenario.fu[1], t);
    const hep = lerp(scenario.hep[0], scenario.hep[1], t);
    const appts = lerp(scenario.baseAppts - 3, scenario.baseAppts + 3, t) * jitter;
    const util = lerp(scenario.util[0], scenario.util[1], t);
    const dna = lerp(scenario.dna[0], scenario.dna[1], t);
    const comp = lerp(scenario.comp[0], scenario.comp[1], t);

    all.push(
      ws(`d${w + 1}`, WEEK_STARTS[w], "all", "All Clinicians", fu, hep, appts, util, dna, comp, scenario.revPerSession)
    );

    for (const cp of CLINICIAN_PROFILES) {
      const cAppts = appts * cp.apptsFrac;
      byClinician[cp.id].push(
        ws(
          `d${cp.id}-${w + 1}`,
          WEEK_STARTS[w],
          cp.id,
          cp.name,
          fu * cp.fuMul,
          Math.min(1, hep * cp.hepMul),
          cAppts,
          Math.min(1, util * cp.utilMul),
          Math.max(0, dna * cp.dnaMul),
          Math.min(1, comp * cp.compMul),
          scenario.revPerSession
        )
      );
    }
  }

  // Kate: part-time, very small sample
  byClinician["c-kate"] = WEEK_STARTS.map((ws_date, w) => ({
    ...ws(`dc-kate-${w + 1}`, ws_date, "c-kate", "Kate Martin", 4.50, 1.0, 2, 0.20, 0.0, 1.0, scenario.revPerSession),
    statisticallyRepresentative: false,
    caveatNote: "Sample size < 10 patients; metrics are directionally indicative only",
  }));

  return { all, byClinician };
}

// ─── Memoised per-session cache ──────────────────────────────────────────────

let cachedScenario = -1;
let cachedAll: WeeklyStats[] = [];
let cachedByClinician: Record<string, WeeklyStats[]> = {};

function ensureGenerated(): void {
  const idx = getDemoScenarioIndex();
  if (idx === cachedScenario) return;
  cachedScenario = idx;
  const result = generateWeeklyStats(SCENARIOS[idx]);
  cachedAll = result.all;
  cachedByClinician = result.byClinician;
}

// ─── Clinicians ──────────────────────────────────────────────────────────────

const DEMO_CLINICIANS: Clinician[] = [
  { id: "c-james", name: "James Chen", role: "Owner / Lead Physio", active: true },
  { id: "c-alex", name: "Alex Pemberton", role: "Physiotherapist", active: true },
  { id: "c-sam", name: "Sam Okoro", role: "Physiotherapist", active: true },
  { id: "c-kate", name: "Kate Martin", role: "Owner / Admin", active: true },
];

// ─── Patients ────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

const DEMO_PATIENTS: Patient[] = [
  // NEW — just referred, initial assessment booked
  { id: "p1", name: "James Whitfield", clinicianId: "c-alex", contact: { phone: "+447700900001" }, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-18", nextSessionDate: "2026-02-25", sessionCount: 0, courseLength: 6, discharged: false, churnRisk: false, lifecycleState: "NEW", riskScore: 15, riskFactors: { attendance: 1, treatmentProgress: 0.5, hepEngagement: 0.5, sentiment: 0.8, staticRisk: 0.2 }, createdAt: now, updatedAt: now },
  // ONBOARDING — sessions 1-3, highest dropout risk
  { id: "p2", name: "Catherine Bose", clinicianId: "c-alex", contact: { phone: "+447700900002" }, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-14", nextSessionDate: "2026-02-21", sessionCount: 2, courseLength: 6, discharged: false, churnRisk: false, lifecycleState: "ONBOARDING", riskScore: 35, sessionThresholdAlert: true, riskFactors: { attendance: 0.7, treatmentProgress: 0.4, hepEngagement: 0.6, sentiment: 0.7, staticRisk: 0.3 }, createdAt: now, updatedAt: now },
  // ONBOARDING — session 1, insured patient
  { id: "p6", name: "Sophie Turner", clinicianId: "c-james", contact: { phone: "+447700900006" }, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-19", nextSessionDate: "2026-02-26", sessionCount: 1, courseLength: 4, discharged: false, churnRisk: false, lifecycleState: "ONBOARDING", riskScore: 28, sessionThresholdAlert: true, riskFactors: { attendance: 0.8, treatmentProgress: 0.3, hepEngagement: 0.5, sentiment: 0.8, staticRisk: 0.2 }, createdAt: now, updatedAt: now },
  // ACTIVE — progressing well
  { id: "p4", name: "Emma Richardson", clinicianId: "c-sam", contact: { phone: "+447700900004" }, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-17", nextSessionDate: "2026-02-24", sessionCount: 5, courseLength: 6, discharged: false, churnRisk: false, lifecycleState: "ACTIVE", riskScore: 12, riskFactors: { attendance: 0.9, treatmentProgress: 0.8, hepEngagement: 0.9, sentiment: 0.9, staticRisk: 0.1 }, createdAt: now, updatedAt: now },
  // ACTIVE — insured, mid-course
  { id: "p10", name: "Nina Aslam", clinicianId: "c-james", contact: { phone: "+447700900010" }, insuranceFlag: true, insurerName: "Vitality", preAuthStatus: "confirmed", lastSessionDate: "2026-02-15", nextSessionDate: "2026-02-22", sessionCount: 4, courseLength: 6, discharged: false, churnRisk: false, lifecycleState: "ACTIVE", riskScore: 18, riskFactors: { attendance: 0.85, treatmentProgress: 0.7, hepEngagement: 0.8, sentiment: 0.85, staticRisk: 0.15 }, createdAt: now, updatedAt: now },
  // AT_RISK — missed last appointment, gap widening
  { id: "p3", name: "Daniel Marr", clinicianId: "c-sam", contact: { phone: "+447700900003" }, insuranceFlag: true, insurerName: "Bupa", preAuthStatus: "confirmed", lastSessionDate: "2026-02-01", sessionCount: 2, courseLength: 6, discharged: false, churnRisk: true, lifecycleState: "AT_RISK", riskScore: 72, riskFactors: { attendance: 0.3, treatmentProgress: 0.3, hepEngagement: 0.2, sentiment: 0.4, staticRisk: 0.6 }, complexitySignals: { painScore: 7, psychosocialFlags: true, treatmentComplexity: "moderate", dischargeLikelihood: "low", multipleRegions: false, chronicIndicators: false }, createdAt: now, updatedAt: now },
  // AT_RISK — poor HEP compliance, slipping
  { id: "p5", name: "Oliver Shaw", clinicianId: "c-alex", contact: { phone: "+447700900005" }, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-28", sessionCount: 3, courseLength: 6, discharged: false, churnRisk: true, lifecycleState: "AT_RISK", riskScore: 65, riskFactors: { attendance: 0.4, treatmentProgress: 0.4, hepEngagement: 0.15, sentiment: 0.5, staticRisk: 0.4 }, createdAt: now, updatedAt: now },
  // LAPSED — no session in 3+ weeks, no future booking
  { id: "p9", name: "Marcus Thorne", clinicianId: "c-alex", contact: { phone: "+447700900009" }, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-30", sessionCount: 2, courseLength: 8, discharged: false, churnRisk: true, lifecycleState: "LAPSED", riskScore: 82, riskFactors: { attendance: 0.15, treatmentProgress: 0.2, hepEngagement: 0.1, sentiment: 0.3, staticRisk: 0.7 }, createdAt: now, updatedAt: now },
  // LAPSED — insured, gap widening, no response to comms
  { id: "p11", name: "George Kemp", clinicianId: "c-sam", contact: { phone: "+447700900011" }, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-25", sessionCount: 3, courseLength: 6, discharged: false, churnRisk: true, lifecycleState: "LAPSED", riskScore: 78, riskFactors: { attendance: 0.2, treatmentProgress: 0.25, hepEngagement: 0.2, sentiment: 0.35, staticRisk: 0.65 }, createdAt: now, updatedAt: now },
  // DISCHARGED — completed course successfully
  { id: "p7", name: "Liam Bradshaw", clinicianId: "c-alex", contact: { phone: "+447700900007" }, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-10", sessionCount: 6, courseLength: 6, discharged: true, churnRisk: false, lifecycleState: "DISCHARGED", riskScore: 5, riskFactors: { attendance: 0.95, treatmentProgress: 0.9, hepEngagement: 0.85, sentiment: 0.95, staticRisk: 0.05 }, createdAt: now, updatedAt: now },
  // DISCHARGED — insurance course completed
  { id: "p8", name: "Rachel Obi", clinicianId: "c-sam", contact: { phone: "+447700900008" }, insuranceFlag: true, insurerName: "AXA Health", preAuthStatus: "confirmed", lastSessionDate: "2026-02-12", sessionCount: 4, courseLength: 4, discharged: true, churnRisk: false, lifecycleState: "DISCHARGED", riskScore: 8, riskFactors: { attendance: 0.9, treatmentProgress: 0.85, hepEngagement: 0.8, sentiment: 0.9, staticRisk: 0.1 }, createdAt: now, updatedAt: now },
  // CHURNED — discharged long ago, never rebooked
  { id: "p12", name: "Helen Corr", clinicianId: "c-james", contact: { phone: "+447700900012" }, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-05", sessionCount: 6, courseLength: 6, discharged: true, churnRisk: false, lifecycleState: "CHURNED", riskScore: 3, riskFactors: { attendance: 0.85, treatmentProgress: 0.8, hepEngagement: 0.7, sentiment: 0.6, staticRisk: 0.1 }, createdAt: now, updatedAt: now },
];

// ─── Public API ──────────────────────────────────────────────────────────────

export function useDemoWeeklyStats(clinicianId: string): WeeklyStats[] {
  ensureGenerated();
  if (clinicianId === "all") return cachedAll;
  return cachedByClinician[clinicianId] ?? [];
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
  ensureGenerated();
  return Object.entries(cachedByClinician)
    .filter(([id]) => id !== "c-kate")
    .map(([cid, weeks]) => ({
      clinicianId: cid,
      clinicianName: weeks[weeks.length - 1].clinicianName,
      stats: weeks[weeks.length - 1],
    }));
}

/** Expose the current scenario's rev/session pence for intelligence data alignment */
export function getDemoRevPerSession(): number {
  return SCENARIOS[getDemoScenarioIndex()].revPerSession;
}

/** Expose the current scenario's latest-week total appointments */
export function getDemoLatestAppts(): number {
  ensureGenerated();
  const latest = cachedAll[cachedAll.length - 1];
  return latest?.appointmentsTotal ?? 62;
}
