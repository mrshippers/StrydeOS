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
  const step = (num: string, color: string, title: string, desc: string, marginBottom: string): string => `
  <div style="margin-bottom:${marginBottom};padding:20px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="vertical-align:top;width:28px;padding-right:14px;">
          <div style="width:28px;height:28px;border-radius:50%;background:${color};color:#FFFFFF;font-size:13px;font-weight:700;text-align:center;line-height:28px;">${num}</div>
        </td>
        <td style="vertical-align:top;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#FFFFFF;font-family:'Outfit',Helvetica,Arial,sans-serif;">${title}</p>
          <p style="margin:0;font-size:13px;color:#B7C6DE;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">${desc}</p>
        </td>
      </tr>
    </table>
  </div>`;

  const body = `
  <h1 style="margin:0 0 6px;font-size:24px;font-weight:400;color:#FFFFFF;font-family:'DM Serif Display',Georgia,serif;">Welcome to StrydeOS</h1>
  <p style="margin:0 0 24px;font-size:14px;color:#B7C6DE;line-height:1.7;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(ownerFirstName)}, your clinic is live. Here&rsquo;s what happens next.</p>

  <div style="text-align:center;margin-bottom:28px;">
    <a href="${escHtml(passwordResetLink)}" style="display:inline-block;padding:13px 32px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;letter-spacing:-0.01em;">
      Set up your account &rarr;
    </a>
  </div>

  ${step("1", "#1C54F2", "Connect your PMS", "WriteUpp, Cliniko, TM3, Halaxy, or Zanda. Takes under 2 minutes.", "16px")}
  ${step("2", "#8B5CF6", "Invite your clinicians", "Settings &rarr; Clinicians &rarr; Add. They set their own password.", "16px")}
  ${step("3", "#0891B2", "See your first metrics by Friday", "Once your PMS syncs, Intelligence builds your baseline.", "28px")}

  <p style="margin:0 0 24px;font-size:13px;color:#B7C6DE;line-height:1.6;font-family:'Outfit',Helvetica,Arial,sans-serif;">Questions? Reply and we&rsquo;ll sort it.</p>`;

  return wrapEmailLayout(body, {
    subtitle: `${clinicName} is live`,
    signature: "system",
    footerLinks: [{ label: "Open your dashboard", href: APP_URL }],
    footerNote: "StrydeOS",
    theme: "dark",
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
