/**
 * Seed a new clinic and link it to a Firebase Auth user (create user if needed).
 *
 * Prerequisites:
 * 1. Firebase Console: Project Settings > Service accounts > Generate new private key.
 * 2. Save the JSON as scripts/serviceAccountKey.json (do NOT commit).
 *
 * Usage (from dashboard directory):
 *   npx tsx scripts/seed-clinic.ts <email> "<clinic name>"
 *   # or with explicit key path:
 *   GOOGLE_APPLICATION_CREDENTIALS=./scripts/serviceAccountKey.json npx tsx scripts/seed-clinic.ts owner@example.com "Example Physio"
 *
 * If the email already exists in Firebase Auth, only Firestore users/{uid} and clinics/{clinicId} are created/updated.
 * If the email does not exist, a user is created with a temporary password (printed at the end).
 */

import * as admin from "firebase-admin";
import * as path from "path";

const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, "serviceAccountKey.json");

function slugify(name: string): string {
  return "clinic-" + name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function parseArgs(): { email: string; clinicName: string } {
  const email = process.argv[2];
  const clinicName = process.argv[3];
  if (!email || !clinicName) {
    console.error("Usage: npx tsx scripts/seed-clinic.ts <email> \"<clinic name>\"");
    process.exit(1);
  }
  return { email: email.trim(), clinicName: clinicName.trim() };
}

async function main() {
  const { email, clinicName } = parseArgs();
  const clinicId = slugify(clinicName);

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
    console.error(
      "Download from: Firebase Console > Project Settings > Service accounts > Generate new private key"
    );
    process.exit(1);
  }

  const auth = admin.auth();
  const db = admin.firestore();

  let uid: string;
  let temporaryPassword: string | undefined;
  try {
    const userRecord = await auth.getUserByEmail(email);
    uid = userRecord.uid;
    console.log("User already exists:", email, "uid:", uid);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "auth/user-not-found") {
      temporaryPassword = Math.random().toString(36).slice(2, 14) + "A1!";
      const newUser = await auth.createUser({
        email,
        password: temporaryPassword,
        emailVerified: false,
      });
      uid = newUser.uid;
      console.log("Created user:", email, "uid:", uid);
    } else {
      throw e;
    }
  }

  const now = new Date().toISOString();
  const clinicRef = db.collection("clinics").doc(clinicId);
  const clinicSnap = await clinicRef.get();
  if (!clinicSnap.exists) {
    await clinicRef.set({
      name: clinicName,
      timezone: "Europe/London",
      ownerEmail: email,
      status: "onboarding",
      pmsType: null,
      featureFlags: { intelligence: true, continuity: true, receptionist: false },
      trialStartedAt: now,
      targets: {
        followUpRate: 2.9,
        hepRate: 95,
        utilisationRate: 85,
        dnaRate: 5,
        courseCompletionTarget: 80,
      },
      brandConfig: {},
      onboarding: { pmsConnected: false, cliniciansConfirmed: false, targetsSet: false },
      createdAt: now,
      updatedAt: now,
    });
    console.log("Created clinic:", clinicId, "(", clinicName, ")");

    const clinicians = [
      { name: "Jamal", role: "Owner / Lead Physio", pmsExternalId: "jamal-1" },
      { name: "Andrew", role: "Physiotherapist", pmsExternalId: "andrew-1" },
      { name: "Max", role: "Physiotherapist", pmsExternalId: "max-1" },
    ];
    const clinicianIds: string[] = [];
    for (const c of clinicians) {
      const ref = await clinicRef.collection("clinicians").add({
        name: c.name,
        role: c.role,
        pmsExternalId: c.pmsExternalId,
        active: true,
        createdAt: now,
      });
      clinicianIds.push(ref.id);
    }
    console.log("Created clinicians subcollection: Jamal, Andrew, Max");
  } else {
    await clinicRef.update({
      name: clinicName,
      ownerEmail: email,
      updatedAt: now,
    });
    console.log("Clinic already exists, updated name/owner:", clinicId);
  }

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    await userRef.set({
      clinicId,
      role: "owner",
    });
    console.log("Created user document for uid:", uid);
  } else {
    await userRef.update({ clinicId, role: "owner" });
    console.log("Updated user document for uid:", uid);
  }

  console.log("\nDone. Sign in with:");
  console.log("  Email:", email);
  if (temporaryPassword) {
    console.log("  Temporary password:", temporaryPassword, "(change after first login)");
  } else {
    console.log("  Password: (use existing password)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
