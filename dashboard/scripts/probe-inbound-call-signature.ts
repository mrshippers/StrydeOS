/**
 * probe-inbound-call-signature.ts
 *
 * Simulates exactly what Twilio does when it hits
 * portal.strydeos.com/api/ava/inbound-call: builds a valid
 * X-Twilio-Signature using the Twilio auth token, POSTs with a form
 * body matching Twilio's real payload, and reports the response.
 *
 * Result interpretation:
 *   200 + TwiML body   → signature path works; real-Twilio 403s come from
 *                        a DIFFERENT signed URL (header/proto/host mismatch)
 *   403                → either the fix isn't deployed, or the reconstructed
 *                        canonical URL doesn't match the signed URL
 *
 * Usage: npx tsx scripts/probe-inbound-call-signature.ts
 */

import { config as loadEnv } from "dotenv";
import path from "path";
import crypto from "node:crypto";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const URL_HOST = "https://portal.strydeos.com";
const URL_PATH = "/api/ava/inbound-call";
const URL_QS = "?clinicId=clinic-spires";
const FULL_URL = `${URL_HOST}${URL_PATH}${URL_QS}`;

if (!AUTH_TOKEN) {
  console.error("TWILIO_AUTH_TOKEN missing");
  process.exit(1);
}

// Minimal-realistic Twilio POST payload
const params: Record<string, string> = {
  CallSid: "CAprobeSIGaaaaaaaaaaaaaaaaaaaaaa",
  AccountSid: process.env.TWILIO_ACCOUNT_SID!,
  From: "+447384742532",
  To: "+442045727044",
  CallStatus: "ringing",
  Direction: "inbound",
  ApiVersion: "2010-04-01",
};

// Twilio signature = HMAC-SHA1(authToken, url + sortedKeys.concat(values)) base64
const sortedKeys = Object.keys(params).sort();
const payload = sortedKeys.reduce((acc, k) => acc + k + params[k], FULL_URL);
const sig = crypto.createHmac("sha1", AUTH_TOKEN).update(Buffer.from(payload, "utf-8")).digest("base64");

// Form-urlencoded body
const body = new URLSearchParams(params).toString();

async function main() {
  console.log("=== Probe ===");
  console.log(`URL:        ${FULL_URL}`);
  console.log(`Signature:  ${sig}`);
  console.log(`Body:       ${body.slice(0, 80)}…\n`);

  const resp = await fetch(FULL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": sig,
    },
    body,
  });

  const text = await resp.text();
  console.log(`Status:     ${resp.status} ${resp.statusText}`);
  console.log(`Headers:`);
  for (const [k, v] of resp.headers.entries()) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`\nBody:\n${text.slice(0, 500)}`);
  console.log(
    resp.status === 200
      ? "\n✓ Signature path works — real-Twilio 403s come from URL-reconstruction mismatch"
      : resp.status === 403
        ? "\n✗ Signature verification failing. Either deploy is stale or URL reconstruction is wrong."
        : `\n? Unexpected status ${resp.status}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
