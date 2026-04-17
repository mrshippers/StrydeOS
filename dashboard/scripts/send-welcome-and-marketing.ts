/**
 * Send welcome email + Apple-style marketing announcement.
 * Run: npx tsx scripts/send-welcome-and-marketing.ts
 */

import { Resend } from "resend";
import { wrapEmailLayout, escHtml } from "../src/lib/intelligence/emails/layout";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is required. Set it in your environment before running this script.");
}
const FROM = "StrydeOS <noreply@strydeos.com>";
const TO = "jamal@spiresphysiotherapy.com";
const resend = new Resend(RESEND_API_KEY);

// ── 1. Welcome Email ───────────────────────────────────────────

function buildWelcomeEmail(clinicName: string, ownerName: string): string {
  const APP = "https://app.strydeos.com";

  const body = `
    <h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Welcome to StrydeOS</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#5C6370;line-height:1.7;font-family:'Outfit',Helvetica,Arial,sans-serif;">
      ${escHtml(ownerName)}, your clinic is live. Here's what happens next.
    </p>

    <!-- Step 1 -->
    <div style="margin-bottom:20px;padding:20px;border-radius:8px;background:#F9F8F6;border:1px solid #E2DFDA;">
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="width:28px;height:28px;border-radius:50%;background:#1C54F2;color:white;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">1</div>
        <div>
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Connect your PMS</p>
          <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">WriteUpp, Cliniko, TM3, Halaxy, or Zanda. Takes under 2 minutes.</p>
        </div>
      </div>
    </div>

    <!-- Step 2 -->
    <div style="margin-bottom:20px;padding:20px;border-radius:8px;background:#F9F8F6;border:1px solid #E2DFDA;">
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="width:28px;height:28px;border-radius:50%;background:#8B5CF6;color:white;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">2</div>
        <div>
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Invite your clinicians</p>
          <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">Settings \u2192 Clinicians \u2192 Add. They'll get a branded invite and set their own password.</p>
        </div>
      </div>
    </div>

    <!-- Step 3 -->
    <div style="margin-bottom:28px;padding:20px;border-radius:8px;background:#F9F8F6;border:1px solid #E2DFDA;">
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="width:28px;height:28px;border-radius:50%;background:#0891B2;color:white;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">3</div>
        <div>
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">See your first metrics by Friday</p>
          <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">Once your PMS syncs, Intelligence builds your baseline. Your first weekly digest arrives end of the week.</p>
        </div>
      </div>
    </div>

    <p style="margin:0 0 24px;font-size:13px;color:#5C6370;line-height:1.6;font-family:'Outfit',Helvetica,Arial,sans-serif;">
      Any questions \u2014 reply to this email. It comes to me directly.
    </p>

    <!-- Signature -->
    <div style="border-top:2px solid #1C54F2;padding-top:16px;margin-top:8px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Jamal</p>
      <p style="margin:2px 0 0;font-size:12px;color:#6B7280;font-family:'Outfit',Helvetica,Arial,sans-serif;">Founder \u00B7 StrydeOS</p>
      <p style="margin:2px 0 0;font-size:12px;color:#6B7280;font-family:'Outfit',Helvetica,Arial,sans-serif;">Spires Physiotherapy \u00B7 London</p>
    </div>`;

  return wrapEmailLayout(body, {
    subtitle: `${clinicName} is live`,
    accentColor: "#1C54F2",
    footerNote: "StrydeOS",
    footerLinks: [
      { label: "Open your dashboard", href: APP },
    ],
  });
}

// ── 2. Marketing Announcement (Apple keynote vibe) ─────────────

