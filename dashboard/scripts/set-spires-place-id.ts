/**
 * set-spires-place-id.ts
 *
 * Writes the Google Place ID for Spires Physiotherapy into Firestore
 * so the reviews pipeline can fetch aggregate stats from the Places API.
 *
 * Usage (from dashboard dir):
 *   npx tsx scripts/set-spires-place-id.ts
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PLACE_ID = "ChIJZwchKK0RdkgRYSmf6b_K0NI";
const INTEGRATIONS_CONFIG = "integrations_config";
const REVIEWS_DOC_ID = "google_reviews";

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
  console.error("❌ Firebase Admin env vars missing");
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const db = getFirestore();

async function main() {
  console.log("🔍 Looking up Spires Physiotherapy...\n");

  const snap = await db
    .collection("clinics")
    .where("name", "==", "Spires Physiotherapy London")
    .get();

  if (snap.empty) {
    console.error("❌ Spires Physiotherapy clinic not found in Firestore");
    process.exit(1);
  }

  const clinicDoc = snap.docs[0];
  const clinicId = clinicDoc.id;
  console.log(`✓ Found clinic: ${clinicDoc.data().name} (${clinicId})`);

  const ref = db
    .collection("clinics")
    .doc(clinicId)
    .collection(INTEGRATIONS_CONFIG)
    .doc(REVIEWS_DOC_ID);

  const existing = await ref.get();
  if (existing.exists) {
    console.log(`\n📄 Existing config:`, JSON.stringify(existing.data(), null, 2));
  } else {
    console.log("\n📄 No existing config — creating fresh.");
  }

  await ref.set(
    {
      placeId: PLACE_ID,
      connectedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  const updated = await ref.get();
  console.log("\n✅ Written:", JSON.stringify(updated.data(), null, 2));
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
