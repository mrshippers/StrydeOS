/**
 * Production seed script for Spires Physiotherapy London.
 *
 * Seeds all 4 real users (Jamal, Andrew Henry, Max Hubbard, Joe Korge)
 * into Firebase Auth + Firestore, along with clinician records,
 * metrics_weekly data per clinician, and patients so Patients/Pulse show real data.
 *
 * Idempotent — safe to re-run. Resets all accounts for first-login flow.
 *
 * Credential resolution (first match wins):
 *   1. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env.local
 *   2. scripts/serviceAccountKey.json (or GOOGLE_APPLICATION_CREDENTIALS)
 *   3. gcloud application-default credentials (gcloud auth application-default login)
 *
 * Usage (from dashboard/):
 *   npm run seed:production
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

const CLINIC_ID = "clinic-spires";
const CLINIC_NAME = "Spires Physiotherapy London";

// ─── User definitions ───────────────────────────────────────────────────────

interface UserSeed {
  email: string;
  firstName: string;
  lastName: string;
  role: "owner" | "admin" | "clinician";
  clinicianId: string;
  password?: string;
}

const DEFAULT_PASSWORD = "SpiresWH!";

const USERS: UserSeed[] = [
  {
    email: "jamal@spiresphysiotherapy.com",
    firstName: "Jamal",
    lastName: "",
    role: "owner",
    clinicianId: "c-jamal",
    password: DEFAULT_PASSWORD,
  },
  {
    email: "andrew@spiresphysiotherapy.com",
    firstName: "Andrew",
    lastName: "Henry",
    role: "clinician",
    clinicianId: "c-andrew",
    password: DEFAULT_PASSWORD,
  },
  {
    email: "max@spiresphysiotherapy.com",
    firstName: "Max",
    lastName: "Hubbard",
    role: "clinician",
    clinicianId: "c-max",
    password: DEFAULT_PASSWORD,
  },
  {
    email: "joe@spiresphysiotherapy.com",
    firstName: "Joe",
    lastName: "Korge",
    role: "admin",
    clinicianId: "c-joe",
    password: DEFAULT_PASSWORD,
  },
];

// ─── Clinician definitions ──────────────────────────────────────────────────

const CLINICIANS = [
  { id: "c-jamal", name: "Jamal", role: "Owner / Lead Physio", pmsExternalId: "jamal-1" },
  { id: "c-andrew", name: "Andrew Henry", role: "Physiotherapist", pmsExternalId: "andrew-1" },
  { id: "c-max", name: "Max Hubbard", role: "Physiotherapist", pmsExternalId: "max-1" },
  { id: "c-joe", name: "Joe Korge", role: "Admin", pmsExternalId: "joe-1" },
];

// ─── Patient seed (for Patients page and Pulse board) ────────────────────────

interface PatientSeed {
  id: string;
  name: string;
  clinicianId: string;
  contact: { email?: string; phone?: string };
  insuranceFlag: boolean;
  insurerName?: string;
  preAuthStatus: "pending" | "confirmed" | "rejected" | "not_required";
  lastSessionDate?: string;
  nextSessionDate?: string;
  sessionCount: number;
  courseLength: number;
  discharged: boolean;
  churnRisk: boolean;
}

const PATIENTS: PatientSeed[] = [
  { id: "p1", name: "James Whitfield", clinicianId: "c-andrew", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-18", nextSessionDate: "2026-02-25", sessionCount: 3, courseLength: 6, discharged: false, churnRisk: false },
  { id: "p2", name: "Catherine Bose", clinicianId: "c-andrew", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-14", nextSessionDate: "2026-02-21", sessionCount: 4, courseLength: 6, discharged: false, churnRisk: false },
  { id: "p3", name: "Daniel Marr", clinicianId: "c-max", contact: {}, insuranceFlag: true, insurerName: "Bupa", preAuthStatus: "confirmed", lastSessionDate: "2026-02-01", sessionCount: 2, courseLength: 6, discharged: false, churnRisk: true },
  { id: "p4", name: "Emma Richardson", clinicianId: "c-max", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-17", nextSessionDate: "2026-02-24", sessionCount: 5, courseLength: 6, discharged: false, churnRisk: false },
  { id: "p5", name: "Oliver Shaw", clinicianId: "c-andrew", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-28", sessionCount: 3, courseLength: 6, discharged: false, churnRisk: true },
  { id: "p6", name: "Sophie Turner", clinicianId: "c-jamal", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-19", nextSessionDate: "2026-02-26", sessionCount: 2, courseLength: 4, discharged: false, churnRisk: false },
  { id: "p7", name: "Liam Bradshaw", clinicianId: "c-andrew", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-10", sessionCount: 6, courseLength: 6, discharged: true, churnRisk: false },
  { id: "p8", name: "Rachel Obi", clinicianId: "c-max", contact: {}, insuranceFlag: true, insurerName: "AXA Health", preAuthStatus: "confirmed", lastSessionDate: "2026-02-12", sessionCount: 4, courseLength: 4, discharged: true, churnRisk: false },
  { id: "p9", name: "Marcus Thorne", clinicianId: "c-andrew", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-30", sessionCount: 2, courseLength: 8, discharged: false, churnRisk: true },
  { id: "p10", name: "Nina Aslam", clinicianId: "c-jamal", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-15", nextSessionDate: "2026-02-22", sessionCount: 1, courseLength: 6, discharged: false, churnRisk: false },
  { id: "p11", name: "George Kemp", clinicianId: "c-max", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-01-25", sessionCount: 3, courseLength: 6, discharged: false, churnRisk: true },
  { id: "p12", name: "Helen Corr", clinicianId: "c-jamal", contact: {}, insuranceFlag: false, preAuthStatus: "not_required", lastSessionDate: "2026-02-05", sessionCount: 6, courseLength: 6, discharged: true, churnRisk: false },
];

// ─── Metrics data — 6 weeks per clinician ───────────────────────────────────

const WEEKS = [
  "2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26",
  "2026-02-02", "2026-02-09", "2026-02-16", "2026-02-23",
  "2026-03-02",
];

interface MetricRow {
  followUpRate: number;
  physitrackRate: number;
  appointmentsTotal: number;
  utilisationRate: number;
  dnaRate: number;
  courseCompletionRate: number;
  revenuePerSessionPence: number;
  initialAssessments: number;
  followUps: number;
  hepComplianceRate: number;
  statisticallyRepresentative?: boolean;
  caveatNote?: string;
}

const METRICS: Record<string, MetricRow[]> = {
  "c-andrew": [
    { followUpRate: 1.82, physitrackRate: 0.80, appointmentsTotal: 21, utilisationRate: 0.78, dnaRate: 0.13, courseCompletionRate: 0.66, revenuePerSessionPence: 8100, initialAssessments: 3, followUps: 18, hepComplianceRate: 0.80 },
    { followUpRate: 1.90, physitrackRate: 0.82, appointmentsTotal: 22, utilisationRate: 0.80, dnaRate: 0.12, courseCompletionRate: 0.68, revenuePerSessionPence: 8200, initialAssessments: 3, followUps: 19, hepComplianceRate: 0.82 },
    { followUpRate: 1.98, physitrackRate: 0.84, appointmentsTotal: 23, utilisationRate: 0.82, dnaRate: 0.11, courseCompletionRate: 0.70, revenuePerSessionPence: 8200, initialAssessments: 3, followUps: 20, hepComplianceRate: 0.84 },
    { followUpRate: 2.10, physitrackRate: 0.85, appointmentsTotal: 23, utilisationRate: 0.84, dnaRate: 0.10, courseCompletionRate: 0.72, revenuePerSessionPence: 8300, initialAssessments: 3, followUps: 20, hepComplianceRate: 0.85 },
    { followUpRate: 2.22, physitrackRate: 0.87, appointmentsTotal: 22, utilisationRate: 0.85, dnaRate: 0.09, courseCompletionRate: 0.73, revenuePerSessionPence: 8400, initialAssessments: 3, followUps: 19, hepComplianceRate: 0.87 },
    { followUpRate: 2.35, physitrackRate: 0.89, appointmentsTotal: 23, utilisationRate: 0.86, dnaRate: 0.08, courseCompletionRate: 0.74, revenuePerSessionPence: 8400, initialAssessments: 4, followUps: 19, hepComplianceRate: 0.89 },
    { followUpRate: 2.44, physitrackRate: 0.90, appointmentsTotal: 24, utilisationRate: 0.87, dnaRate: 0.07, courseCompletionRate: 0.75, revenuePerSessionPence: 8450, initialAssessments: 4, followUps: 20, hepComplianceRate: 0.90 },
    { followUpRate: 2.50, physitrackRate: 0.91, appointmentsTotal: 24, utilisationRate: 0.88, dnaRate: 0.07, courseCompletionRate: 0.76, revenuePerSessionPence: 8500, initialAssessments: 4, followUps: 20, hepComplianceRate: 0.91 },
    { followUpRate: 2.58, physitrackRate: 0.92, appointmentsTotal: 25, utilisationRate: 0.89, dnaRate: 0.06, courseCompletionRate: 0.77, revenuePerSessionPence: 8550, initialAssessments: 4, followUps: 21, hepComplianceRate: 0.92 },
  ],
  "c-max": [
    { followUpRate: 2.80, physitrackRate: 0.91, appointmentsTotal: 19, utilisationRate: 0.83, dnaRate: 0.08, courseCompletionRate: 0.76, revenuePerSessionPence: 7450, initialAssessments: 3, followUps: 16, hepComplianceRate: 0.91 },
    { followUpRate: 2.90, physitrackRate: 0.92, appointmentsTotal: 20, utilisationRate: 0.85, dnaRate: 0.07, courseCompletionRate: 0.78, revenuePerSessionPence: 7500, initialAssessments: 3, followUps: 17, hepComplianceRate: 0.92 },
    { followUpRate: 2.98, physitrackRate: 0.93, appointmentsTotal: 21, utilisationRate: 0.87, dnaRate: 0.06, courseCompletionRate: 0.79, revenuePerSessionPence: 7550, initialAssessments: 3, followUps: 18, hepComplianceRate: 0.93 },
    { followUpRate: 3.08, physitrackRate: 0.93, appointmentsTotal: 22, utilisationRate: 0.89, dnaRate: 0.06, courseCompletionRate: 0.80, revenuePerSessionPence: 7600, initialAssessments: 3, followUps: 19, hepComplianceRate: 0.93 },
    { followUpRate: 3.18, physitrackRate: 0.94, appointmentsTotal: 22, utilisationRate: 0.90, dnaRate: 0.05, courseCompletionRate: 0.81, revenuePerSessionPence: 7650, initialAssessments: 3, followUps: 19, hepComplianceRate: 0.94 },
    { followUpRate: 3.28, physitrackRate: 0.95, appointmentsTotal: 22, utilisationRate: 0.91, dnaRate: 0.05, courseCompletionRate: 0.82, revenuePerSessionPence: 7700, initialAssessments: 3, followUps: 19, hepComplianceRate: 0.95 },
    { followUpRate: 3.35, physitrackRate: 0.95, appointmentsTotal: 23, utilisationRate: 0.91, dnaRate: 0.04, courseCompletionRate: 0.82, revenuePerSessionPence: 7750, initialAssessments: 3, followUps: 20, hepComplianceRate: 0.95 },
    { followUpRate: 3.40, physitrackRate: 0.95, appointmentsTotal: 23, utilisationRate: 0.92, dnaRate: 0.04, courseCompletionRate: 0.83, revenuePerSessionPence: 7800, initialAssessments: 3, followUps: 20, hepComplianceRate: 0.95 },
    { followUpRate: 3.48, physitrackRate: 0.96, appointmentsTotal: 24, utilisationRate: 0.93, dnaRate: 0.03, courseCompletionRate: 0.84, revenuePerSessionPence: 7850, initialAssessments: 4, followUps: 20, hepComplianceRate: 0.96 },
  ],
  "c-jamal": [
    { followUpRate: 3.15, physitrackRate: 0.93, appointmentsTotal: 18, utilisationRate: 0.82, dnaRate: 0.07, courseCompletionRate: 0.79, revenuePerSessionPence: 7550, initialAssessments: 2, followUps: 16, hepComplianceRate: 0.93 },
    { followUpRate: 3.20, physitrackRate: 0.94, appointmentsTotal: 19, utilisationRate: 0.84, dnaRate: 0.06, courseCompletionRate: 0.80, revenuePerSessionPence: 7600, initialAssessments: 3, followUps: 16, hepComplianceRate: 0.94 },
    { followUpRate: 3.22, physitrackRate: 0.94, appointmentsTotal: 20, utilisationRate: 0.86, dnaRate: 0.05, courseCompletionRate: 0.81, revenuePerSessionPence: 7620, initialAssessments: 3, followUps: 17, hepComplianceRate: 0.94 },
    { followUpRate: 3.26, physitrackRate: 0.95, appointmentsTotal: 21, utilisationRate: 0.88, dnaRate: 0.05, courseCompletionRate: 0.82, revenuePerSessionPence: 7650, initialAssessments: 3, followUps: 18, hepComplianceRate: 0.95 },
    { followUpRate: 3.30, physitrackRate: 0.95, appointmentsTotal: 21, utilisationRate: 0.89, dnaRate: 0.04, courseCompletionRate: 0.83, revenuePerSessionPence: 7680, initialAssessments: 3, followUps: 18, hepComplianceRate: 0.95 },
    { followUpRate: 3.35, physitrackRate: 0.96, appointmentsTotal: 22, utilisationRate: 0.90, dnaRate: 0.04, courseCompletionRate: 0.84, revenuePerSessionPence: 7700, initialAssessments: 3, followUps: 19, hepComplianceRate: 0.96 },
    { followUpRate: 3.38, physitrackRate: 0.96, appointmentsTotal: 21, utilisationRate: 0.91, dnaRate: 0.03, courseCompletionRate: 0.85, revenuePerSessionPence: 7710, initialAssessments: 3, followUps: 18, hepComplianceRate: 0.96 },
    { followUpRate: 3.40, physitrackRate: 0.96, appointmentsTotal: 21, utilisationRate: 0.92, dnaRate: 0.03, courseCompletionRate: 0.85, revenuePerSessionPence: 7720, initialAssessments: 3, followUps: 18, hepComplianceRate: 0.96 },
    { followUpRate: 3.45, physitrackRate: 0.97, appointmentsTotal: 22, utilisationRate: 0.93, dnaRate: 0.03, courseCompletionRate: 0.86, revenuePerSessionPence: 7740, initialAssessments: 3, followUps: 19, hepComplianceRate: 0.97 },
  ],
  "c-joe": [
    { followUpRate: 3.8, physitrackRate: 1.0, appointmentsTotal: 2, utilisationRate: 0.20, dnaRate: 0.0, courseCompletionRate: 1.0, revenuePerSessionPence: 7500, initialAssessments: 0, followUps: 2, hepComplianceRate: 1.0, statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { followUpRate: 3.8, physitrackRate: 1.0, appointmentsTotal: 2, utilisationRate: 0.20, dnaRate: 0.0, courseCompletionRate: 1.0, revenuePerSessionPence: 7500, initialAssessments: 0, followUps: 2, hepComplianceRate: 1.0, statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { followUpRate: 3.8, physitrackRate: 1.0, appointmentsTotal: 2, utilisationRate: 0.20, dnaRate: 0.0, courseCompletionRate: 1.0, revenuePerSessionPence: 7500, initialAssessments: 0, followUps: 2, hepComplianceRate: 1.0, statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { followUpRate: 3.8, physitrackRate: 1.0, appointmentsTotal: 2, utilisationRate: 0.20, dnaRate: 0.0, courseCompletionRate: 1.0, revenuePerSessionPence: 7500, initialAssessments: 0, followUps: 2, hepComplianceRate: 1.0, statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { followUpRate: 3.8, physitrackRate: 1.0, appointmentsTotal: 2, utilisationRate: 0.20, dnaRate: 0.0, courseCompletionRate: 1.0, revenuePerSessionPence: 7500, initialAssessments: 1, followUps: 1, hepComplianceRate: 1.0, statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { followUpRate: 3.8, physitrackRate: 1.0, appointmentsTotal: 2, utilisationRate: 0.20, dnaRate: 0.0, courseCompletionRate: 1.0, revenuePerSessionPence: 7500, initialAssessments: 0, followUps: 2, hepComplianceRate: 1.0, statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { followUpRate: 3.8, physitrackRate: 1.0, appointmentsTotal: 2, utilisationRate: 0.20, dnaRate: 0.0, courseCompletionRate: 1.0, revenuePerSessionPence: 7500, initialAssessments: 0, followUps: 2, hepComplianceRate: 1.0, statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { followUpRate: 3.8, physitrackRate: 1.0, appointmentsTotal: 2, utilisationRate: 0.20, dnaRate: 0.0, courseCompletionRate: 1.0, revenuePerSessionPence: 7500, initialAssessments: 0, followUps: 2, hepComplianceRate: 1.0, statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
    { followUpRate: 3.8, physitrackRate: 1.0, appointmentsTotal: 2, utilisationRate: 0.20, dnaRate: 0.0, courseCompletionRate: 1.0, revenuePerSessionPence: 7500, initialAssessments: 0, followUps: 2, hepComplianceRate: 1.0, statisticallyRepresentative: false, caveatNote: "Sample size < 10 patients; metrics are directionally indicative only" },
  ],
};

// ─── Aggregate "all" row from individual clinician data ─────────────────────

function computeAllRow(weekIdx: number): MetricRow {
  const clinicianIds = ["c-andrew", "c-max", "c-jamal", "c-joe"];
  let totalAppts = 0, totalIAs = 0, totalFUs = 0;
  let sumFU = 0, sumPT = 0, sumUtil = 0, sumDNA = 0;
  let sumCC = 0, sumRevenue = 0, sumHEP = 0;
  let count = 0;

  for (const cid of clinicianIds) {
    const row = METRICS[cid][weekIdx];
    totalAppts += row.appointmentsTotal;
    totalIAs += row.initialAssessments;
    totalFUs += row.followUps;
    sumFU += row.followUpRate;
    sumPT += row.physitrackRate;
    sumUtil += row.utilisationRate;
    sumDNA += row.dnaRate;
    sumCC += row.courseCompletionRate;
    sumRevenue += row.revenuePerSessionPence;
    sumHEP += row.hepComplianceRate;
    count++;
  }

  return {
    followUpRate: Math.round((sumFU / count) * 100) / 100,
    physitrackRate: Math.round((sumPT / count) * 100) / 100,
    appointmentsTotal: totalAppts,
    utilisationRate: Math.round((sumUtil / count) * 100) / 100,
    dnaRate: Math.round((sumDNA / count) * 100) / 100,
    courseCompletionRate: Math.round((sumCC / count) * 100) / 100,
    revenuePerSessionPence: Math.round(sumRevenue / count),
    initialAssessments: totalIAs,
    followUps: totalFUs,
    hepComplianceRate: Math.round((sumHEP / count) * 100) / 100,
  };
}

// ─── Firebase Admin init (flexible credential chain) ────────────────────────

function loadEnvLocal(): void {
  require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });
}

function initFirebaseAdmin(): void {
  if (admin.apps.length) return;

  loadEnvLocal();

  // 1. Env vars (same ones the Next.js API routes use)
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

  // 2. Service account key file
  const keyPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), "scripts", "serviceAccountKey.json");

  if (fs.existsSync(keyPath)) {
    const key = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(key) });
    console.log("Using service account key:", keyPath, "\n");
    return;
  }

  // 3. Application Default Credentials (gcloud auth application-default login)
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  initFirebaseAdmin();

  const auth = admin.auth();
  const db = admin.firestore();
  const now = new Date().toISOString();

  // ── 1. Ensure clinic document ──────────────────────────────────────────

  const clinicRef = db.collection("clinics").doc(CLINIC_ID);
  const clinicSnap = await clinicRef.get();

  if (!clinicSnap.exists) {
    await clinicRef.set({
      name: CLINIC_NAME,
      timezone: "Europe/London",
      ownerEmail: "jamal@spiresphysiotherapy.com",
      status: "onboarding",
      pmsType: null,
      featureFlags: { intelligence: true, continuity: true, receptionist: false },
      targets: {
        followUpRate: 2.9,
        physitrackRate: 95,
        utilisationRate: 85,
        dnaRate: 5,
        courseCompletionTarget: 80,
      },
      brandConfig: {},
      onboarding: { pmsConnected: false, cliniciansConfirmed: false, targetsSet: false },
      createdAt: now,
      updatedAt: now,
    });
    console.log("Created clinic:", CLINIC_ID);
  } else {
    await clinicRef.update({
      name: CLINIC_NAME,
      status: "onboarding",
      updatedAt: now,
    });
    console.log("Updated clinic:", CLINIC_ID, "-> onboarding");
  }

  // ── 2. Seed clinicians subcollection ───────────────────────────────────

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

  // ── 3. Seed Firebase Auth users + Firestore user docs ──────────────────

  for (const u of USERS) {
    let uid: string;

    const password = u.password ?? DEFAULT_PASSWORD;

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

    const isJamal = u.email === "jamal@spiresphysiotherapy.com";
    const isJoe = u.firstName === "Joe";

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

    if (isJoe) {
      userDoc.status = "onboarding";
      userDoc.firstLogin = false;
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      userDoc.createdAt = now;
      userDoc.createdBy = "seed-script";
      await userRef.set(userDoc);
      console.log("  Created user doc:", u.firstName, u.lastName);
    } else {
      await userRef.update(userDoc);
      console.log("  Updated user doc:", u.firstName, u.lastName, isJamal ? "(RESET for first-login)" : "");
    }
  }

  // ── 4. Seed metrics_weekly ─────────────────────────────────────────────

  const metricsRef = clinicRef.collection("metrics_weekly");
  let metricsWritten = 0;

  const allClinicians = [...Object.keys(METRICS), "all"];

  for (let wi = 0; wi < WEEKS.length; wi++) {
    const weekStart = WEEKS[wi];

    for (const cid of allClinicians) {
      const isAll = cid === "all";
      const row = isAll ? computeAllRow(wi) : METRICS[cid][wi];
      const clinician = CLINICIANS.find((c) => c.id === cid);
      const clinicianName = isAll ? "All Clinicians" : (clinician?.name ?? cid);

      const docId = `${weekStart}_${cid}`;
      const data: Record<string, unknown> = {
        clinicianId: cid,
        clinicianName,
        weekStart,
        followUpRate: row.followUpRate,
        followUpTarget: 2.9,
        hepComplianceRate: row.hepComplianceRate,
        physitrackRate: row.physitrackRate,
        physitrackTarget: 0.95,
        utilisationRate: row.utilisationRate,
        dnaRate: row.dnaRate,
        courseCompletionRate: row.courseCompletionRate,
        revenuePerSessionPence: row.revenuePerSessionPence,
        appointmentsTotal: row.appointmentsTotal,
        initialAssessments: row.initialAssessments,
        followUps: row.followUps,
        computedAt: now,
      };

      if (row.statisticallyRepresentative === false) {
        data.statisticallyRepresentative = false;
        data.caveatNote = row.caveatNote;
      }

      await metricsRef.doc(docId).set(data);
      metricsWritten++;
    }
  }

  console.log(`\nSeeded ${metricsWritten} metrics_weekly documents across ${WEEKS.length} weeks.`);

  // ── 5. Seed patients (for Patients page and Pulse board) ───────────────────

  const patientsRef = clinicRef.collection("patients");
  for (const p of PATIENTS) {
    const { id, ...data } = p;
    await patientsRef.doc(id).set({
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log(`Seeded ${PATIENTS.length} patients.`);

  console.log("\nDone. All users set to firstLogin: false, status: onboarding.");
  console.log("Sign in to trigger the first-login tour for each user.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});