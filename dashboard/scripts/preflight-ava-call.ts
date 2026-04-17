/**
 * preflight-ava-call.ts
 *
 * Run BEFORE pushing to prod / before dialling the Ava test number.
 * Verifies:
 *   1. All critical env vars are present in .env.local (no values printed)
 *   2. /api/ava/tools is reachable on prod and rejects unsigned payloads (401)
 *   3. ElevenLabs API key works for the configured Spires agent
 *
 * Usage:
 *   cd dashboard
 *   npx tsx scripts/preflight-ava-call.ts
 *   # Optional: SPIRES_AGENT_ID=agent_xxx npx tsx scripts/preflight-ava-call.ts
 *
 * Exit code 0 = all green, 1 = any failure.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

// ─── Config ──────────────────────────────────────────────────────────────────

// Prod hostname is portal.strydeos.com (not app.). Override via PROD_URL env.
const PROD_BASE_URL = (process.env.PROD_URL || "https://portal.strydeos.com").replace(/\/$/, "");

// Spires agent ID — overridable via env. The check just verifies the key works.
const SPIRES_AGENT_ID = process.env.SPIRES_AGENT_ID || "";

const CRITICAL_VARS = [
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_WEBHOOK_SECRET",
  "ELEVENLABS_VOICE_ID",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "WRITEUPP_API_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_APP_URL",
  "AVA_BOOKING_SECRET",
  "SESSION_SECRET",
] as const;

const PASS = "\u2705";
const FAIL = "\u274C";
const WARN = "\u26A0\uFE0F ";

type Row = { name: string; status: string; detail: string };
const rows: Row[] = [];
let failures = 0;

function record(name: string, ok: boolean, detail = "") {
  rows.push({ name, status: ok ? PASS : FAIL, detail });
  if (!ok) failures++;
}

// ─── Step 1: env var presence ────────────────────────────────────────────────

console.log("\nStep 1 / 3 — Checking critical env vars in .env.local\n");

for (const name of CRITICAL_VARS) {
  const v = process.env[name];
  const present = !!v && v.trim().length > 0;
  record(name, present, present ? "set" : "MISSING");
}

// ─── Step 2: /api/ava/tools signature gate ───────────────────────────────────

async function checkToolsEndpoint() {
  const url = `${PROD_BASE_URL}/api/ava/tools`;
  console.log(`\nStep 2 / 3 — POST ${url} with bogus signature\n`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "elevenlabs-signature": "v0=deadbeef",
      },
      body: JSON.stringify({
        agent_id: "preflight-test",
        tool_name: "check_availability",
        parameters: {},
      }),
    });

    if (res.status === 401) {
      // Signature was checked and rejected = secret IS configured
      record(
        `POST ${url}`,
        true,
        "401 (signature gate active — webhook secret configured)",
      );
    } else if (res.status === 500) {
      const body = await res.text().catch(() => "");
      const msg = body.includes("Webhook secret not configured")
        ? "500: ELEVENLABS_WEBHOOK_SECRET missing in Vercel"
        : `500: ${body.slice(0, 120)}`;
      record(`POST ${url}`, false, msg);
    } else {
      record(`POST ${url}`, false, `unexpected status ${res.status}`);
    }
  } catch (err) {
    record(`POST ${url}`, false, `fetch failed: ${(err as Error).message}`);
  }
}

// ─── Step 3: ElevenLabs API key works ────────────────────────────────────────

async function checkElevenLabsAgent() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  console.log(`\nStep 3 / 3 — Verify ElevenLabs API key\n`);

  if (!apiKey) {
    record("ElevenLabs API", false, "no ELEVENLABS_API_KEY in env");
    return;
  }

  // If a specific agent ID is provided, hit the agent endpoint.
  // Otherwise, hit /v1/user (lighter, just verifies the key auths).
  const url = SPIRES_AGENT_ID
    ? `https://api.elevenlabs.io/v1/convai/agents/${SPIRES_AGENT_ID}`
    : `https://api.elevenlabs.io/v1/user`;

  try {
    const res = await fetch(url, { headers: { "xi-api-key": apiKey } });
    if (res.status === 200) {
      record(
        SPIRES_AGENT_ID ? `GET agent ${SPIRES_AGENT_ID}` : "GET /v1/user",
        true,
        "200 OK",
      );
    } else if (res.status === 401) {
      record(url, false, "401: ELEVENLABS_API_KEY rejected");
    } else if (res.status === 404 && SPIRES_AGENT_ID) {
      record(url, false, `404: agent ${SPIRES_AGENT_ID} not found for this key`);
    } else {
      record(url, false, `unexpected status ${res.status}`);
    }
  } catch (err) {
    record(url, false, `fetch failed: ${(err as Error).message}`);
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

(async () => {
  await checkToolsEndpoint();
  await checkElevenLabsAgent();

  // Render table
  const nameWidth = Math.max(...rows.map((r) => r.name.length));
  const statusWidth = 4;
  const sep = `+${"-".repeat(nameWidth + 2)}+${"-".repeat(statusWidth + 2)}+${"-".repeat(60)}+`;

  console.log("\nResults\n");
  console.log(sep);
  console.log(
    `| ${"Check".padEnd(nameWidth)} | ${"OK".padEnd(statusWidth)} | ${"Detail".padEnd(58)} |`,
  );
  console.log(sep);
  for (const r of rows) {
    console.log(
      `| ${r.name.padEnd(nameWidth)} | ${r.status.padEnd(statusWidth)} | ${r.detail.slice(0, 58).padEnd(58)} |`,
    );
  }
  console.log(sep);

  if (failures > 0) {
    console.log(`\n${FAIL} ${failures} check(s) failed. Fix before dialling.\n`);
    process.exit(1);
  } else {
    console.log(`\n${PASS} All checks passed. Safe to dial the Ava number.\n`);
    process.exit(0);
  }
})();
