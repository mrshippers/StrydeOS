/**
 * Verify that the clinikoPoll Cloud Function is running correctly:
 *   1. Triggers one manual poll via Pub/Sub
 *   2. Waits up to 30s for sync_state.lastPollAt to advance
 *   3. Reports how many appointments were upserted
 *
 * Usage:
 *   CLINIC_ID=clinic-spires npx tsx scripts/verify-cliniko-poll.ts
 *
 * Prerequisites: gcloud + firebase-admin (ADC)
 */

import admin from "firebase-admin";
import { spawnSync } from "node:child_process";

const CLINIC_ID  = process.env.CLINIC_ID ?? "clinic-spires";
const PROJECT_ID = "clinical-tracker-spires";

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const db = admin.firestore();

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function triggerPoll() {
  console.log("Triggering manual poll via Pub/Sub...");
  const payload = JSON.stringify({ clinicId: CLINIC_ID });
  const result = spawnSync("gcloud", [
    "pubsub", "topics", "publish", "cliniko-poll",
    `--project=${PROJECT_ID}`,
    `--message=${payload}`,
  ], { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(`gcloud publish failed:\n${result.stderr}`);
  }
  console.log("✓ Message published");
}

async function waitForPollAdvance(previousLastPollAt: string, timeoutMs = 30_000) {
  const syncRef = db
    .collection("clinics").doc(CLINIC_ID)
    .collection("sync_state").doc("cliniko");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await syncRef.get();
    const current = snap.data()?.lastPollAt as string | undefined;
    if (current && current > previousLastPollAt) return current;
    await sleep(2_000);
  }
  throw new Error(
    `lastPollAt did not advance within ${timeoutMs / 1000}s — function may not be deployed or is failing`
  );
}

async function countAppointments() {
  const snap = await db
    .collection("clinics").doc(CLINIC_ID)
    .collection("appointments")
    .where("pmsType", "==", "cliniko")
    .count()
    .get();
  return snap.data().count;
}

async function main() {
  const syncRef = db
    .collection("clinics").doc(CLINIC_ID)
    .collection("sync_state").doc("cliniko");
  const before = (await syncRef.get()).data();
  const previousPollAt = before?.lastPollAt ?? new Date(0).toISOString();
  const beforeCount = await countAppointments();

  console.log(`Before: lastPollAt=${previousPollAt}, appointments in Firestore=${beforeCount}`);

  triggerPoll();

  console.log("Waiting for Cloud Function to complete (up to 30s)...");
  const newPollAt = await waitForPollAdvance(previousPollAt);
  const afterCount = await countAppointments();

  console.log(`\n✓ Poll succeeded`);
  console.log(`  lastPollAt: ${previousPollAt} → ${newPollAt}`);
  console.log(`  Appointments in Firestore: ${beforeCount} → ${afterCount} (+${afterCount - beforeCount})`);
  console.log("\n✓ Verification complete — polling loop is live");
}

main().catch(e => { console.error(e); process.exit(1); });
