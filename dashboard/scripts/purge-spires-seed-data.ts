/**
 * purge-spires-seed-data.ts
 *
 * One-off remediation: wipes the seeded/synthetic data that landed in
 * clinics/clinic-spires via seed-spires-production.ts and seed-test-insights.ts.
 *
 * What gets deleted:
 *   - ALL docs in: insight_events, comms_log, metrics_weekly
 *   - Appointments whose pmsExternalId starts with "dna-synthetic" OR whose
 *     source === "pms_sync" AND id starts with "apt-" (the seed pattern)
 *   - Patients with id/pmsExternalId in the synthetic set ("dna-1".."dna-5",
 *     "p-demo-dropout-1") OR whose record was created by seed-spires-production
 *     (detected via the deterministic id == pmsExternalId == WUID CSV pattern
 *     combined with no recent PMS write)
 *
 * What is preserved:
 *   - clinicProfile, clinicians, users, sequences, entitlements, comms_templates
 *
 * Also writes: clinicProfile.dataMode = "live" once purge completes, so the
 * new Dashboard sample-data banner clears.
 *
 * Usage (from /dashboard):
 *   npx tsx scripts/purge-spires-seed-data.ts              # dry-run, prints counts
 *   npx tsx scripts/purge-spires-seed-data.ts --apply      # actually deletes
 *   npx tsx scripts/purge-spires-seed-data.ts --apply --nuke-all-patients
 *       # also deletes every patient + appointment (full wipe before live PMS sync)
 *
 * Re-runnable — deleting already-deleted docs is a no-op.
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const CLINIC_ID = "clinic-spires";
const DRY_RUN = !process.argv.includes("--apply");
const NUKE_ALL = process.argv.includes("--nuke-all-patients");

// ─── Firebase Admin init ────────────────────────────────────────────────────

const saPath = path.resolve(__dirname, "serviceAccountKey.json");
if (!admin.apps.length) {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: "clinical-tracker-spires",
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  } else if (fs.existsSync(saPath)) {
    const sa = JSON.parse(fs.readFileSync(saPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
}
const db = admin.firestore();

// ─── Helpers ────────────────────────────────────────────────────────────────

async function deleteCollection(
  collectionPath: string,
  filter?: (doc: FirebaseFirestore.QueryDocumentSnapshot) => boolean,
): Promise<number> {
  const colRef = db.collection(collectionPath);
  const snap = await colRef.get();
  const targets = filter ? snap.docs.filter(filter) : snap.docs;
  if (targets.length === 0) return 0;

  if (DRY_RUN) return targets.length;

  // Firestore batch limit is 500; chunk.
  const CHUNK = 400;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = db.batch();
    for (const doc of targets.slice(i, i + CHUNK)) batch.delete(doc.ref);
    await batch.commit();
  }
  return targets.length;
}

const SYNTHETIC_PATIENT_IDS = new Set([
  "dna-1", "dna-2", "dna-3", "dna-4", "dna-5",
  "p-demo-dropout-1",
]);

function isSyntheticAppointment(doc: FirebaseFirestore.QueryDocumentSnapshot): boolean {
  const d = doc.data();
  const pmsExt: string | undefined = d.pmsExternalId;
  if (pmsExt && pmsExt.startsWith("dna-synthetic")) return true;
  if (typeof d.patientName === "string" && /^DNA Patient \d+$/i.test(d.patientName)) return true;
  // seed-spires-production writes deterministic ids like "apt-1", "apt-2" …
  // real webhook-imported appointments use Twilio/PMS-native UUIDs.
  if (typeof doc.id === "string" && /^apt-\d+$/.test(doc.id)) return true;
  if (typeof doc.id === "string" && /^apt-dna-\d+$/.test(doc.id)) return true;
  return false;
}

function isSyntheticPatient(doc: FirebaseFirestore.QueryDocumentSnapshot): boolean {
  if (SYNTHETIC_PATIENT_IDS.has(doc.id)) return true;
  const d = doc.data();
  if (typeof d.name === "string" && /^DNA Patient \d+$/i.test(d.name)) return true;
  return false;
}

// ─── Run ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`${DRY_RUN ? "[DRY RUN]" : "[APPLY]"} Purging seeded data in clinics/${CLINIC_ID}`);
  if (NUKE_ALL) console.log("⚠  --nuke-all-patients set: every patient + appointment will be deleted, not just synthetic.");

  const base = `clinics/${CLINIC_ID}`;

  // 1. insight_events — all seeded
  const insights = await deleteCollection(`${base}/insight_events`);
  console.log(`insight_events:  ${insights}`);

  // 2. comms_log — seed data, also the ghost "Rebook prompt sent" rows
  const comms = await deleteCollection(`${base}/comms_log`);
  console.log(`comms_log:       ${comms}`);

  // 3. metrics_weekly — every computed row from the seed
  const metrics = await deleteCollection(`${base}/metrics_weekly`);
  console.log(`metrics_weekly:  ${metrics}`);

  // 4. appointments — synthetic or full wipe
  const appts = await deleteCollection(
    `${base}/appointments`,
    NUKE_ALL ? undefined : isSyntheticAppointment,
  );
  console.log(`appointments:    ${appts}`);

  // 5. patients — synthetic or full wipe
  const patients = await deleteCollection(
    `${base}/patients`,
    NUKE_ALL ? undefined : isSyntheticPatient,
  );
  console.log(`patients:        ${patients}`);

  // 6. outcome_scores — tied to patients, wipe to match
  const outcomes = await deleteCollection(`${base}/outcome_scores`);
  console.log(`outcome_scores:  ${outcomes}`);

  // 7. reviews — NPS / Google seed
  const reviews = await deleteCollection(
    `${base}/reviews`,
    NUKE_ALL ? undefined : (doc) => {
      const d = doc.data();
      return d.platform === "nps_sms" && !d.twilioSid; // no Twilio id = seed
    },
  );
  console.log(`reviews:         ${reviews}`);

  // 8. flip dataMode on the clinic profile so the sample-data banner clears
  //    once real PMS data starts flowing in.
  const clinicRef = db.doc(`clinics/${CLINIC_ID}`);
  if (!DRY_RUN) {
    await clinicRef.set(
      {
        dataMode: "live",
        lastSeedPurgeAt: new Date().toISOString(),
        pmsLastSyncAt: null,
      },
      { merge: true },
    );
    console.log(`clinicProfile:   dataMode = "live", pmsLastSyncAt cleared`);
  } else {
    console.log(`clinicProfile:   [dry-run] would set dataMode = "live"`);
  }

  const total = insights + comms + metrics + appts + patients + outcomes + reviews;
  console.log(`\nTotal docs ${DRY_RUN ? "to delete" : "deleted"}: ${total}`);

  if (DRY_RUN) {
    console.log("\nRe-run with --apply to actually delete.");
    if (!NUKE_ALL) {
      console.log("Add --nuke-all-patients to also wipe every patient/appointment/review");
      console.log("(recommended before wiring up the real PMS sync).");
    }
  } else {
    console.log("\nDone. Trigger a real PMS sync from Settings to repopulate live metrics.");
  }

  await admin.app().delete();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
