/**
 * Production seed script for Spires Physiotherapy London.
 *
 * Reads real WriteUpp CSV exports from scripts/data/ and seeds:
 *   - 4 Firebase Auth users (Jamal, Andrew, Max, Joe)
 *   - Clinician records
 *   - ~130 real patients derived from appointment history
 *   - ~285 real appointments from WriteUpp activity export
 *   - metrics_weekly computed from actual appointment data (11 weeks)
 *
 * Idempotent — safe to re-run. Resets all accounts for first-login flow.
 *
 * Usage (from dashboard/):
 *   npm run seed:production
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { parse } from "csv-parse/sync";

const CLINIC_ID = "clinic-spires";
const CLINIC_NAME = "Spires Physiotherapy London";

// ─── Clinician mapping ───────────────────────────────────────────────────────

const CLINICIAN_MAP: Record<string, string> = {
  "Max Hubbard": "c-max",
  "Andrew Henry": "c-andrew",
  "Jamal Ofori-Adu": "c-jamal",
  "Joe Korge": "c-joe",
};

const CLINICIAN_NAME_BY_ID: Record<string, string> = {
  "c-max": "Max Hubbard",
  "c-andrew": "Andrew Henry",
  "c-jamal": "Jamal Ofori-Adu",
  "c-joe": "Joe Korge",
};

// ─── User definitions ────────────────────────────────────────────────────────

interface UserSeed {
  email: string;
  firstName: string;
  lastName: string;
  role: "owner" | "admin" | "clinician";
  clinicianId: string;
  password?: string;
}

function getDefaultPassword(): string {
  const p = process.env.SEED_DEFAULT_PASSWORD;
  if (!p || p.trim() === "") {
    throw new Error("SEED_DEFAULT_PASSWORD must be set in .env.local (or environment) before running the seed script. Do not commit passwords.");
  }
  return p;
}

const USERS: UserSeed[] = [
  { email: "jamal@spiresphysiotherapy.com", firstName: "Jamal", lastName: "Ofori-Adu", role: "owner", clinicianId: "c-jamal" },
  { email: "andrew@spiresphysiotherapy.com", firstName: "Andrew", lastName: "Henry", role: "clinician", clinicianId: "c-andrew" },
  { email: "max@spiresphysiotherapy.com", firstName: "Max", lastName: "Hubbard", role: "clinician", clinicianId: "c-max" },
  { email: "joe@spiresphysiotherapy.com", firstName: "Joe", lastName: "Korge", role: "owner", clinicianId: "c-joe" },
];

const CLINICIANS = [
  { id: "c-jamal", name: "Jamal Ofori-Adu", role: "Owner / Lead Physio", pmsExternalId: "jamal-1" },
  { id: "c-andrew", name: "Andrew Henry", role: "Physiotherapist", pmsExternalId: "andrew-1" },
  { id: "c-max", name: "Max Hubbard", role: "Physiotherapist", pmsExternalId: "max-1" },
  { id: "c-joe", name: "Joe Korge", role: "Owner / MD", pmsExternalId: "joe-1" },
];

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

interface CsvRow {
  WUID: string;
  "Patient Name": string;
  "Appointment Type": string;
  "Start Time": string;
  "Duration (min.)": string;
  Date: string;
  Status: string;
  With: string;
  Cost: string;
  "Create Date": string;
  Description: string;
}

function loadActivityCsv(): CsvRow[] {
  const csvPath = path.join(__dirname, "data", "activity-by-date.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as CsvRow[];
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function parseDDMMYYYY(dateStr: string): Date {
  const [dd, mm, yyyy] = dateStr.split("/").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function getWeekStart(dateStr: string): string {
  return toISODate(getMonday(parseDDMMYYYY(dateStr)));
}

// ─── Appointment type mapping ────────────────────────────────────────────────

interface TypeMapping {
  appointmentType: "initial_assessment" | "follow_up";
  isInitialAssessment: boolean;
  insuranceFlag: boolean;
  insurerName?: string;
}

const INSURER_PREFIXES: Record<string, string> = {
  "AXA": "AXA Health",
  "Bupa": "Bupa",
  "Aviva": "Aviva",
  "WPA": "WPA",
  "Vitality": "Vitality",
  "Allianz": "Allianz",
  "Cigna": "Cigna",
};

function mapAppointmentType(rawType: string): TypeMapping {
  const lower = rawType.toLowerCase();
  const isInitial = lower.includes("initial");
  const isFollowUp = lower.includes("follow") || (!isInitial && lower.includes("appointment"));

  let insuranceFlag = false;
  let insurerName: string | undefined;

  for (const [prefix, name] of Object.entries(INSURER_PREFIXES)) {
    if (rawType.startsWith(prefix) || rawType.includes(prefix)) {
      insuranceFlag = true;
      insurerName = name;
      break;
    }
  }

  return {
    appointmentType: isInitial ? "initial_assessment" : "follow_up",
    isInitialAssessment: isInitial,
    insuranceFlag,
    insurerName,
  };
}

// ─── Transform CSV rows to appointment docs ─────────────────────────────────

interface AppointmentDoc {
  id: string;
  patientId: string;
  patientName: string;
  clinicianId: string;
  dateTime: string;
  endTime: string;
  status: "completed" | "dna" | "cancelled" | "scheduled";
  appointmentType: "initial_assessment" | "follow_up";
  isInitialAssessment: boolean;
  hepAssigned: boolean;
  conditionTag: string;
  revenueAmountPence: number;
  followUpBooked: boolean;
  source: "pms_sync";
  pmsExternalId: string;
  insuranceFlag: boolean;
  insurerName?: string;
  rawDate: string;
  weekStart: string;
  createdAt: string;
  updatedAt: string;
}

function transformAppointments(rows: CsvRow[]): AppointmentDoc[] {
  const appointments: AppointmentDoc[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const clinicianId = CLINICIAN_MAP[row.With];
    if (!clinicianId) continue;

    const status = row.Status === "Complete" ? "completed" :
                   row.Status === "Booked" ? "scheduled" :
                   row.Status === "Did not attend" ? "dna" : "cancelled";

    if (status === "cancelled") continue;

    const typeMapping = mapAppointmentType(row["Appointment Type"]);
    const apptDate = parseDDMMYYYY(row.Date);
    const [hh, mm] = row["Start Time"].split(":").map(Number);
    apptDate.setHours(hh, mm, 0, 0);

    const endDate = new Date(apptDate.getTime() + 45 * 60 * 1000);
    const costStr = row.Cost.replace(/,/g, "").trim();
    const costPounds = parseFloat(costStr) || 0;

    const description = (row.Description || "").replace(/\n/g, " ").trim();

    appointments.push({
      id: `apt-${i + 1}`,
      patientId: row.WUID,
      patientName: row["Patient Name"].trim(),
      clinicianId,
      dateTime: apptDate.toISOString(),
      endTime: endDate.toISOString(),
      status,
      appointmentType: typeMapping.appointmentType,
      isInitialAssessment: typeMapping.isInitialAssessment,
      hepAssigned: false,
      conditionTag: description.slice(0, 100),
      revenueAmountPence: Math.round(costPounds * 100),
      followUpBooked: false,
      source: "pms_sync",
      pmsExternalId: row.WUID,
      insuranceFlag: typeMapping.insuranceFlag,
      insurerName: typeMapping.insurerName,
      rawDate: row.Date,
      weekStart: getWeekStart(row.Date),
      createdAt: parseDDMMYYYY(row["Create Date"]).toISOString(),
      updatedAt: apptDate.toISOString(),
    });
  }

  // Post-process: mark followUpBooked where patient has a subsequent appointment
  const patientAppts = new Map<string, AppointmentDoc[]>();
  for (const apt of appointments) {
    const existing = patientAppts.get(apt.patientId) || [];
    existing.push(apt);
    patientAppts.set(apt.patientId, existing);
  }
  for (const appts of Array.from(patientAppts.values())) {
    appts.sort((a: AppointmentDoc, b: AppointmentDoc) =>
      new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
    );
    for (let j = 0; j < appts.length - 1; j++) {
      appts[j].followUpBooked = true;
    }
  }

  // Simulate HEP assignment (~70% of follow-ups get a programme)
  let hepCounter = 0;
  for (const apt of appointments) {
    if (apt.status === "completed") {
      hepCounter++;
      apt.hepAssigned = hepCounter % 10 < 7;
    }
  }

  return appointments;
}

// ─── Synthetic DNA appointments (5 total, distributed across weeks) ──────────

function generateDnaAppointments(appointments: AppointmentDoc[]): AppointmentDoc[] {
  const dnaPatients = [
    { name: "DNA Patient 1", week: "2026-01-12", clinicianId: "c-max", cost: 7500 },
    { name: "DNA Patient 2", week: "2026-01-26", clinicianId: "c-max", cost: 7500 },
    { name: "DNA Patient 3", week: "2026-02-09", clinicianId: "c-andrew", cost: 7500 },
    { name: "DNA Patient 4", week: "2026-02-23", clinicianId: "c-max", cost: 5000 },
    { name: "DNA Patient 5", week: "2026-03-02", clinicianId: "c-jamal", cost: 7500 },
  ];

  const baseIdx = appointments.length;
  return dnaPatients.map((dna, i) => {
    const monday = new Date(dna.week + "T10:00:00.000Z");
    const tues = new Date(monday.getTime() + 86400000);
    return {
      id: `apt-dna-${i + 1}`,
      patientId: `dna-${i + 1}`,
      patientName: dna.name,
      clinicianId: dna.clinicianId,
      dateTime: tues.toISOString(),
      endTime: new Date(tues.getTime() + 45 * 60 * 1000).toISOString(),
      status: "dna" as const,
      appointmentType: "follow_up" as const,
      isInitialAssessment: false,
      hepAssigned: false,
      conditionTag: "",
      revenueAmountPence: dna.cost,
      followUpBooked: false,
      source: "pms_sync" as const,
      pmsExternalId: `dna-synthetic-${i + 1}`,
      insuranceFlag: i === 3,
      insurerName: i === 3 ? "Bupa" : undefined,
      rawDate: "",
      weekStart: dna.week,
      createdAt: monday.toISOString(),
      updatedAt: tues.toISOString(),
    };
  });
}

// ─── Extract unique patients from appointments ──────────────────────────────

interface PatientDoc {
  id: string;
  name: string;
  clinicianId: string;
  contact: { email?: string; phone?: string };
  insuranceFlag: boolean;
  insurerName?: string;
  preAuthStatus: "pending" | "confirmed" | "not_required";
  pmsExternalId: string;
  lastSessionDate: string;
  nextSessionDate?: string;
  sessionCount: number;
  treatmentLength: number;
  discharged: boolean;
  churnRisk: boolean;
  createdAt: string;
  updatedAt: string;
}

function extractPatients(appointments: AppointmentDoc[]): PatientDoc[] {
  const completed = appointments.filter(a => a.status === "completed");
  const patientMap = new Map<string, AppointmentDoc[]>();

  for (const apt of completed) {
    const existing = patientMap.get(apt.patientId) || [];
    existing.push(apt);
    patientMap.set(apt.patientId, existing);
  }

  const patients: PatientDoc[] = [];
  const latestDateInData = new Date("2026-03-11");

  for (const [wuid, appts] of Array.from(patientMap.entries())) {
    appts.sort((a: AppointmentDoc, b: AppointmentDoc) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    const clinicianCounts = new Map<string, number>();
    let hasInsurance = false;
    let lastInsurerName: string | undefined;

    for (const apt of appts) {
      clinicianCounts.set(apt.clinicianId, (clinicianCounts.get(apt.clinicianId) || 0) + 1);
      if (apt.insuranceFlag) {
        hasInsurance = true;
        lastInsurerName = apt.insurerName;
      }
    }

    let primaryClinician = "c-max";
    let maxCount = 0;
    for (const [cid, count] of Array.from(clinicianCounts.entries())) {
      if (count > maxCount) {
        maxCount = count;
        primaryClinician = cid;
      }
    }

    const lastAppt = appts[appts.length - 1];
    const lastDate = new Date(lastAppt.dateTime);
    const daysSinceLast = Math.floor((latestDateInData.getTime() - lastDate.getTime()) / 86400000);

    const sessionCount = appts.length;
    const discharged = sessionCount >= 6 && daysSinceLast > 21;
    const churnRisk = !discharged && daysSinceLast > 21 && sessionCount < 6;

    patients.push({
      id: wuid,
      name: appts[0].patientName,
      clinicianId: primaryClinician,
      contact: {},
      insuranceFlag: hasInsurance,
      insurerName: lastInsurerName,
      preAuthStatus: hasInsurance ? "confirmed" : "not_required",
      pmsExternalId: wuid,
      lastSessionDate: toISODate(lastDate),
      sessionCount,
      treatmentLength: 6,
      discharged,
      churnRisk,
      createdAt: appts[0].createdAt,
      updatedAt: lastAppt.updatedAt,
    });
  }

  return patients;
}

// ─── Compute metrics_weekly from real appointments ──────────────────────────

interface MetricDoc {
  clinicianId: string;
  clinicianName: string;
  weekStart: string;
  followUpRate: number;
  followUpTarget: number;
  hepComplianceRate: number;
  hepRate: number;
  hepTarget: number;
  utilisationRate: number;
  dnaRate: number;
  treatmentCompletionRate: number;
  revenuePerSessionPence: number;
  appointmentsTotal: number;
  initialAssessments: number;
  followUps: number;
  npsScore?: number;
  reviewCount?: number;
  reviewVelocity?: number;
  computedAt: string;
  statisticallyRepresentative?: boolean;
  caveatNote?: string;
}

// Simulated HEP compliance arcs per clinician (no live HEP provider data)
const HEP_ARCS: Record<string, number[]> = {
  "c-andrew": [0.55, 0.58, 0.61, 0.63, 0.65, 0.68, 0.70, 0.72, 0.74, 0.76, 0.78],
  "c-max":    [0.72, 0.74, 0.75, 0.76, 0.78, 0.79, 0.80, 0.81, 0.82, 0.83, 0.84],
  "c-jamal":  [0.80, 0.81, 0.82, 0.83, 0.84, 0.85, 0.85, 0.86, 0.87, 0.87, 0.88],
  "c-joe":    [1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0],
};

// Max works M-F (~8 slots), Andrew works 2 evenings (~4 slots), Jamal works Wed (~8 slots), Joe sporadic (~2 slots)
const WEEKLY_SLOTS: Record<string, number> = {
  "c-max": 40,
  "c-andrew": 8,
  "c-jamal": 8,
  "c-joe": 4,
};

function computeMetrics(appointments: AppointmentDoc[]): MetricDoc[] {
  const weekMap = new Map<string, Map<string, AppointmentDoc[]>>();

  for (const apt of appointments) {
    const ws = apt.weekStart;
    if (!weekMap.has(ws)) weekMap.set(ws, new Map());
    const clinMap = weekMap.get(ws)!;
    if (!clinMap.has(apt.clinicianId)) clinMap.set(apt.clinicianId, []);
    clinMap.get(apt.clinicianId)!.push(apt);
  }

  const allWeeks = Array.from(weekMap.keys()).sort();
  const now = new Date().toISOString();
  const metrics: MetricDoc[] = [];

  // Track rolling follow-up rates for smoother computation
  const rollingFollowUps: Record<string, number[]> = {};
  const rollingInitials: Record<string, number[]> = {};

  for (let wi = 0; wi < allWeeks.length; wi++) {
    const weekStart = allWeeks[wi];
    const clinMap = weekMap.get(weekStart)!;
    const allClinicianIds = ["c-max", "c-andrew", "c-jamal", "c-joe"];

    const weekMetrics: MetricDoc[] = [];

    for (const cid of allClinicianIds) {
      const appts = clinMap.get(cid) || [];
      const completed = appts.filter(a => a.status === "completed");
      const dnas = appts.filter(a => a.status === "dna");
      const scheduled = appts.filter(a => a.status === "scheduled");

      const totalBooked = completed.length + dnas.length + scheduled.length;
      const initialAssessments = completed.filter(a => a.isInitialAssessment).length;
      const followUps = completed.filter(a => !a.isInitialAssessment).length;

      // Rolling 4-week follow-up rate for stability
      if (!rollingFollowUps[cid]) { rollingFollowUps[cid] = []; rollingInitials[cid] = []; }
      rollingFollowUps[cid].push(followUps);
      rollingInitials[cid].push(initialAssessments);
      if (rollingFollowUps[cid].length > 4) { rollingFollowUps[cid].shift(); rollingInitials[cid].shift(); }

      const rollingFU = rollingFollowUps[cid].reduce((a, b) => a + b, 0);
      const rollingIA = rollingInitials[cid].reduce((a, b) => a + b, 0);
      const followUpRate = rollingIA > 0 ? Math.round((rollingFU / rollingIA) * 100) / 100 : 0;

      const totalRevenuePence = completed.reduce((sum, a) => sum + a.revenueAmountPence, 0);
      const revenuePerSession = completed.length > 0 ? Math.round(totalRevenuePence / completed.length) : 0;

      const dnaRate = totalBooked > 0 ? Math.round((dnas.length / totalBooked) * 100) / 100 : 0;
      const utilisationRate = WEEKLY_SLOTS[cid]
        ? Math.min(1, Math.round((completed.length / WEEKLY_SLOTS[cid]) * 100) / 100)
        : 0;

      const hepIdx = Math.min(wi, (HEP_ARCS[cid] || []).length - 1);
      const hepRate = (HEP_ARCS[cid] || [])[hepIdx] ?? 0.7;
      const hepRate = Math.min(1, hepRate + 0.05);

      // HEP compliance: simulate improvement over time
      const baseTreatmentCompletion = cid === "c-joe" ? 1.0 : 0.65;
      const treatmentCompletionRate = Math.min(1, baseTreatmentCompletion + wi * 0.015);

      const isLowVolume = completed.length < 3;

      const metric: MetricDoc = {
        clinicianId: cid,
        clinicianName: CLINICIAN_NAME_BY_ID[cid] || cid,
        weekStart,
        followUpRate,
        followUpTarget: 2.9,
        hepComplianceRate: hepRate,
        hepRate,
        hepTarget: 0.95,
        utilisationRate,
        dnaRate,
        treatmentCompletionRate: Math.round(treatmentCompletionRate * 100) / 100,
        revenuePerSessionPence: revenuePerSession,
        appointmentsTotal: completed.length,
        initialAssessments,
        followUps,
        computedAt: now,
      };

      if (isLowVolume) {
        metric.statisticallyRepresentative = false;
        metric.caveatNote = `Sample size < 3 appointments; metrics are directionally indicative only`;
      }

      weekMetrics.push(metric);
    }

    // Compute "all" aggregate
    const allMetric = computeAllMetric(weekMetrics, weekStart, now);
    metrics.push(...weekMetrics, allMetric);
  }

  return metrics;
}

function computeAllMetric(weekMetrics: MetricDoc[], weekStart: string, now: string): MetricDoc {
  let totalAppts = 0, totalIAs = 0, totalFUs = 0;
  let sumFU = 0, sumPT = 0, sumUtil = 0, sumDNA = 0;
  let sumCC = 0, sumRevenue = 0, sumHEP = 0;
  let count = 0;

  for (const m of weekMetrics) {
    totalAppts += m.appointmentsTotal;
    totalIAs += m.initialAssessments;
    totalFUs += m.followUps;
    sumFU += m.followUpRate;
    sumPT += m.hepRate;
    sumUtil += m.utilisationRate;
    sumDNA += m.dnaRate;
    sumCC += m.treatmentCompletionRate;
    sumRevenue += m.revenuePerSessionPence;
    sumHEP += m.hepComplianceRate;
    count++;
  }

  return {
    clinicianId: "all",
    clinicianName: "All Clinicians",
    weekStart,
    followUpRate: count > 0 ? Math.round((sumFU / count) * 100) / 100 : 0,
    followUpTarget: 2.9,
    hepComplianceRate: count > 0 ? Math.round((sumHEP / count) * 100) / 100 : 0,
    hepRate: count > 0 ? Math.round((sumPT / count) * 100) / 100 : 0,
    hepTarget: 0.95,
    utilisationRate: count > 0 ? Math.round((sumUtil / count) * 100) / 100 : 0,
    dnaRate: count > 0 ? Math.round((sumDNA / count) * 100) / 100 : 0,
    treatmentCompletionRate: count > 0 ? Math.round((sumCC / count) * 100) / 100 : 0,
    revenuePerSessionPence: count > 0 ? Math.round(sumRevenue / count) : 0,
    appointmentsTotal: totalAppts,
    initialAssessments: totalIAs,
    followUps: totalFUs,
    computedAt: now,
  };
}

// ─── Firebase Admin init (flexible credential chain) ────────────────────────

function loadEnvLocal(): void {
  require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });
}

function initFirebaseAdmin(): void {
  if (admin.apps.length) return;

  loadEnvLocal();

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "clinical-tracker-spires";

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    console.log("Using env var credentials (FIREBASE_CLIENT_EMAIL).\n");
    return;
  }

  const keyPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), "scripts", "serviceAccountKey.json");

  if (fs.existsSync(keyPath)) {
    const key = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(key) });
    console.log("Using service account key:", keyPath, "\n");
    return;
  }

  const adcPath = path.join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".config", "gcloud", "application_default_credentials.json"
  );
  if (fs.existsSync(adcPath)) {
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
      console.log("Using Application Default Credentials (gcloud).\n");
      return;
    } catch {
      // fall through
    }
  }

  console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  No Firebase Admin credentials found.                          ║
║                                                                ║
║  You need ONE of these (pick the easiest):                     ║
║                                                                ║
║  Option 1 — Add to .env.local:                                 ║
║    FIREBASE_PROJECT_ID=clinical-tracker-spires                 ║
║    FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@...gservice...  ║
║    FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n..."     ║
║                                                                ║
║  Option 2 — Download service account key:                      ║
║    Firebase Console → Project Settings → Service accounts      ║
║    → Generate new private key                                  ║
║    Save as: dashboard/scripts/serviceAccountKey.json           ║
║                                                                ║
║  Option 3 — gcloud CLI:                                        ║
║    gcloud auth application-default login                       ║
║                                                                ║
║  Then re-run: npm run seed:production                          ║
╚══════════════════════════════════════════════════════════════════╝
`);
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══ StrydeOS Production Seed — Real Spires Data ═══\n");

  // ── Parse CSV data ───────────────────────────────────────────────────────
  console.log("Parsing WriteUpp CSV exports...");
  const csvRows = loadActivityCsv();
  console.log(`  Loaded ${csvRows.length} CSV rows`);

  const appointments = transformAppointments(csvRows);
  const dnaAppointments = generateDnaAppointments(appointments);
  const allAppointments = [...appointments, ...dnaAppointments];
  console.log(`  ${appointments.length} completed/scheduled appointments`);
  console.log(`  ${dnaAppointments.length} synthetic DNA appointments`);

  const patients = extractPatients(allAppointments);
  console.log(`  ${patients.length} unique patients extracted`);

  const metrics = computeMetrics(allAppointments);
  const weekCount = new Set(metrics.map(m => m.weekStart)).size;
  console.log(`  ${metrics.length} metrics_weekly documents (${weekCount} weeks × 5 rows)`);

  // ── Verification ──────────────────────────────────────────────────────────
  const completedCount = allAppointments.filter(a => a.status === "completed").length;
  const dnaCount = allAppointments.filter(a => a.status === "dna").length;
  console.log(`\n  Verification: ${completedCount} completed, ${dnaCount} DNA`);

  const byClinicianCount: Record<string, number> = {};
  for (const a of allAppointments.filter(a => a.status === "completed")) {
    byClinicianCount[a.clinicianId] = (byClinicianCount[a.clinicianId] || 0) + 1;
  }
  for (const [cid, count] of Object.entries(byClinicianCount)) {
    console.log(`    ${CLINICIAN_NAME_BY_ID[cid]}: ${count} appointments`);
  }

  // ── Init Firebase ─────────────────────────────────────────────────────────
  initFirebaseAdmin();
  const auth = admin.auth();
  const db = admin.firestore();
  const now = new Date().toISOString();

  // ── 1. Ensure clinic document ─────────────────────────────────────────────
  const clinicRef = db.collection("clinics").doc(CLINIC_ID);
  const clinicSnap = await clinicRef.get();

  if (!clinicSnap.exists) {
    await clinicRef.set({
      name: CLINIC_NAME,
      timezone: "Europe/London",
      ownerEmail: "jamal@spiresphysiotherapy.com",
      status: "onboarding",
      pmsType: null,
      // Every new doc produced by this script is synthetic or derived from a
      // stale CSV — NOT a live PMS. dataMode=sample raises the SampleDataBanner
      // everywhere until scripts/purge-spires-seed-data.ts flips it to "live".
      dataMode: "sample",
      featureFlags: { intelligence: true, continuity: true, receptionist: false },
      targets: {
        followUpRate: 2.9,
        hepRate: 95,
        utilisationRate: 85,
        dnaRate: 5,
        treatmentCompletionTarget: 80,
      },
      brandConfig: {},
      onboarding: { pmsConnected: false, cliniciansConfirmed: false, targetsSet: false },
      createdAt: now,
      updatedAt: now,
    });
    console.log("\nCreated clinic:", CLINIC_ID);
  } else {
    await clinicRef.update({
      name: CLINIC_NAME,
      status: "onboarding",
      dataMode: "sample",
      updatedAt: now,
    });
    console.log("\nUpdated clinic:", CLINIC_ID, "-> onboarding, dataMode=sample");
  }

  // ── 2. Seed clinicians ────────────────────────────────────────────────────
  for (const c of CLINICIANS) {
    await clinicRef.collection("clinicians").doc(c.id).set({
      name: c.name,
      role: c.role,
      pmsExternalId: c.pmsExternalId,
      active: true,
      createdAt: now,
      createdBy: "seed-script",
    }, { merge: true });
    console.log("  Clinician:", c.name, "->", c.id);
  }

  // ── 3. Seed Firebase Auth users + Firestore user docs ─────────────────────
  for (const u of USERS) {
    let uid: string;
    const password = u.password ?? getDefaultPassword();

    try {
      const existing = await auth.getUserByEmail(u.email);
      uid = existing.uid;
      await auth.updateUser(uid, {
        password,
        displayName: `${u.firstName} ${u.lastName}`.trim(),
      });
      console.log("  Auth user exists:", u.email, "uid:", uid, "(password reset)");
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "auth/user-not-found") {
        const newUser = await auth.createUser({
          email: u.email,
          password,
          emailVerified: false,
          displayName: `${u.firstName} ${u.lastName}`.trim(),
        });
        uid = newUser.uid;
        console.log("  Created auth user:", u.email, "uid:", uid);
      } else {
        throw e;
      }
    }

    const userDoc: Record<string, unknown> = {
      clinicId: CLINIC_ID,
      clinicianId: u.clinicianId,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      status: "onboarding",
      firstLogin: false,
      tourCompleted: false,
      updatedAt: now,
      updatedBy: "seed-script",
    };

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      userDoc.createdAt = now;
      userDoc.createdBy = "seed-script";
      await userRef.set(userDoc);
      console.log("  Created user doc:", u.firstName, u.lastName);
    } else {
      await userRef.update(userDoc);
      console.log("  Updated user doc:", u.firstName, u.lastName);
    }
  }

  // ── 4. Seed appointments (batched writes) ─────────────────────────────────
  console.log("\nSeeding appointments...");
  const appointmentsRef = clinicRef.collection("appointments");
  let aptBatch = db.batch();
  let batchCount = 0;
  let totalAptWritten = 0;

  for (const apt of allAppointments) {
    const { id, patientName, insuranceFlag, insurerName, rawDate, weekStart, ...firestoreDoc } = apt;
    aptBatch.set(appointmentsRef.doc(id), firestoreDoc);
    batchCount++;
    totalAptWritten++;

    if (batchCount >= 400) {
      await aptBatch.commit();
      aptBatch = db.batch();
      batchCount = 0;
      process.stdout.write(`  Written ${totalAptWritten}/${allAppointments.length}\r`);
    }
  }
  if (batchCount > 0) await aptBatch.commit();
  console.log(`  Seeded ${totalAptWritten} appointments.`);

  // ── 5. Seed patients (batched writes) ─────────────────────────────────────
  console.log("Seeding patients...");
  const patientsRef = clinicRef.collection("patients");
  let ptBatch = db.batch();
  let ptBatchCount = 0;

  for (const p of patients) {
    const { id, ...data } = p;
    ptBatch.set(patientsRef.doc(id), data);
    ptBatchCount++;

    if (ptBatchCount >= 400) {
      await ptBatch.commit();
      ptBatch = db.batch();
      ptBatchCount = 0;
    }
  }
  if (ptBatchCount > 0) await ptBatch.commit();
  console.log(`  Seeded ${patients.length} patients.`);

  // ── 6. Seed metrics_weekly ────────────────────────────────────────────────
  console.log("Seeding metrics_weekly...");
  const metricsRef = clinicRef.collection("metrics_weekly");
  let mBatch = db.batch();
  let mBatchCount = 0;

  for (const m of metrics) {
    const docId = `${m.weekStart}_${m.clinicianId}`;
    mBatch.set(metricsRef.doc(docId), m);
    mBatchCount++;

    if (mBatchCount >= 400) {
      await mBatch.commit();
      mBatch = db.batch();
      mBatchCount = 0;
    }
  }
  if (mBatchCount > 0) await mBatch.commit();
  console.log(`  Seeded ${metrics.length} metrics_weekly documents.`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`
═══ Seed Complete ═══
  Clinic:       ${CLINIC_NAME}
  Clinicians:   ${CLINICIANS.length}
  Patients:     ${patients.length}
  Appointments: ${totalAptWritten} (${completedCount} completed, ${dnaCount} DNA)
  Metrics:      ${metrics.length} weekly rows across ${weekCount} weeks
  Date range:   Jan 2 2026 – Mar 11 2026

All users set to firstLogin: false, status: onboarding.
Sign in to trigger the first-login tour for each user.
`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
