/**
 * sync-spires-reviews.ts
 *
 * Fetches Google Places summary for Spires and writes it to Firestore,
 * mirroring what the pipeline sync-reviews stage does.
 *
 * Usage (from dashboard dir):
 *   npx tsx scripts/sync-spires-reviews.ts
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const INTEGRATIONS_CONFIG = "integrations_config";
const REVIEWS_DOC_ID = "google_reviews";
const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
  console.error("❌ Firebase Admin env vars missing");
  process.exit(1);
}
if (!PLACES_API_KEY) {
  console.error("❌ GOOGLE_PLACES_API_KEY is not set");
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
  // Resolve clinic
  const snap = await db.collection("clinics").where("name", "==", "Spires Physiotherapy London").get();
  if (snap.empty) { console.error("❌ Clinic not found"); process.exit(1); }
  const clinicId = snap.docs[0].id;
  console.log(`✓ Clinic: ${snap.docs[0].data().name} (${clinicId})`);

  // Read Place ID from config
  const configRef = db.collection("clinics").doc(clinicId).collection(INTEGRATIONS_CONFIG).doc(REVIEWS_DOC_ID);
  const configDoc = await configRef.get();
  if (!configDoc.exists) { console.error("❌ No integrations_config/google_reviews doc"); process.exit(1); }
  const placeId = configDoc.data()?.placeId as string;
  console.log(`✓ Place ID: ${placeId}`);

  // Call Places API (New) — fetch displayName, rating, userRatingCount + up to 5 reviews
  const url = `https://places.googleapis.com/v1/places/${placeId}?fields=displayName,rating,userRatingCount,reviews&languageCode=en&key=${PLACES_API_KEY}`;
  console.log("\n📡 Calling Google Places API...");
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.error(`❌ Places API error ${res.status}: ${body}`);
    process.exit(1);
  }
  const data = await res.json() as {
    displayName?: { text?: string };
    rating?: number;
    userRatingCount?: number;
    reviews?: Array<{ text?: { text?: string }; rating?: number; authorAttribution?: { displayName?: string } }>;
  };

  console.log(`\n📊 API response:`);
  console.log(`   Display name: ${data.displayName?.text}`);
  console.log(`   Rating: ${data.rating}`);
  console.log(`   Total reviews: ${data.userRatingCount}`);
  console.log(`   Review bodies returned: ${data.reviews?.length ?? 0}`);

  const summary = {
    totalReviews: data.userRatingCount ?? 0,
    avgRating: data.rating ?? 0,
    displayName: data.displayName?.text ?? "",
    lastSyncedAt: new Date().toISOString(),
  };

  // Persist summary
  await configRef.set({ summary }, { merge: true });
  console.log("\n✅ Summary written to Firestore:", JSON.stringify(summary, null, 2));

  // Optionally cache review bodies
  if (data.reviews && data.reviews.length > 0) {
    const reviewsRef = db.collection("clinics").doc(clinicId).collection("reviews");
    const batch = db.batch();
    for (const r of data.reviews) {
      const docId = `google_${Buffer.from(r.authorAttribution?.displayName ?? Math.random().toString()).toString("hex").slice(0, 12)}`;
      batch.set(reviewsRef.doc(docId), {
        source: "google",
        rating: r.rating ?? 0,
        text: r.text?.text ?? "",
        author: r.authorAttribution?.displayName ?? "Anonymous",
        syncedAt: new Date().toISOString(),
      }, { merge: true });
    }
    await batch.commit();
    console.log(`✓ Cached ${data.reviews.length} review bodies`);
  }
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
