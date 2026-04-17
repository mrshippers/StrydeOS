/**
 * fix-spires-live-call-blockers.ts
 *
 * Consolidated remediation for three Spires live-call blockers surfaced by the
 * Ava ecosystem audit (2026-04-17):
 *
 *   1) ElevenLabs phone number `+44 20 4572 7044` (phnum_6201kp1qpgv1etf8zpsmdc7ekw4a)
 *      is currently assigned to `agent_5301knzcfd4effcvx3snf5nkf2p7` (Ava StrydeOS).
 *      Firestore and the canonical Spires build live at `agent_5901kp9330y7f62sbamkxavtje6d`
 *      (Spires Physiotherapy London - Ava). Reassign the DID to the canonical agent.
 *
 *   2) `clinics/clinic-spires/integrations_config/pms` doc is missing. Without it
 *      `check_availability` / `book_appointment` tool dispatch in /api/ava/tools
 *      will return "I'm not able to check availability right now." Seed WriteUpp
 *      credentials from env (WRITEUPP_API_KEY, optional WRITEUPP_BASE_URL).
 *
 *   3) `ava.config.address` is truncated to "45 Mill Lane, NW6 1NB" — lost the
 *      "West Hampstead, London" qualifier. Restore the canonical form used
 *      elsewhere in the knowledge base.
 *
 * Usage (from /dashboard):
 *   npx tsx scripts/fix-spires-live-call-blockers.ts           # dry-run
 *   npx tsx scripts/fix-spires-live-call-blockers.ts --apply   # commits changes
 *
 * Idempotent — re-running on already-fixed state is a no-op per section.
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

// ─── Known constants from audit ──────────────────────────────────────────────
const CLINIC_ID = "clinic-spires";
const PHONE_NUMBER_ID = "phnum_6201kp1qpgv1etf8zpsmdc7ekw4a";
const WRONG_AGENT_ID = "agent_5301knzcfd4effcvx3snf5nkf2p7"; // Ava StrydeOS (empty)
const RIGHT_AGENT_ID = "agent_5901kp9330y7f62sbamkxavtje6d"; // Spires Physiotherapy London - Ava

const CANONICAL_ADDRESS = "45 Mill Lane, West Hampstead, London NW6 1NB.";

// ─── Env ─────────────────────────────────────────────────────────────────────
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const WRITEUPP_API_KEY = process.env.WRITEUPP_API_KEY;
const WRITEUPP_BASE_URL = process.env.WRITEUPP_BASE_URL || "https://api.writeupp.com";

if (!ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY missing from .env.local");
  process.exit(1);
}

// ─── Firebase Admin init (mirror existing scripts) ───────────────────────────
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

// ─── Helpers ────────────────────────────────────────────────────────────────
function redact(s: string | undefined): string {
  if (!s) return "<missing>";
  return `${s.slice(0, 4)}${"*".repeat(Math.max(0, s.length - 4))}`;
}

async function elLabsGet(pathSeg: string): Promise<Response> {
  return fetch(`https://api.elevenlabs.io${pathSeg}`, {
    headers: { "xi-api-key": ELEVENLABS_API_KEY! },
  });
}

async function elLabsPatch(pathSeg: string, body: unknown): Promise<Response> {
  return fetch(`https://api.elevenlabs.io${pathSeg}`, {
    method: "PATCH",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const apply = process.argv.includes("--apply");
  console.log(
    `\n→ fix-spires-live-call-blockers (${apply ? "APPLY" : "DRY-RUN"}) — clinic=${CLINIC_ID}\n`,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Blocker 2: reassign ElevenLabs phone number to the canonical Spires agent
  // ══════════════════════════════════════════════════════════════════════════
  console.log("─── 1. ElevenLabs phone number reassignment ────────────");

  // Fetch the current assignment so we only patch if it's wrong (idempotent).
  const pnResp = await elLabsGet(`/v1/convai/phone-numbers/${PHONE_NUMBER_ID}`);
  if (!pnResp.ok) {
    console.error(
      `  ✗ GET phone-number failed: ${pnResp.status} ${await pnResp.text()}`,
    );
    process.exit(1);
  }
  const pnData: Record<string, unknown> = await pnResp.json();

  // ElevenLabs returns the agent linkage as `assigned_agent.agent_id` or
  // a top-level `agent_id`. Support both and prefer the more specific one.
  const assignedAgent = pnData.assigned_agent as { agent_id?: string } | undefined;
  const currentAgentId =
    assignedAgent?.agent_id ?? (pnData.agent_id as string | undefined);
  console.log(
    `  Phone ID:        ${PHONE_NUMBER_ID}`,
  );
  console.log(`  Phone number:    ${pnData.phone_number ?? "<unknown>"}`);
  console.log(`  Current agent:   ${currentAgentId ?? "<unassigned>"}`);
  console.log(`  Target agent:    ${RIGHT_AGENT_ID} (Spires Physiotherapy London - Ava)`);

  if (currentAgentId === RIGHT_AGENT_ID) {
    console.log(`  → already correct, skip\n`);
  } else {
    if (currentAgentId && currentAgentId !== WRONG_AGENT_ID) {
      console.log(
        `  ⚠  current agent (${currentAgentId}) is neither WRONG nor RIGHT — proceeding cautiously`,
      );
    }
    if (apply) {
      // ElevenLabs accepts { agent_id } at the top level on PATCH.
      const patchResp = await elLabsPatch(
        `/v1/convai/phone-numbers/${PHONE_NUMBER_ID}`,
        { agent_id: RIGHT_AGENT_ID },
      );
      if (!patchResp.ok) {
        console.error(
          `  ✗ PATCH phone-number failed: ${patchResp.status} ${await patchResp.text()}`,
        );
        process.exit(1);
      }
      console.log(`  ✓ Reassigned to ${RIGHT_AGENT_ID}\n`);
    } else {
      console.log(`  → would PATCH agent_id = ${RIGHT_AGENT_ID}\n`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Housekeeping 1: seed clinics/clinic-spires/integrations_config/pms
  // ══════════════════════════════════════════════════════════════════════════
  console.log("─── 2. PMS integration config seed ─────────────────────");

  const pmsRef = db
    .collection("clinics")
    .doc(CLINIC_ID)
    .collection("integrations_config")
    .doc("pms");
  const pmsSnap = await pmsRef.get();

  if (pmsSnap.exists) {
    const data = pmsSnap.data() as Record<string, unknown>;
    console.log(`  Existing pms doc found:`);
    console.log(`    provider:  ${data.provider ?? "<none>"}`);
    console.log(`    baseUrl:   ${data.baseUrl ?? "<none>"}`);
    console.log(`    apiKey:    ${redact(data.apiKey as string | undefined)}`);
    const apiKeyOk =
      typeof data.apiKey === "string" && (data.apiKey as string).trim().length > 0;
    if (data.provider === "writeupp" && apiKeyOk) {
      console.log(`  → already configured for WriteUpp, skip\n`);
    } else {
      console.log(`  → incomplete config — would patch missing fields\n`);
      if (apply) {
        if (!WRITEUPP_API_KEY) {
          console.error(
            `  ✗ WRITEUPP_API_KEY not set in .env.local — cannot patch missing apiKey`,
          );
          process.exit(1);
        }
        await pmsRef.set(
          {
            provider: "writeupp",
            apiKey: WRITEUPP_API_KEY,
            baseUrl: WRITEUPP_BASE_URL,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        console.log(`  ✓ Patched pms doc (provider=writeupp, apiKey=${redact(WRITEUPP_API_KEY)})\n`);
      }
    }
  } else {
    console.log(`  pms doc does not exist`);
    if (!WRITEUPP_API_KEY) {
      console.error(
        `  ✗ WRITEUPP_API_KEY not set in .env.local — cannot seed. Set it and re-run.`,
      );
      process.exit(1);
    }
    console.log(`  Would seed:`);
    console.log(`    provider:  writeupp`);
    console.log(`    baseUrl:   ${WRITEUPP_BASE_URL}`);
    console.log(`    apiKey:    ${redact(WRITEUPP_API_KEY)}`);
    if (apply) {
      await pmsRef.set({
        provider: "writeupp",
        apiKey: WRITEUPP_API_KEY,
        baseUrl: WRITEUPP_BASE_URL,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log(`  ✓ Seeded pms doc\n`);
    } else {
      console.log(`  → dry-run, no write\n`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Housekeeping 2: restore canonical ava.config.address
  // ══════════════════════════════════════════════════════════════════════════
  console.log("─── 3. ava.config.address canonicalisation ─────────────");

  const clinicRef = db.collection("clinics").doc(CLINIC_ID);
  const clinicSnap = await clinicRef.get();
  if (!clinicSnap.exists) {
    console.error(`  ✗ clinic doc ${CLINIC_ID} missing`);
    process.exit(1);
  }
  const ava = (clinicSnap.data()?.ava as Record<string, unknown>) || {};
  const cfg = (ava.config as Record<string, unknown>) || {};
  const currentAddress = cfg.address as string | undefined;
  console.log(`  current:   ${JSON.stringify(currentAddress)}`);
  console.log(`  canonical: ${JSON.stringify(CANONICAL_ADDRESS)}`);

  if (currentAddress === CANONICAL_ADDRESS) {
    console.log(`  → already canonical, skip\n`);
  } else {
    if (apply) {
      await clinicRef.update({
        "ava.config.address": CANONICAL_ADDRESS,
        updatedAt: new Date().toISOString(),
      });
      console.log(`  ✓ Updated ava.config.address\n`);
    } else {
      console.log(`  → would update ava.config.address\n`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Verification pass (apply mode only)
  // ══════════════════════════════════════════════════════════════════════════
  if (apply) {
    console.log("─── Verification ───────────────────────────────────────");
    const [verifyPn, verifyPms, verifyClinic] = await Promise.all([
      elLabsGet(`/v1/convai/phone-numbers/${PHONE_NUMBER_ID}`),
      pmsRef.get(),
      clinicRef.get(),
    ]);
    const vPn: Record<string, unknown> = await verifyPn.json();
    const vAssigned = vPn.assigned_agent as { agent_id?: string } | undefined;
    const vAgentId = vAssigned?.agent_id ?? (vPn.agent_id as string | undefined);
    const vPms = verifyPms.data() as Record<string, unknown> | undefined;
    const vAva = (verifyClinic.data()?.ava as Record<string, unknown>) || {};
    const vCfg = (vAva.config as Record<string, unknown>) || {};

    console.log(`  phone → agent:      ${vAgentId} ${vAgentId === RIGHT_AGENT_ID ? "✓" : "✗"}`);
    console.log(
      `  pms.provider:       ${vPms?.provider} ${vPms?.provider === "writeupp" ? "✓" : "✗"}`,
    );
    console.log(
      `  pms.apiKey present: ${vPms?.apiKey ? "yes" : "no"} ${vPms?.apiKey ? "✓" : "✗"}`,
    );
    console.log(
      `  ava.config.address: ${JSON.stringify(vCfg.address)} ${vCfg.address === CANONICAL_ADDRESS ? "✓" : "✗"}`,
    );
    console.log("");
  } else {
    console.log("Dry-run complete. Re-run with --apply to commit these changes.\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAILED:", err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  });
