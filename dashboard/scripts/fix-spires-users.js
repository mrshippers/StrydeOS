/**
 * One-time fix: patch Spires user statuses and clean orphaned records.
 *
 * Run:
 *   node scripts/fix-spires-users.js
 */

const admin = require("firebase-admin");
const path = require("path");

const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, "serviceAccountKey.json");

const CLINIC_ID = "clinic-spires";

async function main() {
  try {
    const keyPath = path.resolve(SERVICE_ACCOUNT_PATH);
    const key = require(keyPath);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(key) });
    }
  } catch (e) {
    console.error("Failed to load service account key");
    process.exit(1);
  }

  const db = admin.firestore();
  const now = new Date().toISOString();

  const usersSnap = await db
    .collection("users")
    .where("clinicId", "==", CLINIC_ID)
    .get();

  console.log(`Found ${usersSnap.size} users for ${CLINIC_ID}:\n`);

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const email = data.email || "no-email";
    const uid = userDoc.id;

    // Fix clinicians stuck in "onboarding" status
    if (data.status === "onboarding" || data.status === "invited") {
      await userDoc.ref.update({ status: "registered", updatedAt: now });
      console.log(`  ✓ ${email} (${uid}): status → "registered"`);
    }

    // Clean orphaned records (no role, no status, no email)
    if (!data.role && !data.status && !data.email) {
      console.log(`  ⚠ ${uid}: orphaned record (no role/status/email)`);
      console.log(`    Data: ${JSON.stringify(data)}`);
      // Don't auto-delete — flag for manual review
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
