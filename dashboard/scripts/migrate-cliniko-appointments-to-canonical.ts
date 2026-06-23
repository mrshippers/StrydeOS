/**
 * Migrate existing clinic-spires appointment docs from the OLD Cliniko-poll
 * shape to the CANONICAL Appointment shape (src/types/appointment.ts).
 *
 * Background
 * ----------
 * The Cliniko poll historically wrote a divergent shape:
 *   startsAt, endsAt, practitionerId, appointmentTypeId,
 *   status ∈ {scheduled, cancelled}
 * but the KPI pipeline, dashboard reads, MCP tools and seed scripts all read
 * the canonical shape:
 *   dateTime, endTime, clinicianId, appointmentType (enum), isInitialAssessment,
 *   status ∈ {scheduled, completed, dna, cancelled, late_cancel}, source.
 * Result: 1,522 real Spires appointments are invisible to everything that reads.
 *
 * This script rewrites those docs IN PLACE:
 *   startsAt           → dateTime
 *   endsAt             → endTime
 *   practitionerId     → clinicianId
 *   appointmentTypeId  → resolved name → appointmentType enum + isInitialAssessment
 *   source             → "pms_sync"
 * The legacy fields are removed; pmsExternalId / pmsType / updatedAt / syncedAt
 * are preserved; appointmentTypeName is added (for downstream insurance-route).
 *
 * Idempotent
 * ----------
 * A doc is considered already-migrated when it has a `dateTime` field and no
 * legacy `startsAt`. Re-running is safe — migrated docs are skipped.
 *
 * Appointment-type resolution
 * ---------------------------
 * Fetches GET /appointment_types (Basic auth, key:x) once and builds an
 * id → name map, then classifies the name into the canonical enum with the
 * same rules the poll/pipeline use.
 *
 * Required env:
 *   CLINIKO_KEY                     Cliniko API key (Basic auth username, pw "x")
 *   (optional) CLINIKO_BASE_URL     defaults to https://api.uk3.cliniko.com/v1
 *   Firebase Admin creds via ADC (gcloud auth application-default login) or
 *   FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY/FIREBASE_PROJECT_ID, or
 *   scripts/serviceAccountKey.json. projectId defaults to clinical-tracker-spires.
 *
 * Usage (from dashboard/), DRY-RUN first:
 *   CLINIKO_KEY=... npx tsx scripts/migrate-cliniko-appointments-to-canonical.ts --dry-run
 *   CLINIKO_KEY=... npx tsx scripts/migrate-cliniko-appointments-to-canonical.ts
 *
 * Do NOT run automatically. Inspect the dry-run output before committing writes.
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

const CLINIC_ID = "clinic-spires";
const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "clinical-tracker-spires";
const CLINIKO_BASE_URL = (
  process.env.CLINIKO_BASE_URL || "https://api.uk3.cliniko.com/v1"
).replace(/\/$/, "");
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 400; // < Firestore 500 cap, leaves headroom

type CanonicalStatus =
  | "scheduled"
  | "completed"
  | "dna"
  | "cancelled"
  | "late_cancel";
type CanonicalAppointmentType =
  | "initial_assessment"
  | "follow_up"
  | "review"
  | "discharge";

// ─── Firebase Admin init (mirrors scripts/seed-spires-production.ts) ──────────

function initFirebaseAdmin(): void {
  if (admin.apps.length) return;

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (PROJECT_ID && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId: PROJECT_ID, clientEmail, privateKey }),
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

  // Application Default Credentials (gcloud auth application-default login)
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  });
  console.log("Using Application Default Credentials (gcloud).\n");
}

// ─── Cliniko appointment-type name map ───────────────────────────────────────

interface ClinikoAppointmentTypeRow {
  id: number | string;
  name?: string;
}
interface ClinikoAppointmentTypesResponse {
  appointment_types: ClinikoAppointmentTypeRow[];
  links?: { next?: string };
}

async function fetchAppointmentTypeNameMap(): Promise<Map<string, string>> {
  const apiKey = process.env.CLINIKO_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "CLINIKO_KEY env var is required to resolve appointment-type names."
    );
  }
  const authHeader = `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}`;
  const map = new Map<string, string>();
  let nextUrl: string | null = `${CLINIKO_BASE_URL}/appointment_types?per_page=100`;
  let page = 0;

  while (nextUrl && page < 100) {
    const res: Response = await fetch(nextUrl, {
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "StrydeOS/1.0",
      },
    });
    if (!res.ok) {
      throw new Error(
        `Cliniko /appointment_types ${res.status}: ${await res.text().catch(() => "")}`
      );
    }
    const body = (await res.json()) as ClinikoAppointmentTypesResponse;
    for (const row of body.appointment_types ?? []) {
      if (row?.id != null && typeof row.name === "string") {
        map.set(String(row.id), row.name);
      }
    }
    nextUrl = body.links?.next ?? null;
    page++;
  }

  return map;
}

// ─── Classification (mirrors functions/src/cliniko-poll.ts) ───────────────────

function classifyAppointmentTypeName(typeName: string | null | undefined): {
  appointmentType: CanonicalAppointmentType;
  isInitialAssessment: boolean;
} {
  const lower = (typeName ?? "").trim().toLowerCase();
  if (/discharge|final session/.test(lower)) {
    return { appointmentType: "discharge", isInitialAssessment: false };
  }
  if (/follow[\s-]?up|subsequent|treatment/.test(lower)) {
    return { appointmentType: "follow_up", isInitialAssessment: false };
  }
  if (/review|progress/.test(lower)) {
    return { appointmentType: "review", isInitialAssessment: false };
  }
  if (/initial|assessment|new patient|consultation/.test(lower)) {
    return { appointmentType: "initial_assessment", isInitialAssessment: true };
  }
  return { appointmentType: "follow_up", isInitialAssessment: false };
}

function normaliseStatus(legacy: unknown): CanonicalStatus {
  // Legacy poll only ever wrote "scheduled" | "cancelled". Any already-canonical
  // value passes through untouched.
  const v = String(legacy ?? "scheduled");
  if (v === "completed" || v === "dna" || v === "cancelled" || v === "late_cancel") {
    return v;
  }
  return "scheduled";
}

// ─── Migration ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  initFirebaseAdmin();
  const db = admin.firestore();

  console.log(`Resolving appointment-type names from ${CLINIKO_BASE_URL} ...`);
  const typeNames = await fetchAppointmentTypeNameMap();
  console.log(`Resolved ${typeNames.size} appointment types.\n`);

  const col = db.collection("clinics").doc(CLINIC_ID).collection("appointments");
  const snap = await col.get();
  console.log(`Scanning ${snap.size} appointment docs for clinic ${CLINIC_ID}.`);

  let migrated = 0;
  let skipped = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;

    // Idempotency: a migrated doc has dateTime and no legacy startsAt.
    const hasLegacy = "startsAt" in data || "practitionerId" in data;
    const hasCanonical = typeof data.dateTime === "string";
    if (hasCanonical && !hasLegacy) {
      skipped++;
      continue;
    }

    const appointmentTypeId =
      (data.appointmentTypeId as string | undefined) ?? "";
    const appointmentTypeName = appointmentTypeId
      ? typeNames.get(appointmentTypeId) ?? null
      : null;
    const { appointmentType, isInitialAssessment } =
      classifyAppointmentTypeName(appointmentTypeName);

    const update: Record<string, unknown> = {
      dateTime: (data.dateTime as string | undefined) ?? data.startsAt ?? null,
      endTime: (data.endTime as string | undefined) ?? data.endsAt ?? null,
      clinicianId:
        (data.clinicianId as string | undefined) ?? data.practitionerId ?? "",
      patientId: (data.patientId as string | undefined) ?? "",
      status: normaliseStatus(data.status),
      appointmentType,
      isInitialAssessment,
      appointmentTypeName,
      source: "pms_sync",
      pmsExternalId:
        (data.pmsExternalId as string | undefined) ?? doc.id,
      pmsType: (data.pmsType as string | undefined) ?? "cliniko",
      // Drop the divergent legacy fields.
      startsAt: admin.firestore.FieldValue.delete(),
      endsAt: admin.firestore.FieldValue.delete(),
      practitionerId: admin.firestore.FieldValue.delete(),
    };

    if (DRY_RUN) {
      if (migrated < 5) {
        console.log(
          `  [dry-run] ${doc.id}: ${data.startsAt ?? data.dateTime} → ` +
            `dateTime, type "${appointmentTypeName ?? "?"}" → ${appointmentType}`
        );
      }
      migrated++;
      continue;
    }

    batch.set(doc.ref, update, { merge: true });
    batchCount++;
    migrated++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
  }

  console.log(
    `\n${DRY_RUN ? "[dry-run] Would migrate" : "Migrated"} ${migrated} docs, ` +
      `skipped ${skipped} already-canonical.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
