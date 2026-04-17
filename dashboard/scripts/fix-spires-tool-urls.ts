/**
 * fix-spires-tool-urls.ts
 *
 * One-off remediation: Spires Ava agent's tool webhooks point at
 * `app.strydeos.com` but production is `portal.strydeos.com`. This script
 * patches the agent's tool URLs to the correct production hostname.
 *
 * Usage (from /dashboard):
 *   npx tsx scripts/fix-spires-tool-urls.ts            # dry-run
 *   npx tsx scripts/fix-spires-tool-urls.ts --apply    # writes via PATCH
 *
 * Idempotent — re-running on already-fixed URLs is a no-op.
 */

import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const AGENT_ID = "agent_5901kp9330y7f62sbamkxavtje6d"; // Spires
const WRONG_HOST = "app.strydeos.com";
const RIGHT_HOST = "portal.strydeos.com";

async function main() {
  const apply = process.argv.includes("--apply");
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY missing from .env.local");
    process.exit(1);
  }

  console.log(`→ fix-spires-tool-urls (${apply ? "APPLY" : "DRY-RUN"}) — agent=${AGENT_ID}\n`);

  // ── Fetch current agent config ────────────────────────────────────────────
  const getResp = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!getResp.ok) {
    console.error(`GET agent failed: ${getResp.status} ${await getResp.text()}`);
    process.exit(1);
  }
  const agent: any = await getResp.json();
  const tools: any[] = agent?.conversation_config?.agent?.prompt?.tools ?? [];

  if (tools.length === 0) {
    console.log("Agent has no tools configured. Nothing to do.");
    return;
  }

  // ── Plan changes ──────────────────────────────────────────────────────────
  let changeCount = 0;
  for (const t of tools) {
    const oldUrl = t.api_schema?.url ?? t.url ?? "";
    if (!oldUrl.includes(WRONG_HOST)) {
      console.log(`  ${t.name ?? t.type}  →  ${oldUrl}  (no change)`);
      continue;
    }
    const newUrl = oldUrl.replace(WRONG_HOST, RIGHT_HOST);
    console.log(`  ${t.name ?? t.type}`);
    console.log(`    BEFORE: ${oldUrl}`);
    console.log(`    AFTER : ${newUrl}`);
    if (t.api_schema) t.api_schema.url = newUrl;
    if (t.url) t.url = newUrl;
    changeCount++;
  }

  console.log(`\nPlanned: ${changeCount} URL(s) to update.\n`);

  if (changeCount === 0) {
    console.log("✓ All tool URLs already correct. No write needed.");
    return;
  }

  if (!apply) {
    console.log("Dry-run complete. Re-run with --apply to commit.");
    return;
  }

  // ── PATCH the agent with mutated tools ────────────────────────────────────
  const patchBody = {
    conversation_config: {
      agent: {
        prompt: {
          tools,
        },
      },
    },
  };

  const patchResp = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
    method: "PATCH",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patchBody),
  });

  if (!patchResp.ok) {
    console.error(`PATCH agent failed: ${patchResp.status} ${await patchResp.text()}`);
    process.exit(1);
  }
  console.log(`✓ Committed ${changeCount} URL change(s) to ElevenLabs agent.`);

  // ── Verify ────────────────────────────────────────────────────────────────
  const verify: any = await (
    await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
      headers: { "xi-api-key": apiKey },
    })
  ).json();
  const verifyTools: any[] = verify?.conversation_config?.agent?.prompt?.tools ?? [];
  console.log("\nAfter-state:");
  for (const t of verifyTools) {
    const u = t.api_schema?.url ?? t.url ?? "(none)";
    const ok = !u.includes(WRONG_HOST);
    console.log(`  ${ok ? "✓" : "✗"} ${t.name ?? t.type}  →  ${u}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
