/**
 * migrate-kpi-defaults.ts
 *
 * Fixes KPI defaults for existing clinics that were created with incorrect values.
 * - followUpRate: 75 → 4.0 (sessions per patient, not percentage)
 * - utilisationRate: 85 → 80 (industry standard for UK private physio)
 * Also resets stale onboarding flags where cliniciansConfirmed/targetsSet
 * were set without real data backing them.
 *
 * Usage (from dashboard dir):
 *   npx tsx scripts/migrate-kpi-defaults.ts
 *   npx tsx scripts/migrate-kpi-defaults.ts --dry-run
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";

const DRY_RUN = process.argv.includes("--dry-run");

// Initialize Firebase
const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ serviceAccountKey.json not found at:", serviceAccountPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Industry-standard defaults for UK private physio
const CORRECT_DEFAULTS = {
  followUpRate: 4.0,
  hepRate: 80,
  utilisationRate: 80,
  dnaRate: 5,
  courseCompletionTarget: 70,
};

// Values that indicate the old incorrect defaults were never changed
const OLD_INCORRECT = {
  followUpRate: 75,
  utilisationRate: 85,
};

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — no writes\n" : "🔧 LIVE RUN — writing to Firestore\n");

  const clinicsSnap = await db.collection("clinics").get();
  console.log(`Found ${clinicsSnap.size} clinic(s)\n`);

  let fixedTargets = 0;
  let fixedFlags = 0;
  let skipped = 0;

  for (const clinicDoc of clinicsSnap.docs) {
    const data = clinicDoc.data();
    const clinicName = data.name ?? clinicDoc.id;
    const targets = data.targets ?? {};
    const onboarding = data.onboarding ?? {};
    const updates: Record<string, unknown> = {};

    // ── Fix KPI targets ──────────────────────────────────────────────────
    // Only fix if targets still match the old incorrect defaults (user never changed them)
    if (targets.followUpRate === OLD_INCORRECT.followUpRate) {
      updates["targets.followUpRate"] = CORRECT_DEFAULTS.followUpRate;
    }
    if (targets.utilisationRate === OLD_INCORRECT.utilisationRate) {
      updates["targets.utilisationRate"] = CORRECT_DEFAULTS.utilisationRate;
    }

    // ── Fix stale onboarding flags ───────────────────────────────────────
    // Reset cliniciansConfirmed if flag is true but no active clinicians exist
    if (onboarding.cliniciansConfirmed) {
      const cliniciansSnap = await db
        .collection("clinics")
        .doc(clinicDoc.id)
        .collection("clinicians")
        .where("active", "==", true)
        .limit(1)
        .get();

      if (cliniciansSnap.empty) {
        updates["onboarding.cliniciansConfirmed"] = false;
      }
    }

    // Reset targetsSet if flag is true but targets are still at defaults
    // (user never actually reviewed them)
    if (
      onboarding.targetsSet &&
      (targets.followUpRate === OLD_INCORRECT.followUpRate ||
        targets.followUpRate === CORRECT_DEFAULTS.followUpRate) &&
      (targets.hepRate === CORRECT_DEFAULTS.hepRate || targets.hepRate === 80) &&
      (targets.utilisationRate === OLD_INCORRECT.utilisationRate ||
        targets.utilisationRate === CORRECT_DEFAULTS.utilisationRate)
    ) {
      updates["onboarding.targetsSet"] = false;
    }

    // ── Apply ────────────────────────────────────────────────────────────
    const hasTargetFixes = updates["targets.followUpRate"] || updates["targets.utilisationRate"];
    const hasFlagFixes =
      updates["onboarding.cliniciansConfirmed"] === false ||
      updates["onboarding.targetsSet"] === false;

    if (Object.keys(updates).length === 0) {
      console.log(`  ⏭  ${clinicName} — no changes needed`);
      skipped++;
      continue;
    }

    updates.updatedAt = new Date().toISOString();

    if (hasTargetFixes) fixedTargets++;
    if (hasFlagFixes) fixedFlags++;

    console.log(`  ${DRY_RUN ? "📋" : "✅"} ${clinicName}:`);
    if (updates["targets.followUpRate"]) {
      console.log(`     followUpRate: ${OLD_INCORRECT.followUpRate} → ${CORRECT_DEFAULTS.followUpRate}`);
    }
    if (updates["targets.utilisationRate"]) {
      console.log(`     utilisationRate: ${OLD_INCORRECT.utilisationRate} → ${CORRECT_DEFAULTS.utilisationRate}`);
    }
    if (updates["onboarding.cliniciansConfirmed"] === false) {
      console.log(`     cliniciansConfirmed: true → false (no active clinicians)`);
    }
    if (updates["onboarding.targetsSet"] === false) {
      console.log(`     targetsSet: true → false (targets still at defaults)`);
    }

    if (!DRY_RUN) {
      await db.collection("clinics").doc(clinicDoc.id).update(updates);
    }
  }

  console.log(`\n── Summary ──────────────────────────────`);
  console.log(`  Targets fixed:  ${fixedTargets}`);
  console.log(`  Flags fixed:    ${fixedFlags}`);
  console.log(`  Skipped:        ${skipped}`);
  console.log(`  Total clinics:  ${clinicsSnap.size}`);
  if (DRY_RUN) console.log(`\n  Re-run without --dry-run to apply changes.`);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
