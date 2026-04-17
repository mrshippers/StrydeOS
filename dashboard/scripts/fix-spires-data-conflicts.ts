/**
 * fix-spires-data-conflicts.ts
 *
 * One-off remediation for three production data inconsistencies in
 * `clinics/clinic-spires` (project: clinical-tracker-spires) that would cause
 * Ava to give wrong info on a live phone test:
 *
 *   1) Address conflict — knowledge entry `spires-location-address` says
 *      "NW3 1LB". West Hampstead is in NW6, not NW3. The clinic doc's
 *      `ava.config.address` already has "45 Mill Lane, NW6 1NB". We canonicalise
 *      the knowledge entry to the full correct line and keep `ava.config.address`
 *      as the more complete form.
 *
 *   2) Pricing conflict — `ava.config.fu_price = 65` but knowledge entry
 *      `spires-pricing-fu` still says "£75". `ava.config.fu_price` is the
 *      source of truth (read by useAvaConfig + receptionist UI; user has
 *      explicitly set it). We update the knowledge entry to match.
 *
 *   3) Duplicate clinician records — `clinics/clinic-spires/clinicians`
 *      contains both legacy long auto-id docs and new `c-<slug>` canonical
 *      docs for the same person, all `active: true`. The new c-* docs are
 *      canonical (used by clinician-mgmt UI). We soft-delete the legacy
 *      duplicates: set `active: false`, add `deduplicatedAt: <ISO now>` and
 *      `replacedBy: <new doc id>`.
 *
 * Usage (from /dashboard):
 *   npx tsx scripts/fix-spires-data-conflicts.ts            # dry-run, prints diff
 *   npx tsx scripts/fix-spires-data-conflicts.ts --apply    # actually writes
 *
 * Idempotent — re-running on already-fixed data is a no-op.
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

// ─── Config ───────────────────────────────────────────────────────
const CLINIC_ID = "clinic-spires";

const CORRECT_ADDRESS_LINE =
  "45 Mill Lane, West Hampstead, London NW6 1NB.";

/**
 * Manual dedup overrides for legacy clinician docs whose display name diverges
 * from the canonical c-* doc enough that name-grouping won't catch them.
 * Keyed by legacy doc ID → canonical c-* doc ID.
 */
const MANUAL_DEDUP_OVERRIDES: Record<string, string> = {
  // "Jamal Adu" (legacy) → "Jamal" (canonical c-jamal) — confirmed same person
  CFDD2vwIfgdbaWFm4iRM: "c-jamal",
};

