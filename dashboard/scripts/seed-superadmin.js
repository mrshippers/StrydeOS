/**
 * Create the StrydeOS superadmin account in Firebase Auth + Firestore.
 *
 * This account is separate from any clinic — it's the platform-level admin
 * with access to /admin, clinic impersonation, and system-wide operations.
 *
 * Also patches Spires clinic to:
 *   - status: "live" (not "onboarding")
 *   - billing.tier: "studio" (4 seats)
 *   - Ensures Jamal + Joe user docs have correct roles
 *
 * Prerequisites:
 *   Place your Firebase service account JSON at scripts/serviceAccountKey.json
 *   (never commit this file)
 *
 * Run:
 *   node scripts/seed-superadmin.js
 */

const admin = require("firebase-admin");
const path = require("path");

const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, "serviceAccountKey.json");

// ─── Superadmin config ───────────────────────────────────────────────────────
const SUPERADMIN_EMAIL = "admin@strydeos.com";
const SUPERADMIN_PASSWORD = "strydeos1";

// ─── Spires clinic config ────────────────────────────────────────────────────
const SPIRES_CLINIC_ID = "clinic-spires";
const STUDIO_SEATS = 4;

async function main() {
  // Init Firebase Admin
  try {
    const keyPath = path.resolve(SERVICE_ACCOUNT_PATH);
    const key = require(keyPath);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(key) });
    }
  } catch (e) {
    console.error(
      "Failed to load service account key from:",
      path.resolve(SERVICE_ACCOUNT_PATH)
    );
    console.error(
      "Download from: Firebase Console → Project Settings → Service accounts → Generate new private key"
    );
    process.exit(1);
  }

  const auth = admin.auth();
  const db = admin.firestore();
  const now = new Date().toISOString();

  // ── 1. Create or update superadmin Firebase Auth user ──────────────────
  let superadminUid;
  try {
    const existing = await auth.getUserByEmail(SUPERADMIN_EMAIL);
    superadminUid = existing.uid;
    console.log(`Superadmin auth user exists: ${SUPERADMIN_EMAIL} (uid: ${superadminUid})`);
    // Update password in case it changed
    await auth.updateUser(superadminUid, {
      password: SUPERADMIN_PASSWORD,
      emailVerified: true,
    });
    console.log("  Updated password");
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      const newUser = await auth.createUser({
        email: SUPERADMIN_EMAIL,
        password: SUPERADMIN_PASSWORD,
        emailVerified: true,
        displayName: "StrydeOS Admin",
      });
      superadminUid = newUser.uid;
      console.log(`Created superadmin auth user: ${SUPERADMIN_EMAIL} (uid: ${superadminUid})`);
    } else {
      throw e;
    }
  }

  // ── 2. Create or update superadmin Firestore user doc ──────────────────
  const superadminRef = db.collection("users").doc(superadminUid);
  await superadminRef.set(
    {
      email: SUPERADMIN_EMAIL,
      role: "superadmin",
      firstName: "StrydeOS",
      lastName: "Admin",
      status: "registered",
      firstLogin: false,
      tourCompleted: true,
      // Superadmin has no clinicId — they access all clinics via /admin
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  console.log(`  Set users/${superadminUid} → role: superadmin`);

  // Set custom claims
  await auth.setCustomUserClaims(superadminUid, {
    role: "superadmin",
  });
  console.log("  Set custom claims: { role: superadmin }");

  // ── 3. Patch Spires clinic: status → live, billing → studio ────────────
  const spiresRef = db.collection("clinics").doc(SPIRES_CLINIC_ID);
  const spiresSnap = await spiresRef.get();

  if (spiresSnap.exists) {
    await spiresRef.update({
      status: "live",
      "billing.tier": "studio",
      "billing.extraSeats": STUDIO_SEATS,
      updatedAt: now,
    });
    console.log(`\nPatched clinic ${SPIRES_CLINIC_ID}:`);
    console.log(`  status: "live"`);
    console.log(`  billing.tier: "studio" (${STUDIO_SEATS} seats)`);
  } else {
    console.warn(`\n⚠ Clinic ${SPIRES_CLINIC_ID} not found — skipping patch`);
  }

  // ── 4. Verify Spires users (Jamal + Joe) have correct roles ────────────
  const usersSnap = await db
    .collection("users")
    .where("clinicId", "==", SPIRES_CLINIC_ID)
    .get();

  console.log(`\nSpires clinic users (${usersSnap.size} found):`);
  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    console.log(`  ${data.email || data.firstName || userDoc.id} → role: ${data.role}, status: ${data.status}`);
  }

  // ── Done ───────────────────────────────────────────────────────────────
  console.log("\n✓ Superadmin account ready:");
  console.log(`  Email:    ${SUPERADMIN_EMAIL}`);
  console.log(`  Password: ${SUPERADMIN_PASSWORD}`);
  console.log(`  Login at: https://portal.strydeos.com/login`);
  console.log(`  Admin:    https://portal.strydeos.com/admin`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