function buildMarketingEmail(): string {
  // Full-bleed hero sections with DM Serif headlines, 1-2 lines of copy
  // No wrapper layout — this is a standalone marketing piece

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <title>StrydeOS</title>
</head>
<body style="margin:0;padding:0;background:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- HERO -->
  <div style="padding:60px 32px 48px;text-align:center;background:linear-gradient(180deg,#0B2545 0%,#132D5E 100%);">
    <p style="margin:0 0 20px;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#4B8BF5;">May 2027 Update</p>
    <h1 style="margin:0 0 16px;font-family:'DM Serif Display',Georgia,serif;font-size:36px;font-weight:400;line-height:1.15;color:#FFFFFF;">
      Your clinic just got<br>
      <span style="color:#4B8BF5;">sharper.</span>
    </h1>
    <p style="margin:0 auto;max-width:420px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.6;">
      Three modules. One platform. Everything your practice needs to measure what matters.
    </p>
  </div>

  <!-- INTELLIGENCE -->
  <div style="padding:48px 32px;text-align:center;background:#0F1D36;border-top:1px solid rgba(255,255,255,0.04);">
    <div style="display:inline-block;padding:4px 14px;border-radius:50px;background:rgba(139,92,246,0.15);margin-bottom:16px;">
      <span style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#C4B5FD;">Intelligence</span>
    </div>
    <h2 style="margin:0 0 10px;font-family:'DM Serif Display',Georgia,serif;font-size:28px;font-weight:400;line-height:1.2;color:#FFFFFF;">
      Coaching notes, not spreadsheets.
    </h2>
    <p style="margin:0 auto;max-width:400px;font-size:14px;color:rgba(255,255,255,0.45);line-height:1.6;">
      Weekly digests now surface personalised observations for each clinician. Specific. Constructive. Data-backed.
    </p>
  </div>

  <!-- PULSE -->
  <div style="padding:48px 32px;text-align:center;background:#0B2545;border-top:1px solid rgba(255,255,255,0.04);">
    <div style="display:inline-block;padding:4px 14px;border-radius:50px;background:rgba(8,145,178,0.15);margin-bottom:16px;">
      <span style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#22D3EE;">Pulse</span>
    </div>
    <h2 style="margin:0 0 10px;font-family:'DM Serif Display',Georgia,serif;font-size:28px;font-weight:400;line-height:1.2;color:#FFFFFF;">
      Patients who don't rebook<br>get a nudge. Automatically.
    </h2>
    <p style="margin:0 auto;max-width:400px;font-size:14px;color:rgba(255,255,255,0.45);line-height:1.6;">
      72 hours. No rebooking. Pulse sends a personalised SMS. Early results: 64% rebook within 24 hours.
    </p>
  </div>

  <!-- AVA -->
  <div style="padding:48px 32px;text-align:center;background:#0F1D36;border-top:1px solid rgba(255,255,255,0.04);">
    <div style="display:inline-block;padding:4px 14px;border-radius:50px;background:rgba(28,84,242,0.15);margin-bottom:16px;">
      <span style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#4B8BF5;">Ava</span>
    </div>
    <h2 style="margin:0 0 10px;font-family:'DM Serif Display',Georgia,serif;font-size:28px;font-weight:400;line-height:1.2;color:#FFFFFF;">
      Multi-clinic call routing<br>is live.
    </h2>
    <p style="margin:0 auto;max-width:400px;font-size:14px;color:rgba(255,255,255,0.45);line-height:1.6;">
      Per-clinic numbers. Independent availability. Patients hear the right name from the first ring.
    </p>
  </div>

  <!-- COMING NEXT -->
  <div style="padding:48px 32px;text-align:center;background:#0B2545;border-top:1px solid rgba(255,255,255,0.04);">
    <p style="margin:0 0 20px;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.3);">Coming in June</p>
    <p style="margin:0 auto;max-width:400px;font-size:14px;color:rgba(255,255,255,0.5);line-height:1.8;">
      Outcome measures \u00B7 TM3 integration \u00B7 Google Reviews auto-request
    </p>
  </div>

  <!-- CTA -->
  <div style="padding:40px 32px 48px;text-align:center;background:linear-gradient(180deg,#0B2545 0%,#132D5E 100%);">
    <a href="https://app.strydeos.com/dashboard" style="display:inline-block;padding:14px 36px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;">
      Open your dashboard \u2192
    </a>
  </div>

  <!-- FOOTER -->
  <div style="padding:24px 32px 32px;text-align:center;background:#0B2545;border-top:1px solid rgba(255,255,255,0.04);">
    <p style="margin:0 0 6px;font-size:11px;color:rgba(255,255,255,0.25);font-family:'Outfit',Helvetica,Arial,sans-serif;">StrydeOS \u00B7 The Clinic OS for private practice</p>
    <p style="margin:0;">
      <a href="https://app.strydeos.com/settings" style="font-size:11px;color:#4B8BF5;text-decoration:none;">Manage preferences</a>
      <span style="color:rgba(255,255,255,0.15);margin:0 6px;">\u00B7</span>
      <a href="https://app.strydeos.com/settings?unsubscribe=updates" style="font-size:11px;color:rgba(255,255,255,0.25);text-decoration:none;">Unsubscribe</a>
    </p>
  </div>

</body>
</html>`;
}

// ── Send ────────────────────────────────────────────────────────

async function main() {
  console.log("Sending 2 emails to", TO, "...\n");

  // 1. Welcome
  const { data: d1, error: e1 } = await resend.emails.send({
    from: FROM,
    to: TO,
    replyTo: "jamal@spiresphysiotherapy.com",
    subject: "[TEST] Welcome to StrydeOS \u2014 Spires Physiotherapy is live",
    html: buildWelcomeEmail("Spires Physiotherapy", "Jamal"),
    text: "Welcome to StrydeOS\n\nJamal, your clinic is live.\n\n1. Connect your PMS (Settings > Integrations)\n2. Invite your clinicians (Settings > Clinicians > Add)\n3. See your first metrics by Friday\n\nAny questions \u2014 reply to this email.\n\nJamal\nFounder \u00B7 StrydeOS",
  });
  console.log(e1 ? `  1. FAILED: ${e1.message}` : `  1. SENT: Welcome email (${d1?.id})`);

  await new Promise(r => setTimeout(r, 800));

  // 2. Marketing
  const { data: d2, error: e2 } = await resend.emails.send({
    from: "StrydeOS <noreply@strydeos.com>",
    to: TO,
    subject: "[TEST] What shipped in May \u2014 StrydeOS",
    html: buildMarketingEmail(),
    text: "StrydeOS \u2014 May 2027 Update\n\nYour clinic just got sharper.\n\nIntelligence: Coaching notes, not spreadsheets. Weekly digests now surface personalised observations.\n\nPulse: Patients who don't rebook get a nudge. Automatically. 64% rebook within 24hrs.\n\nAva: Multi-clinic call routing is live. Per-clinic numbers, independent availability.\n\nComing in June: Outcome measures \u00B7 TM3 integration \u00B7 Google Reviews auto-request\n\nOpen your dashboard: https://app.strydeos.com/dashboard",
  });
  console.log(e2 ? `  2. FAILED: ${e2.message}` : `  2. SENT: Marketing email (${d2?.id})`);

  console.log("\nDone. Check inbox.");
}

main();
