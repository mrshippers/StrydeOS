/**
 * Ava endpoint smoke test.
 *
 * Sends signed test requests to all three Ava webhook endpoints and reports
 * whether each one is reachable, authenticates correctly, and dispatches.
 *
 * Usage:
 *   ELEVENLABS_WEBHOOK_SECRET=<secret> npx tsx scripts/test-ava-call.ts
 *   ELEVENLABS_WEBHOOK_SECRET=<secret> APP_URL=https://app.strydeos.com npx tsx scripts/test-ava-call.ts
 *
 * Without ELEVENLABS_WEBHOOK_SECRET the test still runs but will get 500 from
 * every endpoint (misconfigured production) — that itself is a useful signal.
 */

import crypto from "crypto";

const SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";
const BASE = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const FAKE_AGENT_ID = process.env.TEST_AGENT_ID ?? "test_agent_id_smoke_test";

// ── HMAC-SHA256 (mirrors verify-signature.ts) ──────────────────────────────

function sign(body: string): string {
  if (!SECRET) return "";
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

async function post(path: string, body: object): Promise<{ status: number; json: unknown }> {
  const raw = JSON.stringify(body);
  const sig = sign(raw);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sig) headers["elevenlabs-signature"] = sig;

  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: raw });
  let json: unknown;
  try { json = await res.json(); } catch { json = await res.text(); }
  return { status: res.status, json };
}

// ── Test cases ─────────────────────────────────────────────────────────────

const tests: Array<{ name: string; path: string; body: object }> = [
  {
    name: "tools — check_availability",
    path: "/api/ava/tools",
    body: {
      agent_id: FAKE_AGENT_ID,
      conversation_id: "smoke_test_001",
      caller_phone: "+447700000000",
      tool_name: "check_availability",
      parameters: { preferred_day: "tomorrow" },
    },
  },
  {
    name: "tools — book_appointment (missing fields → early return)",
    path: "/api/ava/tools",
    body: {
      agent_id: FAKE_AGENT_ID,
      conversation_id: "smoke_test_002",
      caller_phone: "+447700000000",
      tool_name: "book_appointment",
      parameters: {
        // Deliberately sparse — should hit the "I need your first and last name" guard
        patient_first_name: "",
        patient_last_name: "",
        patient_phone: "+447700000000",
        slot_datetime: new Date(Date.now() + 48 * 3600_000).toISOString(),
      },
    },
  },
  {
    name: "tools — update_booking (missing booking_id → guard)",
    path: "/api/ava/tools",
    body: {
      agent_id: FAKE_AGENT_ID,
      conversation_id: "smoke_test_003",
      caller_phone: "+447700000000",
      tool_name: "update_booking",
      parameters: { action: "cancel" }, // missing booking_id
    },
  },
  {
    name: "transfer — transfer_to_reception",
    path: "/api/ava/transfer",
    body: {
      agent_id: FAKE_AGENT_ID,
      conversation_id: "smoke_test_004",
      caller_phone: "+447700000000",
    },
  },
  {
    name: "webhooks/elevenlabs — conversation.ended",
    path: "/api/webhooks/elevenlabs",
    body: {
      event: "conversation.ended",
      conversation_id: "smoke_test_005",
      agent_id: FAKE_AGENT_ID,
      summary: "Patient called to book a physiotherapy appointment.",
      transcript: "Hello, I would like to book an appointment.",
      call_duration: 45,
      timestamp: Math.floor(Date.now() / 1000),
    },
  },
];

// ── Expectations ────────────────────────────────────────────────────────────
// With a valid secret + unknown agent_id we expect 200 + graceful fallback.
// Without a secret we expect 500 "Webhook secret not configured".
// Either way the endpoint is live.

function assess(name: string, status: number, json: unknown): "PASS" | "WARN" | "FAIL" {
  if (status === 500 && !SECRET) return "WARN"; // expected when no secret
  if (status === 401) return "FAIL";            // wrong secret
  if (status === 200) return "PASS";
  if (status === 500) return "FAIL";
  return "WARN";
}

// ── Run ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n╔═══ Ava Smoke Test ═══════════════════════════════════════════`);
  console.log(`║  Target:  ${BASE}`);
  console.log(`║  Secret:  ${SECRET ? `set (${SECRET.length} chars)` : "NOT SET — expect 500 on all"}`);
  console.log(`║  AgentID: ${FAKE_AGENT_ID}`);
  console.log(`╚═══════════════════════════════════════════════════════════════\n`);

  let passed = 0, warned = 0, failed = 0;

  for (const t of tests) {
    process.stdout.write(`  ${t.name.padEnd(52, " ")}`);
    try {
      const { status, json } = await post(t.path, t.body);
      const grade = assess(t.name, status, json);
      const symbol = grade === "PASS" ? "✓" : grade === "WARN" ? "~" : "✗";
      const note =
        grade === "WARN" && !SECRET
          ? "500 (no secret — add ELEVENLABS_WEBHOOK_SECRET)"
          : status === 200
          ? `200 → ${JSON.stringify(json).slice(0, 60)}`
          : `${status} → ${JSON.stringify(json)}`;

      console.log(`${symbol}  ${note}`);
      if (grade === "PASS") passed++;
      else if (grade === "WARN") warned++;
      else failed++;
    } catch (e) {
      console.log(`✗  NETWORK ERROR: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  console.log(`\n  Results: ${passed} passed, ${warned} warnings, ${failed} failed`);

  if (!SECRET) {
    console.log(`\n  To fully test: add ELEVENLABS_WEBHOOK_SECRET to .env.local`);
    console.log(`  then: ELEVENLABS_WEBHOOK_SECRET=<secret> npx tsx scripts/test-ava-call.ts`);
  }

  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
