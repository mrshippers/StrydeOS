/**
 * One-shot script to write Cliniko sandbox PMS config to Firestore
 * and create the Cloud Scheduler job for the cliniko-poll topic.
 *
 * Usage:
 *   CLINIKO_SANDBOX_KEY=<key> CLINIKO_SHARD=uk1 CLINIC_ID=clinic-spires \
 *     npx tsx scripts/setup-cliniko-sandbox.ts
 *
 * Prerequisites:
 *   - gcloud authenticated (jamal@driiva.co.uk)
 *   - firebase-admin reachable (uses ADC / GOOGLE_APPLICATION_CREDENTIALS)
 */

import admin from "firebase-admin";

const CLINIKO_KEY   = process.env.CLINIKO_SANDBOX_KEY;
const SHARD         = process.env.CLINIKO_SHARD ?? "uk1";
const CLINIC_ID     = process.env.CLINIC_ID ?? "clinic-spires";
const PROJECT_ID    = "clinical-tracker-spires";
const REGION        = "europe-west2";

if (!CLINIKO_KEY) {
  console.error("CLINIKO_SANDBOX_KEY env var is required");
  process.exit(1);
}

const BASE_URL = `https://api.${SHARD}.cliniko.com/v1`;

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const db = admin.firestore();

async function main() {
  // 1. Write PMS config
  const pmsRef = db
    .collection("clinics").doc(CLINIC_ID)
    .collection("integrations_config").doc("pms");

  await pmsRef.set(
    {
      pmsType: "cliniko",
      apiKey:  CLINIKO_KEY,
      baseUrl: BASE_URL,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log(`✓ PMS config written to clinics/${CLINIC_ID}/integrations_config/pms`);

  // 2. Initialise sync state (last 24h so the first poll only fetches recent data)
  const syncRef = db
    .collection("clinics").doc(CLINIC_ID)
    .collection("sync_state").doc("cliniko");

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await syncRef.set(
    { lastPollAt: sinceIso, retryAfterUntil: null },
    { merge: true }
  );
  console.log(`✓ Sync state initialised (lastPollAt = ${sinceIso})`);

  // 3. Print the gcloud command to create the Cloud Scheduler job
  //    (run this separately — needs Cloud Scheduler API and correct IAM)
  const message = Buffer.from(JSON.stringify({ clinicId: CLINIC_ID })).toString("base64");
  console.log("\nRun this to create the Cloud Scheduler job:");
  console.log(`
gcloud scheduler jobs create pubsub cliniko-poll-${CLINIC_ID} \\
  --project=${PROJECT_ID} \\
  --location=${REGION} \\
  --schedule="* * * * *" \\
  --topic=projects/${PROJECT_ID}/topics/cliniko-poll \\
  --message-body='{"clinicId":"${CLINIC_ID}"}' \\
  --description="Cliniko poll every 60s for ${CLINIC_ID}" \\
  --time-zone="Europe/London"
`);
}

main().catch(e => { console.error(e); process.exit(1); });
