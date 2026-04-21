/**
 * Fix Joe Korge's user document and the Spires Physiotherapy London clinic document.
 *
 * Usage (from dashboard directory):
 *
 *   # Option A — provide UID directly (recommended if ADC lacks Firebase Auth permissions):
 *   JOE_UID=<uid-from-firebase-console> npx tsx scripts/fix-joe-user.ts
 *
 *   # Option B — let the script look up the UID by email (requires Firebase Auth admin):
 *   npx tsx scripts/fix-joe-user.ts
 *
 * The UID can be found in Firebase Console → Authentication → Users.
 *
 * Credentials (same chain as setup-superadmin.ts):
 *   A) .env.local FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *   B) scripts/serviceAccountKey.json
 *   C) gcloud auth application-default login
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

const JOE_EMAIL = process.env.JOE_EMAIL ?? "joe@spiresphysiotherapy.com";
const JOE_UID_OVERRIDE = process.env.JOE_UID ?? process.argv[2] ?? "";
const CLINIC_ID = "clinic-spires";
const CLINIC_NAME = "Spires Physiotherapy London";

function loadEnvLocal(): void {
  try {
    require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });
  } catch {
    // dotenv not available
  }
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
    console.log("Initialised with env-var service account.");
    return;
  }

  const keyPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), "scripts", "serviceAccountKey.json");

  if (fs.existsSync(keyPath)) {
    const key = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(key) });
    console.log("Initialised with service account key file.");
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
    console.log("Initialised with Application Default Credentials (gcloud).");
    return;
  } catch {
    // fall through
  }

  console.error(
    "\nNo Firebase Admin credentials found. Options:\n" +
    "  1. Add FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY to .env.local\n" +
    "  2. Place service account JSON at scripts/serviceAccountKey.json\n" +
    "  3. gcloud auth application-default login\n"
  );
  process.exit(1);
}

async function main() {
  initFirebaseAdmin();

  const db = admin.firestore();
  const now = new Date().toISOString();

  // ─── 1. Resolve Joe's UID ─────────────────────────────────────────────────
  let uid: string = JOE_UID_OVERRIDE;

  if (!uid) {
    // Try to look up by email via Firebase Auth
    try {
      const auth = admin.auth();
      const record = await auth.getUserByEmail(JOE_EMAIL);
      uid = record.uid;
      console.log(`Found user: ${JOE_EMAIL}  uid: ${uid}`);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "auth/user-not-found") {
        console.error(
          `No Firebase Auth user found for ${JOE_EMAIL}.\n` +
          `Create the account first in Firebase Console or run:\n` +
          `  JOE_UID=<uid> npx tsx scripts/fix-joe-user.ts`
        );
        process.exit(1);
      }
      // Auth API permission denied — ask for UID
      console.error(
        "\nCould not look up user by email (likely ADC permissions).\n" +
        `Find Joe's UID in Firebase Console → Authentication → Users, then run:\n` +
        `  JOE_UID=<paste-uid-here> npx tsx scripts/fix-joe-user.ts\n`
      );
      process.exit(1);
    }
  } else {
    console.log(`Using provided UID: ${uid}`);
  }

  // ─── 2. Upsert users/{uid} ────────────────────────────────────────────────
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();

  const userPayload: Record<string, unknown> = {
    clinicId: CLINIC_ID,
    role: "owner",
    firstName: "Joe",
    lastName: "Korge",
    email: JOE_EMAIL,
    firstLogin: false,       // false = hasn't completed first-login tour yet → tour will show
    tourCompleted: false,
    status: "registered",
    updatedAt: now,
    updatedBy: "fix-joe-user-script",
  };

  if (userSnap.exists) {
    await userRef.update(userPayload);
    console.log(`✓ Updated users/${uid}`);
  } else {
    await userRef.set({ ...userPayload, createdAt: now, createdBy: "fix-joe-user-script" });
    console.log(`✓ Created users/${uid}`);
  }

  // ─── 3. Upsert clinics/clinic-spires-physiotherapy-london ─────────────────
  const clinicRef = db.collection("clinics").doc(CLINIC_ID);
  const clinicSnap = await clinicRef.get();

  if (clinicSnap.exists) {
    await clinicRef.update({
      name: CLINIC_NAME,
      status: "onboarding",
      ownerEmail: JOE_EMAIL,
      updatedAt: now,
    });
    console.log(`✓ Updated clinics/${CLINIC_ID} → name: "${CLINIC_NAME}", status: "onboarding"`);
  } else {
    await clinicRef.set({
      name: CLINIC_NAME,
      timezone: "Europe/London",
      ownerEmail: JOE_EMAIL,
      status: "onboarding",
      pmsType: null,
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
    console.log(`✓ Created clinics/${CLINIC_ID}`);
  }

  // ─── 4. Fix clinician names in subcollection ──────────────────────────────
  const cliniciansSnap = await clinicRef.collection("clinicians").get();
  if (!cliniciansSnap.empty) {
    for (const doc of cliniciansSnap.docs) {
      const data = doc.data();
      if (data.name === "Jamal" && !data.name.includes("Adu")) {
        await doc.ref.update({ name: "Jamal Adu", updatedAt: now });
        console.log(`✓ Updated clinician ${doc.id}: "Jamal" → "Jamal Adu"`);
      }
    }
  }

  console.log(
    "\n✅ Done.\n" +
    `   Joe Korge → role: owner, firstLogin: false (tour shows on next login)\n` +
    `   Clinic: "${CLINIC_NAME}" → status: onboarding\n` +
    `   Open http://localhost:3002 and sign in with ${JOE_EMAIL}\n`
  );
}

main().catch((err) => {
  console.error("\nFix script failed:", err?.message ?? err);
  process.exit(1);
});
