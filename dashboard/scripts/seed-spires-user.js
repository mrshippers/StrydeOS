/**
 * One-time script to create the Spires test account and clinic in Firebase.
 *
 * Prerequisites:
 * 1. In Firebase Console: Project Settings > Service accounts > Generate new private key.
 * 2. Save the JSON file (e.g. as scripts/serviceAccountKey.json) and do NOT commit it.
 *
 * Run from project root:
 *   node scripts/seed-spires-user.js
 *   # or with explicit key path:
 *   GOOGLE_APPLICATION_CREDENTIALS=./scripts/serviceAccountKey.json node scripts/seed-spires-user.js
 */

const admin = require("firebase-admin");
const path = require("path");

const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, "serviceAccountKey.json");

const TEST_EMAIL = "jamal@spiresphysiotherapy.com";
const TEST_PASSWORD = "spires2015";
const CLINIC_ID = "clinic-spires";

async function main() {
  try {
    const keyPath = path.resolve(SERVICE_ACCOUNT_PATH);
    const key = require(keyPath);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(key) });
    }
  } catch (e) {
    console.error(
      "Failed to load service account. Place your Firebase service account JSON at:",
      path.resolve(SERVICE_ACCOUNT_PATH)
    );
    console.error("Download from: Firebase Console > Project Settings > Service accounts > Generate new private key");
    process.exit(1);
  }

  const auth = admin.auth();
  const db = admin.firestore();

  let uid;
  try {
    const userRecord = await auth.getUserByEmail(TEST_EMAIL);
    uid = userRecord.uid;
    console.log("User already exists:", TEST_EMAIL, "uid:", uid);
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      const newUser = await auth.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        emailVerified: true,
      });
      uid = newUser.uid;
      console.log("Created user:", TEST_EMAIL, "uid:", uid);
    } else {
      throw e;
    }
  }

  const now = new Date().toISOString();
  const clinicRef = db.collection("clinics").doc(CLINIC_ID);
  const clinicSnap = await clinicRef.get();
  if (!clinicSnap.exists) {
    await clinicRef.set({
      name: "Spires MSK Physiotherapy",
      timezone: "Europe/London",
      ownerEmail: TEST_EMAIL,
      status: "live",
      pms: { provider: null, connected: false },
      targets: { followUpRate: 2.9, physitrackRate: 95, utilisationRate: 85 },
      onboarding: { pmsConnected: false, cliniciansConfirmed: false, targetsSet: false },
      createdAt: now,
      updatedAt: now,
    });
    console.log("Created clinic:", CLINIC_ID);
  } else {
    console.log("Clinic already exists:", CLINIC_ID);
  }

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    await userRef.set({
      clinicId: CLINIC_ID,
      role: "owner",
    });
    console.log("Created user document for uid:", uid);
  } else {
    await userRef.update({ clinicId: CLINIC_ID, role: "owner" });
    console.log("Updated user document for uid:", uid);
  }

  console.log("\nDone. You can sign in with:");
  console.log("  Email:", TEST_EMAIL);
  console.log("  Password:", TEST_PASSWORD);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
