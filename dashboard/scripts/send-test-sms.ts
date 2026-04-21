/**
 * Ad-hoc admin test SMS via Twilio.
 *
 * Run: npx tsx scripts/send-test-sms.ts
 *
 * Hardcoded to Jamal's number (+447384742532) to verify the StrydeOS Twilio
 * dispatch path end-to-end with a personalised new-appointment confirmation.
 * This is NOT a clinical comms event — nothing is logged to Firestore.
 */

import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

import { getTwilio, getTwilioPhone } from "../src/lib/twilio";

const TO = "+447384742532";
const BODY =
  "Hi Jamal, your new appointment at Spires Physiotherapy is confirmed. See you soon. Reply STOP to opt out.";

async function main() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error(
      "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set in environment (check .env.local)."
    );
    process.exit(1);
  }
  if (!process.env.TWILIO_PHONE_NUMBER) {
    console.error("TWILIO_PHONE_NUMBER not set in environment (check .env.local).");
    process.exit(1);
  }

  const client = getTwilio();
  const from = getTwilioPhone();

  console.log(`Sending test SMS:`);
  console.log(`  from: ${from}`);
  console.log(`  to:   ${TO}`);
  console.log(`  body: ${BODY}\n`);

  try {
    const msg = await client.messages.create({ from, to: TO, body: BODY });
    console.log(`SENT`);
    console.log(`  SID:    ${msg.sid}`);
    console.log(`  status: ${msg.status}`);
  } catch (err) {
    const e = err as { message?: string; code?: number | string; moreInfo?: string };
    console.error(`FAILED`);
    console.error(`  message: ${e.message ?? String(err)}`);
    if (e.code) console.error(`  code:    ${e.code}`);
    if (e.moreInfo) console.error(`  info:    ${e.moreInfo}`);
    process.exit(1);
  }
}

main();