// ─── Firebase Admin init (mirror assign-spires-number.ts) ─────────
const saPath = path.resolve(__dirname, "serviceAccountKey.json");
if (!admin.apps.length) {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: "clinical-tracker-spires",
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  } else if (fs.existsSync(saPath)) {
    const sa = JSON.parse(fs.readFileSync(saPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
}
const db = admin.firestore();

// ─── Types ────────────────────────────────────────────────────────
interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  updatedAt?: string;
}

interface ClinicianDoc {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  active?: boolean;
  deduplicatedAt?: string;
  replacedBy?: string;
}

interface PlannedChange {
  label: string;
  before: unknown;
  after: unknown;
  apply: (batch: FirebaseFirestore.WriteBatch) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────
function fmt(v: unknown): string {
  if (v === undefined) return "<undefined>";
  if (v === null) return "<null>";
  if (typeof v === "string") return JSON.stringify(v);
  return JSON.stringify(v, null, 2);
}

function normaliseName(d: ClinicianDoc): string {
  const n =
    d.name ||
    [d.firstName, d.lastName].filter(Boolean).join(" ") ||
    "";
  return n.trim().toLowerCase();
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  const apply = process.argv.includes("--apply");
  console.log(
    `\n→ fix-spires-data-conflicts (${apply ? "APPLY" : "DRY-RUN"}) — clinic=${CLINIC_ID}\n`,
  );

  const clinicRef = db.collection("clinics").doc(CLINIC_ID);
  const cliniciansRef = clinicRef.collection("clinicians");

  const [clinicSnap, cliniciansSnap] = await Promise.all([
    clinicRef.get(),
    cliniciansRef.get(),
  ]);

  if (!clinicSnap.exists) throw new Error(`Clinic not found: ${CLINIC_ID}`);
  const clinic = clinicSnap.data() as Record<string, unknown>;
  const ava = (clinic.ava as Record<string, unknown>) || {};
  const cfg = (ava.config as Record<string, unknown>) || {};
  const knowledge = (ava.knowledge as KnowledgeEntry[]) || [];

  const now = new Date().toISOString();
  const planned: PlannedChange[] = [];

  // ── Problem 1: address knowledge entry ──────────────────────────
  const addrIdx = knowledge.findIndex((k) => k?.id === "spires-location-address");
  const cfgAddress = cfg.address as string | undefined;
  console.log("─── Problem 1: address ────────────────────────────────");
  console.log(`  ava.config.address                       = ${fmt(cfgAddress)}`);
  if (addrIdx === -1) {
    console.log(`  knowledge[spires-location-address]       = <not found> (skip)`);
  } else {
    const before = knowledge[addrIdx].content;
    console.log(`  knowledge[spires-location-address].content = ${fmt(before)}`);
    if (before === CORRECT_ADDRESS_LINE) {
      console.log(`  → already correct, skip\n`);
    } else {
      const newKnowledge = knowledge.map((k, i) =>
        i === addrIdx ? { ...k, content: CORRECT_ADDRESS_LINE, updatedAt: now } : k,
      );
      planned.push({
        label: "knowledge[spires-location-address].content",
        before,
        after: CORRECT_ADDRESS_LINE,
        apply: (batch) =>
          batch.update(clinicRef, { "ava.knowledge": newKnowledge, updatedAt: now }),
      });
      console.log(`  → will update to: ${fmt(CORRECT_ADDRESS_LINE)}\n`);
    }
  }

  // ── Problem 2: follow-up price knowledge entry ──────────────────
  // Re-read knowledge AFTER any address change so we don't double-write the
  // ava.knowledge array. We chain updates by mutating a single working copy.
  let workingKnowledge = knowledge;
  if (planned.length > 0) {
    // The address change above already produced a new array in its closure.
    // For simplicity we re-derive the working copy here from `knowledge` and
    // apply both edits to it before queueing one consolidated batch update.
    workingKnowledge = knowledge.map((k) =>
      k?.id === "spires-location-address"
        ? { ...k, content: CORRECT_ADDRESS_LINE, updatedAt: now }
        : k,
    );
    // Drop the previously-queued single-field update; we'll re-queue a
    // consolidated one once the price edit is computed.
    planned.length = 0;
  }

  const fuPriceRaw = cfg.fu_price as string | number | undefined;
  const fuPriceStr = fuPriceRaw == null ? "" : String(fuPriceRaw);
  const expectedFuLine = fuPriceStr
    ? `£${fuPriceStr} for a 45-minute follow-up appointment.`
    : null;

  const fuIdx = workingKnowledge.findIndex((k) => k?.id === "spires-pricing-fu");
  console.log("─── Problem 2: follow-up price ────────────────────────");
  console.log(`  ava.config.fu_price (source of truth)    = ${fmt(fuPriceStr)}`);
  if (fuIdx === -1) {
    console.log(`  knowledge[spires-pricing-fu]             = <not found> (skip)`);
  } else if (!expectedFuLine) {
    console.log(`  ava.config.fu_price is empty — skipping (cannot derive expected line)\n`);
  } else {
    const before = workingKnowledge[fuIdx].content;
    console.log(`  knowledge[spires-pricing-fu].content     = ${fmt(before)}`);
    if (before === expectedFuLine) {
      console.log(`  → already matches fu_price, skip\n`);
    } else {
      workingKnowledge = workingKnowledge.map((k, i) =>
        i === fuIdx ? { ...k, content: expectedFuLine, updatedAt: now } : k,
      );
      console.log(`  → will update to: ${fmt(expectedFuLine)}\n`);
    }
  }

  // Queue ONE consolidated knowledge-array write covering both edits if the
  // working copy diverged from the original.
  if (JSON.stringify(workingKnowledge) !== JSON.stringify(knowledge)) {
    const beforeAddr = knowledge.find((k) => k?.id === "spires-location-address")?.content;
    const afterAddr = workingKnowledge.find(
      (k) => k?.id === "spires-location-address",
    )?.content;
    const beforeFu = knowledge.find((k) => k?.id === "spires-pricing-fu")?.content;
    const afterFu = workingKnowledge.find((k) => k?.id === "spires-pricing-fu")?.content;

    planned.push({
      label: "ava.knowledge (address + fu price)",
      before: { address: beforeAddr, fu: beforeFu },
      after: { address: afterAddr, fu: afterFu },
      apply: (batch) =>
        batch.update(clinicRef, {
          "ava.knowledge": workingKnowledge,
          updatedAt: now,
        }),
    });
  }

  // ── Problem 3: duplicate clinician records ──────────────────────
  console.log("─── Problem 3: duplicate clinicians ───────────────────");
  const clinicians: ClinicianDoc[] = cliniciansSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as object) }) as ClinicianDoc,
  );

  // Group by normalised display name
  const byName = new Map<string, ClinicianDoc[]>();
  for (const c of clinicians) {
    const k = normaliseName(c);
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(c);
  }

  // Apply manual overrides first — these handle cases where the display name
  // differs between legacy and canonical (e.g. "Jamal Adu" vs "Jamal").
  for (const [legacyId, canonicalId] of Object.entries(MANUAL_DEDUP_OVERRIDES)) {
    const legacy = clinicians.find((c) => c.id === legacyId);
    const canonical = clinicians.find((c) => c.id === canonicalId);
    if (!legacy) {
      console.log(`  manual override: legacy ${legacyId} not found, skip`);
      continue;
    }
    if (!canonical) {
      console.log(`  manual override: canonical ${canonicalId} not found, skip`);
      continue;
    }
    if (legacy.active === false && legacy.deduplicatedAt && legacy.replacedBy === canonicalId) {
      console.log(`  manual override: ${legacyId} → already soft-deleted (replacedBy=${canonicalId})`);
      continue;
    }
    const before = {
      active: legacy.active,
      deduplicatedAt: legacy.deduplicatedAt,
      replacedBy: legacy.replacedBy,
    };
    const after = {
      active: false,
      deduplicatedAt: now,
      replacedBy: canonicalId,
    };
    const oldRef = cliniciansRef.doc(legacyId);
    planned.push({
      label: `clinicians/${legacyId} → soft-delete (manual override, replaced by ${canonicalId})`,
      before,
      after,
      apply: (batch) => batch.update(oldRef, after),
    });
    console.log(`  manual override: will soft-delete ${legacyId} (replacedBy=${canonicalId})`);
  }

  for (const [name, group] of byName) {
    if (group.length < 2) continue;

    // Canonical = the c-* slug doc. Legacy = anything else (long auto-ids).
    const canonical = group.find((g) => g.id.startsWith("c-"));
    const legacy = group.filter((g) => !g.id.startsWith("c-"));

    console.log(`  duplicate group: "${name}" — ${group.map((g) => g.id).join(", ")}`);
    if (!canonical) {
      console.log(`    ⚠  no c-* canonical doc found, skipping (manual review needed)`);
      continue;
    }
    if (legacy.length === 0) {
      console.log(`    → already deduplicated\n`);
      continue;
    }

    for (const old of legacy) {
      if (old.active === false && old.deduplicatedAt && old.replacedBy === canonical.id) {
        console.log(`    → ${old.id} already soft-deleted, skip`);
        continue;
      }
      const before = {
        active: old.active,
        deduplicatedAt: old.deduplicatedAt,
        replacedBy: old.replacedBy,
      };
      const after = {
        active: false,
        deduplicatedAt: now,
        replacedBy: canonical.id,
      };
      const oldRef = cliniciansRef.doc(old.id);
      planned.push({
        label: `clinicians/${old.id} → soft-delete (replaced by ${canonical.id})`,
        before,
        after,
        apply: (batch) => batch.update(oldRef, after),
      });
      console.log(`    → will soft-delete ${old.id} (replacedBy=${canonical.id})`);
    }
    console.log("");
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.log("─── Plan summary ──────────────────────────────────────");
  if (planned.length === 0) {
    console.log("  No changes needed — data already consistent. ✓\n");
    return;
  }
  for (const p of planned) {
    console.log(`  • ${p.label}`);
    console.log(`      before: ${fmt(p.before)}`);
    console.log(`      after : ${fmt(p.after)}`);
  }
  console.log("");

  if (!apply) {
    console.log("Dry-run complete. Re-run with --apply to commit these changes.\n");
    return;
  }

  // ── Apply atomically ────────────────────────────────────────────
  const batch = db.batch();
  for (const p of planned) p.apply(batch);
  await batch.commit();
  console.log(`✓ Committed ${planned.length} change(s) in one batch.\n`);

  // ── Verify ──────────────────────────────────────────────────────
  console.log("─── After-state verification ──────────────────────────");
  const [verifyClinic, verifyClinicians] = await Promise.all([
    clinicRef.get(),
    cliniciansRef.get(),
  ]);
  const v = verifyClinic.data() as Record<string, unknown>;
  const vAva = (v.ava as Record<string, unknown>) || {};
  const vCfg = (vAva.config as Record<string, unknown>) || {};
  const vKnowledge = (vAva.knowledge as KnowledgeEntry[]) || [];

  console.log(`  ava.config.address              = ${fmt(vCfg.address)}`);
  console.log(`  ava.config.fu_price             = ${fmt(vCfg.fu_price)}`);
  console.log(
    `  knowledge[spires-location-address].content = ${fmt(
      vKnowledge.find((k) => k?.id === "spires-location-address")?.content,
    )}`,
  );
  console.log(
    `  knowledge[spires-pricing-fu].content       = ${fmt(
      vKnowledge.find((k) => k?.id === "spires-pricing-fu")?.content,
    )}`,
  );
  console.log("");
  console.log("  clinicians:");
  for (const d of verifyClinicians.docs) {
    const x = d.data() as ClinicianDoc;
    const flag = x.active === false ? "inactive" : "active";
    const dedup = x.deduplicatedAt ? ` deduplicatedAt=${x.deduplicatedAt}` : "";
    const repl = x.replacedBy ? ` replacedBy=${x.replacedBy}` : "";
    console.log(
      `    ${d.id.padEnd(28)} name=${(x.name || `${x.firstName ?? ""} ${x.lastName ?? ""}`.trim()).padEnd(20)} ${flag}${dedup}${repl}`,
    );
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAILED:", err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  });
