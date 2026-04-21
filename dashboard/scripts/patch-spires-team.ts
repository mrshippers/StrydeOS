/**
 * One-off patch for the Spires team records.
 *
 * Applies two cosmetic data fixes without re-running the full production seed
 * (which would reset all passwords and overwrite appointment/metric data):
 *   1. Jamal's clinician/user name → "Jamal Ofori-Adu"
 *   2. Joe's auth role → "owner", clinician display role → "Owner / MD"
 *
 * Idempotent — safe to re-run.
 *
 * Usage (from dashboard/):
 *   npm run ts-node scripts/patch-spires-team.ts
 *   # or: npx tsx scripts/patch-spires-team.ts
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

const CLINIC_ID = "clinic-spires";

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

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

async function main() {
  initFirebaseAdmin();
  const auth = admin.auth();
  const db = admin.firestore();
  const now = new Date().toISOString();

  console.log("Patching Spires team records…\n");

  // ── Jamal ────────────────────────────────────────────────────────────
  const jamalAuth = await auth.getUserByEmail("jamal@spiresphysiotherapy.com");
  await auth.updateUser(jamalAuth.uid, { displayName: "Jamal Ofori-Adu" });
  await db.collection("users").doc(jamalAuth.uid).update({
    firstName: "Jamal",
    lastName: "Ofori-Adu",
    role: "owner",
    updatedAt: now,
    updatedBy: "patch-spires-team",
  });
  await db.collection("clinics").doc(CLINIC_ID).collection("clinicians").doc("c-jamal").update({
    name: "Jamal Ofori-Adu",
    role: "Owner / Lead Physio",
    updatedAt: now,
  });
  console.log("  Jamal → name: Jamal Ofori-Adu, role: owner");

  // ── Joe ──────────────────────────────────────────────────────────────
  const joeAuth = await auth.getUserByEmail("joe@spiresphysiotherapy.com");
  await db.collection("users").doc(joeAuth.uid).update({
    role: "owner",
    updatedAt: now,
    updatedBy: "patch-spires-team",
  });
  await db.collection("clinics").doc(CLINIC_ID).collection("clinicians").doc("c-joe").update({
    role: "Owner / MD",
    updatedAt: now,
  });
  console.log("  Joe   → role: owner, display: Owner / MD");

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Patch failed:", err);
  process.exit(1);
});
