/**
 * Verify Firebase Auth + Firestore state for the E2E test account.
 *
 * Usage:
 *   doppler run --project strydeos --config prd -- npx tsx scripts/verify-test-account.ts
 *
 * Optional: pass --clinic-id <id> to verify clinic doc when only the email is known.
 */

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const TEST_EMAIL = "j.o.adu@hotmail.co.uk";

function init() {
  if (getApps().length > 0) return getApp();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase admin env vars");
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

async function main() {
  init();
  const auth = getAuth();
  const db = getFirestore();

  console.log(`\n========== FIREBASE STATE CHECK: ${TEST_EMAIL} ==========\n`);

  // 1. Firebase Auth user
  let uid: string | null = null;
  try {
    const u = await auth.getUserByEmail(TEST_EMAIL);
    uid = u.uid;
    console.log(`✅ Firebase Auth user`);
    console.log(`   uid:           ${u.uid}`);
    console.log(`   email:         ${u.email}`);
    console.log(`   emailVerified: ${u.emailVerified}`);
    console.log(`   displayName:   ${u.displayName ?? "(none)"}`);
    console.log(`   created:       ${u.metadata.creationTime}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`❌ Firebase Auth user not found: ${msg}`);
    return;
  }

  // 2. users/{uid} doc
  console.log("");
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    console.log(`❌ users/${uid} doc missing`);
  } else {
    const u = userSnap.data()!;
    console.log(`✅ users/${uid} doc`);
    console.log(`   role:      ${u.role ?? "(none)"}`);
    console.log(`   clinicId:  ${u.clinicId ?? "(none)"}`);
    console.log(`   email:     ${u.email ?? "(none)"}`);
    console.log(`   name:      ${u.name ?? "(none)"}`);
  }

  // 3. clinics/{clinicId} doc
  const clinicId = userSnap.exists ? userSnap.data()!.clinicId : null;
  if (!clinicId) {
    console.log(`\n⚠ no clinicId on user — cannot inspect clinic doc`);
    return;
  }

  console.log("");
  const clinicRef = db.collection("clinics").doc(clinicId);
  const clinicSnap = await clinicRef.get();
  if (!clinicSnap.exists) {
    console.log(`❌ clinics/${clinicId} doc missing`);
    return;
  }
  const c = clinicSnap.data()!;
  console.log(`✅ clinics/${clinicId} doc`);
  console.log(`   name:                ${c.name ?? "(none)"}`);
  console.log(`   ownerEmail:          ${c.ownerEmail ?? "(none)"}`);
  console.log(`   status:              ${c.status ?? "(none)"}`);
  console.log(`   profession:          ${c.profession ?? "(none)"}`);
  console.log(`   size:                ${c.size ?? "(none)"}`);
  console.log(`   country:             ${c.country ?? "(none)"}`);
  console.log(`   trialStartedAt:      ${c.trialStartedAt ?? "(none)"}`);
  console.log("");
  console.log("   billing:");
  console.log(`     stripeCustomerId:    ${c.billing?.stripeCustomerId ?? "(none)"}`);
  console.log(`     subscriptionId:      ${c.billing?.subscriptionId ?? "(none)"}`);
  console.log(`     subscriptionStatus:  ${c.billing?.subscriptionStatus ?? "(none)"}`);
  console.log(`     tier:                ${c.billing?.tier ?? "(none)"}`);
  console.log(`     currentPeriodEnd:    ${c.billing?.currentPeriodEnd ?? "(none)"}`);
  console.log(`     lastPaymentAt:       ${c.billing?.lastPaymentAt ?? "(none)"}`);
  console.log("");
  console.log("   featureFlags:");
  console.log(`     intelligence:        ${c.featureFlags?.intelligence ?? false}`);
  console.log(`     continuity (Pulse):  ${c.featureFlags?.continuity ?? false}`);
  console.log(`     receptionist (Ava):  ${c.featureFlags?.receptionist ?? false}`);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
