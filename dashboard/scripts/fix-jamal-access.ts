/**
 * Diagnose + fix Jamal's account access.
 *
 * 1. Looks up Jamal's UID from Firebase Auth
 * 2. Reads users/{uid} doc — checks role, clinicId, status
 * 3. Reads clinics/{clinicId} doc — checks featureFlags, trial, billing
 * 4. Reports mismatches
 * 5. Fixes: role → "owner", all featureFlags → true
 *
 * Usage (from dashboard directory):
 *   npx tsx scripts/fix-jamal-access.ts
 *   npx tsx scripts/fix-jamal-access.ts some-other@email.com
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

const TARGET_EMAIL = process.argv[2]?.trim() || "jamal@spiresphysiotherapy.com";

function initFirebaseAdmin(): void {
  if (admin.apps.length) return;

  // Try .env.local
  try {
    require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });
  } catch { /* dotenv not available */ }

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
    console.log("✓ Initialised with env-var service account.");
    return;
  }

  const keyPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), "scripts", "serviceAccountKey.json");

  if (fs.existsSync(keyPath)) {
    const key = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(key) });
    console.log("✓ Initialised with service account key file.");
    return;
  }

  console.error("No Firebase Admin credentials found.");
  process.exit(1);
}

async function main() {
  initFirebaseAdmin();

  const auth = admin.auth();
  const db = admin.firestore();
  const now = new Date().toISOString();

  // ─── 1. Look up UID ──────────────────────────────────────────────────────
  let uid: string;
  try {
    const record = await auth.getUserByEmail(TARGET_EMAIL);
    uid = record.uid;
    console.log(`\n🔍 Firebase Auth user found`);
    console.log(`   email:    ${record.email}`);
    console.log(`   uid:      ${uid}`);
    console.log(`   disabled: ${record.disabled}`);
    console.log(`   created:  ${record.metadata.creationTime}`);
    console.log(`   lastSign: ${record.metadata.lastSignInTime}`);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "auth/user-not-found") {
      console.error(`\n✗ No Firebase Auth user for ${TARGET_EMAIL}`);
      console.error("  → Account doesn't exist. Create it first.");
      process.exit(1);
    }
    throw e;
  }

  // ─── 2. Read users/{uid} ─────────────────────────────────────────────────
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    console.log(`\n✗ users/${uid} DOES NOT EXIST`);
    console.log("  → This is likely the problem. No Firestore profile = no role = locked out.");
    console.log("  → Will create it now.\n");

    // Need to find the right clinicId — check if clinic-spires exists
    const spiresSnap = await db.collection("clinics").doc("clinic-spires").get();
    const clinicId = spiresSnap.exists ? "clinic-spires" : "";

    await userRef.set({
      clinicId,
      role: "owner",
      email: TARGET_EMAIL,
      firstName: "Jamal",
      lastName: "Adu",
      firstLogin: false,
      tourCompleted: true,
      status: "registered",
      createdAt: now,
      updatedAt: now,
      updatedBy: "fix-jamal-access-script",
    });
    console.log(`✓ Created users/${uid} → role: owner, clinicId: "${clinicId}"`);

    if (clinicId) {
      await fixClinicFlags(db, clinicId, now);
    }
    return;
  }

  const userData = userSnap.data()!;
  console.log(`\n📋 users/${uid} document:`);
  console.log(`   role:       ${userData.role ?? "MISSING (defaults to clinician)"}`);
  console.log(`   clinicId:   ${userData.clinicId ?? "MISSING"}`);
  console.log(`   status:     ${userData.status ?? "MISSING"}`);
  console.log(`   firstLogin: ${userData.firstLogin}`);
  console.log(`   email:      ${userData.email ?? "MISSING"}`);

  // ─── 3. Diagnose issues ──────────────────────────────────────────────────
  const issues: string[] = [];

  if (userData.role !== "owner" && userData.role !== "superadmin") {
    issues.push(`role is "${userData.role ?? "undefined"}" — should be "owner"`);
  }
  if (!userData.clinicId) {
    issues.push("clinicId is missing — user has no clinic assigned");
  }

  // ─── 4. Read clinic doc ──────────────────────────────────────────────────
  const clinicId = userData.clinicId;
  if (clinicId) {
    const clinicSnap = await db.collection("clinics").doc(clinicId).get();
    if (!clinicSnap.exists) {
      console.log(`\n✗ clinics/${clinicId} DOES NOT EXIST`);
      issues.push(`clinicId "${clinicId}" points to nonexistent clinic`);

      // Check if clinic-spires exists as alternative
      const spiresSnap = await db.collection("clinics").doc("clinic-spires").get();
      if (spiresSnap.exists) {
        issues.push(`but "clinic-spires" exists — likely a clinicId mismatch`);
        console.log(`   → "clinic-spires" exists. This is a mismatch.`);
      }
    } else {
      const clinicData = clinicSnap.data()!;
      console.log(`\n📋 clinics/${clinicId} document:`);
      console.log(`   name:           ${clinicData.name}`);
      console.log(`   status:         ${clinicData.status}`);
      console.log(`   ownerEmail:     ${clinicData.ownerEmail}`);
      console.log(`   featureFlags:   ${JSON.stringify(clinicData.featureFlags)}`);
      console.log(`   trialStartedAt: ${clinicData.trialStartedAt ?? "null"}`);
      console.log(`   billing:        ${JSON.stringify(clinicData.billing ?? {})}`);

      const flags = clinicData.featureFlags ?? {};
      if (!flags.receptionist) issues.push("featureFlags.receptionist is false — Ava locked");
      if (!flags.intelligence) issues.push("featureFlags.intelligence is false — Intelligence locked");
      if (!flags.continuity) issues.push("featureFlags.continuity is false — Pulse locked");

      // Check trial
      if (clinicData.trialStartedAt) {
        const trialEnd = new Date(clinicData.trialStartedAt);
        trialEnd.setDate(trialEnd.getDate() + 14);
        if (trialEnd < new Date()) {
          issues.push(`trial expired on ${trialEnd.toISOString()}`);
        }
      } else {
        issues.push("no trialStartedAt — trial never started");
      }
    }
  }

  // ─── 5. Report ──────────────────────────────────────────────────────────
  if (issues.length === 0) {
    console.log("\n✅ No issues found. User should have full access.");
    console.log("   If still locked out, try a hard refresh (Cmd+Shift+R).");
    return;
  }

  console.log(`\n⚠️  Found ${issues.length} issue(s):`);
  issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));

  // ─── 6. Fix ──────────────────────────────────────────────────────────────
  console.log("\n🔧 Fixing...\n");

  // Fix user role
  if (userData.role !== "owner" && userData.role !== "superadmin") {
    await userRef.update({ role: "owner", updatedAt: now, updatedBy: "fix-jamal-access-script" });
    console.log(`✓ users/${uid}.role → "owner" (was: "${userData.role}")`);
  }

  // Fix clinicId mismatch — point to clinic-spires if current clinicId doesn't exist
  if (clinicId) {
    const clinicSnap = await db.collection("clinics").doc(clinicId).get();
    if (!clinicSnap.exists) {
      const spiresSnap = await db.collection("clinics").doc("clinic-spires").get();
      if (spiresSnap.exists) {
        await userRef.update({ clinicId: "clinic-spires", updatedAt: now });
        console.log(`✓ users/${uid}.clinicId → "clinic-spires" (was: "${clinicId}")`);
        await fixClinicFlags(db, "clinic-spires", now);
      }
    } else {
      await fixClinicFlags(db, clinicId, now);
    }
  }

  console.log("\n✅ Done. Refresh the browser to pick up changes.");
}

async function fixClinicFlags(db: admin.firestore.Firestore, clinicId: string, now: string) {
  const clinicRef = db.collection("clinics").doc(clinicId);
  await clinicRef.update({
    "featureFlags.intelligence": true,
    "featureFlags.continuity": true,
    "featureFlags.receptionist": true,
    updatedAt: now,
  });
  console.log(`✓ clinics/${clinicId}.featureFlags → all true (intelligence, continuity, receptionist)`);
}

main().catch((err) => {
  console.error("\n✗ Script failed:", err?.message ?? err);
  process.exit(1);
});
