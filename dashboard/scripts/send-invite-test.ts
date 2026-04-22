/**
 * Minimal one-off: sends the clinician invite email template to a target
 * address via Resend. Skips the API route entirely (no Firebase token, no
 * tenant check) so you can verify a mailbox is receiving.
 *
 * Usage (from /dashboard):
 *   npx tsx scripts/send-invite-test.ts --to jamal@strydeos.com
 */

import { Resend } from "resend";
import { buildInviteEmail, buildInviteText } from "../src/lib/intelligence/emails/invite";

function getArg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

const TO = getArg("--to", "jamal@strydeos.com");
const FROM = getArg("--from", "StrydeOS <noreply@strydeos.com>");
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.strydeos.com";
const MOCK_RESET_LINK = `${APP_URL}/login?mode=resetPassword&oobCode=TEST_TOKEN_NOT_REAL`;

async function main() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("RESEND_API_KEY not set");
    process.exit(1);
  }

  const resend = new Resend(key);
  const res = await resend.emails.send({
    from: FROM,
    to: [TO],
    subject: "Your StrydeOS invite — set your password to get started",
    html: buildInviteEmail(MOCK_RESET_LINK),
    text: buildInviteText(MOCK_RESET_LINK),
  });

  if (res.error) {
    console.error("Send failed:", res.error);
    process.exit(1);
  }
  console.log(`Invite sent to ${TO}. Resend id: ${res.data?.id}`);
  console.log(`Note: the "Set password" link is a mock (${MOCK_RESET_LINK}) — won't actually sign you in.`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
