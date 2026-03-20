/**
 * One-time setup: create your super admin account and make it loggable.
 *
 * Run from dashboard directory:
 *   npm run setup:superadmin
 *
 * Or with custom email:
 *   npx tsx scripts/setup-superadmin.ts jamal@spiresphysiotherapy.com
 *
 * Credentials (pick one):
 *   A) gcloud login (no key file, no org policy): see README-NO-KEY.md
 *   B) .env.local FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *   C) scripts/serviceAccountKey.json
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

const EMAIL = process.argv[2]?.trim() || "jamal@spiresphysiotherapy.com";
const PASSWORD = "spires2015";

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
    return;
  }

  const keyPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), "scripts", "serviceAccountKey.json");
  if (fs.existsSync(keyPath)) {
    const key = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(key) });
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
    console.log("Using Application Default Credentials (gcloud login). No key file needed.\n");
    return;
  } catch {
    // fall through to error
  }

  console.error("\nNo Firebase Admin credentials found. Use ONE of these (no key download if you use option 1):\n");
  console.error("1. gcloud login (bypasses 'key creation not allowed' org policy):");
  console.error("   gcloud auth application-default login");
  console.error("   Then run: npm run setup:superadmin\n");
  console.error("2. Add to .env.local: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY");
  console.error("3. Or place service account JSON at scripts/serviceAccountKey.json\n");
  process.exit(1);
}

async function main() {
  initFirebaseAdmin();

  const auth = admin.auth();
  const db = admin.firestore();

  let uid: string;
  try {
    const userRecord = await auth.getUserByEmail(EMAIL);
    uid = userRecord.uid;
    console.log("User exists:", EMAIL, "uid:", uid);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "auth/user-not-found") {
      const newUser = await auth.createUser({
        email: EMAIL,
        password: PASSWORD,
        emailVerified: true,
      });
      uid = newUser.uid;
      console.log("Created user:", EMAIL);
    } else {
      throw e;
    }
  }

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();

  if (userSnap.exists) {
    await userRef.update({ role: "superadmin" });
    console.log("Updated users/" + uid + " → role: superadmin");
  } else {
    await userRef.set({ clinicId: "clinic-spires", role: "superadmin" });
    console.log("Created users/" + uid + " with role: superadmin");
  }

  // Stamp custom claims so verifyApiRequest reads from the JWT
  await auth.setCustomUserClaims(uid, { clinicId: "clinic-spires", role: "superadmin" });
  console.log("Set custom claims for uid:", uid);

  console.log("\n✅ Done. Sign in with:");
  console.log("   Email:", EMAIL);
  console.log("   Password:", PASSWORD);
  console.log("\nYou'll land on /admin (Stryde Super User) and see all clinics.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
