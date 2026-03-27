/**
 * One-time migration: stamp custom claims (clinicId, role, clinicianId)
 * on every existing Firebase Auth user from their Firestore /users/{uid} doc.
 *
 * After this runs, verifyApiRequest reads from the JWT — zero Firestore reads
 * per API call. Existing sessions pick up the new claims on their next token
 * refresh (~1 hour) or on next sign-in.
 *
 * Safe to re-run — overwrites claims with current Firestore values.
 *
 * Usage (from dashboard directory):
 *   npx tsx scripts/migrate-custom-claims.ts
 *
 * Credentials: same as other scripts (env vars, serviceAccountKey.json, or ADC).
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

function loadEnvLocal(): void {
  try {
    require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });
  } catch {
    // dotenv not available — env vars must be set externally
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
    return;
  } catch {
    // fall through
  }

  console.error("No Firebase Admin credentials found.");
  process.exit(1);
}

async function main() {
  initFirebaseAdmin();

  const auth = admin.auth();
  const db = admin.firestore();

  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} user doc(s) in Firestore.\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of usersSnap.docs) {
    const uid = doc.id;
    const data = doc.data();
    const role = data.role as string | undefined;
    const clinicId = data.clinicId as string | undefined;
    const clinicianId = data.clinicianId as string | undefined;

    if (!role) {
      console.log(`  SKIP ${uid} — no role in Firestore doc`);
      skipped++;
      continue;
    }

    if (role !== "superadmin" && !clinicId) {
      console.log(`  SKIP ${uid} — non-superadmin with no clinicId`);
      skipped++;
      continue;
    }

    const claims: Record<string, string> = { role };
    if (clinicId) claims.clinicId = clinicId;
    if (clinicianId) claims.clinicianId = clinicianId;

    try {
      await auth.setCustomUserClaims(uid, claims);
      console.log(`  OK   ${uid} — ${data.email ?? "no email"} → ${JSON.stringify(claims)}`);
      migrated++;
    } catch (err) {
      console.error(`  FAIL ${uid} — ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(
    "Users will pick up new claims on their next token refresh (~1 hour) or next sign-in."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
