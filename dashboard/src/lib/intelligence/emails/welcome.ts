/**
 * Clinic owner welcome email — sent by provision-clinic when a new clinic is provisioned.
 * Includes a password-setup CTA so the owner can log in, plus the 3 onboarding next-steps.
 *
 * Module colours used for step numbers match the product:
 *   1 — PMS connection  → Intelligence blue  #1C54F2
 *   2 — Invite team     → Intelligence purple #8B5CF6
 *   3 — First metrics   → Pulse teal         #0891B2
 */

import { wrapEmailLayout, escHtml, textFooter } from "./layout";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.strydeos.com";

export function buildWelcomeEmail(
  ownerFirstName: string,
  clinicName: string,
  passwordResetLink: string
): string {
  const body = `
  <h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Welcome to StrydeOS</h1>
  <p style="margin:0 0 24px;font-size:14px;color:#5C6370;line-height:1.7;">${escHtml(ownerFirstName)}, your clinic is live. Here&rsquo;s what happens next.</p>

  <div style="text-align:center;margin-bottom:28px;">
    <a href="${escHtml(passwordResetLink)}" style="display:inline-block;padding:13px 32px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;letter-spacing:-0.01em;">
      Set up your account &rarr;
    </a>
  </div>

  <div style="margin-bottom:16px;padding:20px;border-radius:8px;background:#F9F8F6;border:1px solid #E2DFDA;">
    <div style="display:flex;align-items:flex-start;gap:14px;">
      <div style="width:28px;height:28px;min-width:28px;border-radius:50%;background:#1C54F2;color:white;font-size:13px;font-weight:700;text-align:center;line-height:28px;flex-shrink:0;">1</div>
      <div>
        <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Connect your PMS</p>
        <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">WriteUpp, Cliniko, TM3, Halaxy, or Zanda. Takes under 2 minutes.</p>
      </div>
    </div>
  </div>

  <div style="margin-bottom:16px;padding:20px;border-radius:8px;background:#F9F8F6;border:1px solid #E2DFDA;">
    <div style="display:flex;align-items:flex-start;gap:14px;">
      <div style="width:28px;height:28px;min-width:28px;border-radius:50%;background:#8B5CF6;color:white;font-size:13px;font-weight:700;text-align:center;line-height:28px;flex-shrink:0;">2</div>
      <div>
        <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Invite your clinicians</p>
        <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">Settings &rarr; Clinicians &rarr; Add. They set their own password.</p>
      </div>
    </div>
  </div>

  <div style="margin-bottom:28px;padding:20px;border-radius:8px;background:#F9F8F6;border:1px solid #E2DFDA;">
    <div style="display:flex;align-items:flex-start;gap:14px;">
      <div style="width:28px;height:28px;min-width:28px;border-radius:50%;background:#0891B2;color:white;font-size:13px;font-weight:700;text-align:center;line-height:28px;flex-shrink:0;">3</div>
      <div>
        <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">See your first metrics by Friday</p>
        <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">Once your PMS syncs, Intelligence builds your baseline.</p>
      </div>
    </div>
  </div>

  <p style="margin:0 0 24px;font-size:13px;color:#5C6370;line-height:1.6;font-family:'Outfit',Helvetica,Arial,sans-serif;">Questions? Reply and we&rsquo;ll sort it.</p>`;

  return wrapEmailLayout(body, {
    subtitle: `${clinicName} is live`,
    signature: "system",
    footerLinks: [{ label: "Open your dashboard", href: APP_URL }],
    footerNote: "StrydeOS",
  });
}

export function buildWelcomeText(
  ownerFirstName: string,
  clinicName: string,
  passwordResetLink: string
): string {
  return [
    `Welcome to StrydeOS - ${clinicName} is live`,
    "",
    `${ownerFirstName}, your clinic is live. Here's what happens next.`,
    "",
    `Set up your account: ${passwordResetLink}`,
    "",
    "1. Connect your PMS",
    "   WriteUpp, Cliniko, TM3, Halaxy, or Zanda. Takes under 2 minutes.",
    "",
    "2. Invite your clinicians",
    "   Settings → Clinicians → Add. They set their own password.",
    "",
    "3. See your first metrics by Friday",
    "   Once your PMS syncs, Intelligence builds your baseline.",
    "",
    "Questions? Reply and we'll sort it.",
    "",
    textFooter({ footerNote: "StrydeOS" }),
  ].join("\n");
}
