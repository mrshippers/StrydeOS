/**
 * Seed Ava knowledge base entries into Firestore for Spires.
 * Usage: npx tsx scripts/seed-ava-knowledge.ts
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { seedSpiresKnowledge } from "../src/lib/ava/ava-knowledge";

// ─── Init admin ──────────────────────────────────────────
const saPath = path.resolve(__dirname, "serviceAccountKey.json");
if (!admin.apps.length) {
  if (fs.existsSync(saPath)) {
    const sa = JSON.parse(fs.readFileSync(saPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
}
const db = admin.firestore();

const CLINIC_ID = "clinic-spires";

async function main() {
  const entries = seedSpiresKnowledge();

  console.log(`Seeding ${entries.length} knowledge entries for ${CLINIC_ID}...`);

  await db.collection("clinics").doc(CLINIC_ID).update({
    "ava.knowledge": entries,
    "ava.knowledgeLastSyncedAt": null,
    "ava.elevenLabsKbDocIds": [],
    updatedAt: new Date().toISOString(),
  });

  console.log(`✓ ${entries.length} entries written to clinics/${CLINIC_ID}.ava.knowledge`);

  // Print summary
  const categories = new Map<string, number>();
  for (const e of entries) {
    categories.set(e.category, (categories.get(e.category) || 0) + 1);
  }
  for (const [cat, count] of categories) {
    console.log(`  ${cat}: ${count}`);
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
