/**
 * One-off / repeatable: push the Spires Ava knowledge base from Firestore to
 * ElevenLabs so the live agent can answer KB-grounded questions.
 *
 * Flow:
 *   1. Read clinics/clinic-spires.ava.{knowledge, agent_id, elevenLabsKbDocIds}
 *   2. Compile entries into per-category chunks (services / team / location / …)
 *   3. Best-effort delete any previously-synced KB docs (clean re-sync)
 *   4. Upload each chunk via POST /v1/convai/knowledge-base/text -> doc_id
 *   5. Wire the doc_ids into the agent via
 *      PATCH /v1/convai/agents/{agent_id} -> conversation_config.agent.prompt.knowledge_base
 *   6. Persist new doc_ids + ISO timestamp back to Firestore
 *   7. Verify by GET /v1/convai/agents/{agent_id} and printing knowledge_base
 *
 * Idempotent — safe to re-run. Re-runs delete the previous batch first so
 * ElevenLabs never accumulates stale Spires KB docs.
 *
 * Usage (from dashboard/):
 *   npx tsx scripts/sync-ava-knowledge.ts
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { config as loadEnv } from "dotenv";

import { compileKnowledgeChunks, type KnowledgeEntry } from "../src/lib/ava/ava-knowledge";
import {
  uploadKnowledgeBaseText,
  deleteKnowledgeBaseDoc,
  setAgentKnowledgeBase,
  getAgent,
  type KnowledgeBaseLocator,
} from "../src/lib/ava/elevenlabs-agent";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

// ─── Config ──────────────────────────────────────────────────────────────────

const CLINIC_ID = "clinic-spires";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

if (!ELEVENLABS_API_KEY) {
  throw new Error("ELEVENLABS_API_KEY not set in .env.local");
}

function maskKey(key: string): string {
  if (key.length <= 10) return "****";
  return `${key.slice(0, 4)}…${key.slice(-4)} (${key.length} chars)`;
}

// ─── Firebase Admin init ─────────────────────────────────────────────────────

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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n→ Syncing Ava knowledge base for ${CLINIC_ID}`);
  console.log(`  ElevenLabs key: ${maskKey(ELEVENLABS_API_KEY!)}\n`);

  // 1. Read clinic
  const docRef = db.collection("clinics").doc(CLINIC_ID);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error(`Clinic not found: ${CLINIC_ID}`);

  const clinicData = snap.data()!;
  const ava = clinicData.ava ?? {};
  const agentId: string | undefined = ava.agent_id;
  const entries: KnowledgeEntry[] = ava.knowledge ?? [];
  const previousDocIds: string[] = ava.elevenLabsKbDocIds ?? [];

  if (!agentId) {
    throw new Error(`Clinic ${CLINIC_ID} has no ava.agent_id — provision the agent first`);
  }
  if (entries.length === 0) {
    throw new Error(`Clinic ${CLINIC_ID} has no ava.knowledge entries to sync`);
  }

  console.log(`  Agent ID:           ${agentId}`);
  console.log(`  Entries to sync:    ${entries.length}`);
  console.log(`  Previous KB docs:   ${previousDocIds.length}\n`);

  // 2. Compile chunks (one per non-empty category)
  const chunks = compileKnowledgeChunks(entries);
  console.log(`  Compiled into ${chunks.length} category chunks:`);
  for (const c of chunks) {
    console.log(`    - ${c.name} (${c.content.length} chars)`);
  }
  console.log("");

  // 3. Delete previous KB docs (best-effort, ignore failures)
  if (previousDocIds.length) {
    console.log(`  Cleaning up ${previousDocIds.length} previous KB doc(s)…`);
    let deleted = 0;
    for (const id of previousDocIds) {
      const ok = await deleteKnowledgeBaseDoc(ELEVENLABS_API_KEY!, id);
      if (ok) deleted++;
    }
    console.log(`    deleted: ${deleted}/${previousDocIds.length} (misses are expected if docs were already gone)\n`);
  }

  // 4. Upload each chunk
  console.log(`  Uploading ${chunks.length} chunk(s) to ElevenLabs KB…`);
  const newLocators: KnowledgeBaseLocator[] = [];
  for (const chunk of chunks) {
    const docName = `Spires — ${chunk.name}`;
    const id = await uploadKnowledgeBaseText(ELEVENLABS_API_KEY!, docName, chunk.content);
    newLocators.push({ type: "text", name: docName, id, usage_mode: "auto" });
    console.log(`    ✓ ${docName} → ${id}`);
  }
  console.log("");

  // 5. Wire doc IDs into the agent
  console.log(`  Attaching ${newLocators.length} KB doc(s) to agent ${agentId}…`);
  await setAgentKnowledgeBase(ELEVENLABS_API_KEY!, agentId, newLocators);
  console.log(`    ✓ agent.prompt.knowledge_base updated\n`);

  // 6. Persist back to Firestore
  const now = new Date().toISOString();
  const newDocIds = newLocators.map((l) => l.id);
  await docRef.update({
    "ava.elevenLabsKbDocIds": newDocIds,
    "ava.knowledgeLastSyncedAt": now,
    updatedAt: now,
  });
  console.log(`  ✓ Firestore updated`);
  console.log(`    ava.elevenLabsKbDocIds:    [${newDocIds.length} ids]`);
  console.log(`    ava.knowledgeLastSyncedAt: ${now}\n`);

  // 7. Verify
  console.log(`  Verifying via GET /v1/convai/agents/${agentId}…`);
  const agent = await getAgent(ELEVENLABS_API_KEY!, agentId);
  const conv = (agent.conversation_config ?? {}) as Record<string, unknown>;
  const agentSection = (conv.agent ?? {}) as Record<string, unknown>;
  const prompt = (agentSection.prompt ?? {}) as Record<string, unknown>;
  const kb = (prompt.knowledge_base ?? []) as KnowledgeBaseLocator[];

  console.log(`    agent.prompt.knowledge_base length: ${kb.length}`);
  for (const item of kb) {
    console.log(`      - ${item.name} (${item.type}, id=${item.id})`);
  }

  if (kb.length !== newLocators.length) {
    console.warn(
      `\n⚠ Expected ${newLocators.length} KB docs on agent, found ${kb.length}. ` +
        `Sync wrote Firestore but agent verification disagrees — investigate.`,
    );
    process.exit(2);
  }

  console.log(`\n✔ Sync complete: ${newDocIds.length} docs live on agent ${agentId}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
