/**
 * send-import-guide.ts
 *
 * Sends a "how to import your WriteUpp data" guide to a clinic owner and
 * writes the rendered HTML to Marketing Material/Email comms templates/
 * so the static template stays in sync with what we actually send.
 *
 * Usage (from /dashboard):
 *   npx tsx scripts/send-import-guide.ts
 *   npx tsx scripts/send-import-guide.ts --to someone@clinic.com --clinic clinic-spires
 */

import { Resend } from "resend";
import * as fs from "node:fs";
import * as path from "node:path";
import { wrapEmailLayout } from "../src/lib/intelligence/emails/layout";

// ── Args ─────────────────────────────────────────────────────────

function getArg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

const TO = getArg("--to", "jamal@spiresphysiotherapy.com");
const CLINIC_ID = getArg("--clinic", "clinic-spires");
const FIRST_NAME = getArg("--firstname", "Jamal");
const FROM = "StrydeOS <noreply@strydeos.com>";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.strydeos.com";
const UPLOAD_URL = `${APP_URL}/settings#csv-import-section`;
const INGEST_EMAIL = `import-${CLINIC_ID}@ingest.strydeos.com`;

// ── Body ─────────────────────────────────────────────────────────

function buildBody(firstName: string): string {
  return `
    <p style="margin:0 0 16px;font-size:15px;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Hi ${firstName},</p>

    <p style="margin:0 0 8px;font-size:14px;color:#5C6370;line-height:1.65;font-family:'Outfit',Helvetica,Arial,sans-serif;">
      Most WriteUpp users have never exported a CSV. Fair. You weren&rsquo;t hired to be a data engineer.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#5C6370;line-height:1.65;font-family:'Outfit',Helvetica,Arial,sans-serif;">
      Here&rsquo;s the 30-second path.
    </p>

    <!-- Step 1 -->
    <div style="margin-bottom:14px;padding:18px 20px;border-radius:10px;background:#F9F8F6;border:1px solid #E2DFDA;">
      <div style="margin-bottom:6px;">
        <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#1C54F2;color:#FFFFFF;font-size:11px;font-weight:700;line-height:22px;text-align:center;font-family:'Outfit',Helvetica,Arial,sans-serif;vertical-align:middle;">1</span>
        <span style="display:inline-block;margin-left:8px;font-size:14px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;vertical-align:middle;">In WriteUpp</span>
      </div>
      <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.65;font-family:'Outfit',Helvetica,Arial,sans-serif;">
        <strong style="color:#0B2545;">Reports &rarr; Activity by Date.</strong> Pick a range (last 90 days works for the first run). Hit <strong style="color:#0B2545;">Export &rarr; CSV</strong>.
      </p>
    </div>

    <!-- Step 2 -->
    <div style="margin-bottom:14px;padding:18px 20px;border-radius:10px;background:#F9F8F6;border:1px solid #E2DFDA;">
      <div style="margin-bottom:6px;">
        <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#1C54F2;color:#FFFFFF;font-size:11px;font-weight:700;line-height:22px;text-align:center;font-family:'Outfit',Helvetica,Arial,sans-serif;vertical-align:middle;">2</span>
        <span style="display:inline-block;margin-left:8px;font-size:14px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;vertical-align:middle;">In StrydeOS</span>
      </div>
      <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.65;font-family:'Outfit',Helvetica,Arial,sans-serif;">
        Drop the file into the uploader below. Column mapping is automatic for the Activity report.
      </p>
    </div>

    <!-- Step 3 -->
    <div style="margin-bottom:24px;padding:18px 20px;border-radius:10px;background:#F9F8F6;border:1px solid #E2DFDA;">
      <div style="margin-bottom:6px;">
        <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#1C54F2;color:#FFFFFF;font-size:11px;font-weight:700;line-height:22px;text-align:center;font-family:'Outfit',Helvetica,Arial,sans-serif;vertical-align:middle;">3</span>
        <span style="display:inline-block;margin-left:8px;font-size:14px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;vertical-align:middle;">Watch the dashboard fill</span>
      </div>
      <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.65;font-family:'Outfit',Helvetica,Arial,sans-serif;">
        Follow-up rate, HEP compliance, DNA rate, revenue per session. All computed from the rows you just dropped in. Takes about 10 seconds.
      </p>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:28px;">
      <a href="${UPLOAD_URL}" style="display:inline-block;padding:13px 32px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;">
        Upload your CSV &rarr;
      </a>
    </div>

    <!-- Alt path -->
    <div style="padding:16px 18px;border-radius:10px;background:#0B2545;border:1px solid #0B2545;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#4B8BF5;font-family:'Outfit',Helvetica,Arial,sans-serif;">Prefer email?</p>
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.82);line-height:1.6;font-family:'Outfit',Helvetica,Arial,sans-serif;">
        Forward the same file to <a href="mailto:${INGEST_EMAIL}" style="color:#FFFFFF;text-decoration:underline;"><strong>${INGEST_EMAIL}</strong></a>. Lands in the same place.
      </p>
    </div>

    <p style="margin:24px 0 0;font-size:13px;color:#5C6370;line-height:1.65;font-family:'Outfit',Helvetica,Arial,sans-serif;">
      Can&rsquo;t find <em>Reports</em> in WriteUpp? Reply to this email. Two minutes and you&rsquo;re sorted.
    </p>
  `;
}

