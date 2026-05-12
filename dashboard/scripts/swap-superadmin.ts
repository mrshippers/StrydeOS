/**
 * One-shot swap of the Stryde Super User account.
 *
 * Action:
 *   1. Ensure jamal@strydeos.com exists as a Firebase Auth user.
 *      - If missing, create it with a random temp password (printed once).
 *      - Forces a password reset on first login (firstLogin: true).
 *   2. Promote jamal@strydeos.com to role: "superadmin" (cross-tenant scope).
 *   3. Demote jamal@spiresphysiotherapy.com to role: "owner" of clinic-spires.
 *   4. Stamp custom claims for both.
 *
 * Auth (uses any of these, in order):
 *   - GOOGLE_APPLICATION_CREDENTIALS env var (service account JSON path)
 *   - dashboard/scripts/serviceAccountKey.json
 *   - gcloud Application Default Credentials (run `gcloud auth application-default login` first)
 *
 * Usage (from dashboard/ directory):
 *   npx tsx scripts/swap-superadmin.ts
 *
 * Override emails (optional):
 *   npx tsx scripts/swap-superadmin.ts --new=other@stryde.com --old=other@spires.com
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

const NEW_SUPERADMIN_EMAIL = getArg("--new", "jamal@strydeos.com");
const OLD_SUPERADMIN_EMAIL = getArg("--old", "jamal@spiresphysiotherapy.com");
const SPIRES_CLINIC_ID = "clinic-spires";

function getArg(name: string, fallback: string): string {
  const arg = process.argv.find((a) => a.startsWith(name + "="));
  return arg ? arg.slice(name.length + 1).trim() : fallback;
}

function initFirebaseAdmin(): void {
  if (admin.apps.length) return;

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "clinical-tracker-spires";

  // 1. Service account via env vars
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    console.log("Initialised with env-var service account.");
    return;
  }

  // 2. Service account JSON file
  const keyPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), "scripts", "serviceAccountKey.json");

  if (fs.existsSync(keyPath)) {
    try {
      const key = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
      admin.initializeApp({ credential: admin.credential.cert(key) });
      console.log("Initialised with service account key file.");
      return;
    } catch (e) {
      console.warn("Service account key file failed to load, falling back to ADC:", (e as Error).message);
    }
  }

  // 3. Application Default Credentials (gcloud auth application-default login)
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
  console.log("Initialised with Application Default Credentials.");
}

async function ensureAuthUser(
  auth: admin.auth.Auth,
  email: string
): Promise<{ uid: string; created: boolean; tempPassword?: string }> {
  try {
    const record = await auth.getUserByEmail(email);
    return { uid: record.uid, created: false };
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code !== "auth/user-not-found") throw e;
  }

  const tempPassword = crypto.randomBytes(18).toString("base64url");
  const created = await auth.createUser({
    email,
    password: tempPassword,
    emailVerified: false,
    disabled: false,
  });
  return { uid: created.uid, created: true, tempPassword };
}

async function main() {
  initFirebaseAdmin();
  const auth = admin.auth();
  const db = admin.firestore();
  const now = new Date().toISOString();

  console.log(`\nNew superadmin: ${NEW_SUPERADMIN_EMAIL}`);
  console.log(`Demote to owner of ${SPIRES_CLINIC_ID}: ${OLD_SUPERADMIN_EMAIL}\n`);

  // ─── 1. Ensure new superadmin auth user exists ───────────────────────────
  const newUser = await ensureAuthUser(auth, NEW_SUPERADMIN_EMAIL);
  if (newUser.created) {
    console.log(`Created auth user ${NEW_SUPERADMIN_EMAIL} (uid: ${newUser.uid})`);
    console.log(`Temporary password: ${newUser.tempPassword}`);
    console.log("Save this now. Will be reset on first login.\n");
  } else {
    console.log(`Found existing auth user ${NEW_SUPERADMIN_EMAIL} (uid: ${newUser.uid})\n`);
  }

  // ─── 2. Promote new superadmin (Firestore + custom claims) ───────────────
  const newRef = db.collection("users").doc(newUser.uid);
  const newSnap = await newRef.get();

  const newDocBase = {
    email: NEW_SUPERADMIN_EMAIL,
    role: "superadmin" as const,
    clinicId: "", // superadmin is cross-tenant
    firstName: "Jamal",
    lastName: "Adu",
    status: "registered" as const,
    updatedAt: now,
    updatedBy: "swap-superadmin-script",
  };

  if (newSnap.exists) {
    await newRef.update({ ...newDocBase });
    console.log(`Updated users/${newUser.uid} -> role: superadmin (was: ${newSnap.data()?.role ?? "none"})`);
  } else {
    await newRef.set({
      ...newDocBase,
      firstLogin: newUser.created, // force reset only if we just made the auth user
      tourCompleted: false,
      createdAt: now,
    });
    console.log(`Created users/${newUser.uid} with role: superadmin`);
  }

  await auth.setCustomUserClaims(newUser.uid, { role: "superadmin" });
  console.log(`Set custom claims for ${NEW_SUPERADMIN_EMAIL}: { role: "superadmin" }`);

  // ─── 3. Demote old superadmin to owner of clinic-spires ──────────────────
  let oldUid: string | null = null;
  try {
    const oldRecord = await auth.getUserByEmail(OLD_SUPERADMIN_EMAIL);
    oldUid = oldRecord.uid;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "auth/user-not-found") {
      console.warn(`\nNo auth user found for ${OLD_SUPERADMIN_EMAIL}. Skipping demote.`);
    } else {
      throw e;
    }
  }

  if (oldUid) {
    // Sanity check: clinic-spires exists
    const clinicSnap = await db.collection("clinics").doc(SPIRES_CLINIC_ID).get();
    if (!clinicSnap.exists) {
      console.warn(`\nWARNING: clinics/${SPIRES_CLINIC_ID} does not exist. Demote will still write the user doc but the clinic linkage will be broken.`);
    }

    const oldRef = db.collection("users").doc(oldUid);
    const oldSnap = await oldRef.get();
    const previousRole = oldSnap.data()?.role ?? "none";

    if (previousRole === "superadmin") {
      await oldRef.set(
        {
          email: OLD_SUPERADMIN_EMAIL,
          role: "owner",
          clinicId: SPIRES_CLINIC_ID,
          updatedAt: now,
          updatedBy: "swap-superadmin-script",
        },
        { merge: true }
      );
      console.log(`Updated users/${oldUid} -> role: owner, clinicId: ${SPIRES_CLINIC_ID} (was: ${previousRole})`);
    } else {
      console.log(`users/${oldUid} role is "${previousRole}" (not superadmin). Leaving as-is, only re-stamping clinicId.`);
      await oldRef.set(
        { clinicId: SPIRES_CLINIC_ID, updatedAt: now, updatedBy: "swap-superadmin-script" },
        { merge: true }
      );
    }

    await auth.setCustomUserClaims(oldUid, {
      role: "owner",
      clinicId: SPIRES_CLINIC_ID,
    });
    console.log(`Set custom claims for ${OLD_SUPERADMIN_EMAIL}: { role: "owner", clinicId: "${SPIRES_CLINIC_ID}" }`);
  }

  // ─── 4. Summary ──────────────────────────────────────────────────────────
  console.log("\nDone.");
  console.log(`  Stryde Super User -> ${NEW_SUPERADMIN_EMAIL}`);
  console.log(`  Spires owner     -> ${OLD_SUPERADMIN_EMAIL}`);
  if (newUser.created) {
    console.log(`\nFirst sign-in for ${NEW_SUPERADMIN_EMAIL}:`);
    console.log(`  1. Go to portal.strydeos.com`);
    console.log(`  2. Sign in with the temporary password printed above.`);
    console.log(`  3. Reset the password on the firstLogin screen.`);
  }
  console.log(`\nIf either account is currently signed in, the role change will only apply after their next session refresh (sign out / 8h cookie expiry).`);
}

main().catch((err) => {
  console.error("\nScript failed:", err?.message ?? err);
  process.exit(1);
});
