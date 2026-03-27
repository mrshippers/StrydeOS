/**
 * Promote an existing Firebase Auth user to super admin.
 * Only super admins can access /admin and see all clinics.
 *
 * Prerequisites: Same as seed-clinic — service account JSON at
 *   GOOGLE_APPLICATION_CREDENTIALS or scripts/serviceAccountKey.json
 *
 * Usage (from dashboard directory):
 *   npx tsx scripts/promote-superadmin.ts <email>
 *
 * Example:
 *   npx tsx scripts/promote-superadmin.ts jamal@spiresphysiotherapy.com
 */

import * as admin from "firebase-admin";
import * as path from "path";

const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, "serviceAccountKey.json");

async function main() {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error("Usage: npx tsx scripts/promote-superadmin.ts <email>");
    process.exit(1);
  }

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
  try {
    const userRecord = await auth.getUserByEmail(email);
    uid = userRecord.uid;
    console.log("Found user:", email, "uid:", uid);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "auth/user-not-found") {
      console.error("No Firebase Auth user with email:", email);
      console.error("Create the account first (e.g. via seed-clinic or Firebase Console).");
      process.exit(1);
    }
    throw e;
  }

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();

  if (userSnap.exists) {
    const existing = userSnap.data();
    await userRef.update({ role: "superadmin" });
    console.log("Updated users/" + uid + " to role: superadmin (was: " + (existing?.role ?? "none") + ")");
  } else {
    await userRef.set({ clinicId: "", role: "superadmin" });
    console.log("Created users/" + uid + " with role: superadmin");
  }

  // Stamp custom claims — superadmin may or may not have a clinicId
  const finalData = (await userRef.get()).data();
  const claims: Record<string, string> = { role: "superadmin" };
  if (finalData?.clinicId) claims.clinicId = finalData.clinicId;
  await auth.setCustomUserClaims(uid, claims);
  console.log("Set custom claims for uid:", uid);

  console.log("\nDone. Next time you sign in as", email, "you will:");
  console.log("  - Be redirected to /admin (Stryde Super User view)");
  console.log("  - See the 'Stryde Super User' link in the sidebar");
  console.log("  - Have full scope over all clinics in the product.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