function buildText(firstName: string): string {
  return [
    `Hi ${firstName},`,
    ``,
    `Most WriteUpp users have never exported a CSV. Fair. You weren't hired to be a data engineer.`,
    ``,
    `Here's the 30-second path.`,
    ``,
    `1. In WriteUpp`,
    `   Reports -> Activity by Date. Pick a range (last 90 days works for the first run). Hit Export -> CSV.`,
    ``,
    `2. In StrydeOS`,
    `   Drop the file into the uploader: ${UPLOAD_URL}`,
    ``,
    `3. Watch the dashboard fill`,
    `   Follow-up rate, HEP compliance, DNA rate, revenue per session. Takes about 10 seconds.`,
    ``,
    `Prefer email? Forward the same file to ${INGEST_EMAIL}. Lands in the same place.`,
    ``,
    `Can't find Reports in WriteUpp? Reply to this email. Two minutes and you're sorted.`,
    ``,
    `Jamal`,
    `Founder, StrydeOS`,
    `strydeos.com`,
  ].join("\n");
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is required. Set it in your environment before running this script.");
    process.exit(1);
  }

  const html = wrapEmailLayout(buildBody(FIRST_NAME), {
    subtitle: "Import your WriteUpp data",
    accentColor: "#1C54F2",
    footerNote: "Powered by StrydeOS",
    signature: "founder",
    footerLinks: [
      { label: "Open dashboard", href: APP_URL },
      { label: "Get help", href: "mailto:hello@strydeos.com" },
    ],
  });

  const text = buildText(FIRST_NAME);

  // Write the rendered HTML to the Marketing Material template folder so the
  // static template (for design/preview) stays aligned with what we send.
  const templatePath = path.resolve(
    __dirname,
    "..",
    "..",
    "Marketing Material",
    "Email comms templates",
    "7-how-to-import.html",
  );
  try {
    fs.writeFileSync(templatePath, html);
    console.log(`Wrote rendered template -> ${templatePath}`);
  } catch (err) {
    console.warn("Could not write template file (continuing with send):", err);
  }

  const resend = new Resend(RESEND_API_KEY);
  const res = await resend.emails.send({
    from: FROM,
    to: [TO],
    subject: "Pulling your first CSV out of WriteUpp",
    html,
    text,
  });

  if (res.error) {
    console.error("Send failed:", res.error);
    process.exit(1);
  }
  console.log(`Sent import guide to ${TO}. Resend id: ${res.data?.id}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
