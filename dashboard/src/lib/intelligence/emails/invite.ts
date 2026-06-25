/**
 * Clinician invite email template.
 * Used by /api/clinicians/add and /api/clinic/resend-invite.
 */

import { wrapEmailLayout, escHtml, textFooter } from "./layout";

export function buildInviteEmail(resetLink: string): string {
  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:400;color:#FFFFFF;font-family:'DM Serif Display',Georgia,serif;">Welcome to StrydeOS</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#B7C6DE;line-height:1.6;font-family:'Outfit',Helvetica,Arial,sans-serif;">
      You've been invited to join your clinic on StrydeOS, the clinical
      operating system built for private physiotherapy practices.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${escHtml(resetLink)}" style="display:inline-block;padding:12px 28px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;">
        Set your password &amp; sign in
      </a>
    </div>
    <p style="margin:0;font-size:12px;color:#8FA3C2;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">
      This link expires in 1 hour. If you weren't expecting this email, you can safely ignore it.
    </p>`;

  return wrapEmailLayout(body, {
    subtitle: "Clinician Invite",
    accentColor: "#1C54F2",
    signature: "system",
    theme: "dark",
  });
}

export function buildInviteText(resetLink: string): string {
  return [
    "Welcome to StrydeOS",
    "",
    "You've been invited to join your clinic on StrydeOS, the clinical operating system built for private physiotherapy practices.",
    "",
    `Set your password & sign in: ${resetLink}`,
    "",
    "This link expires in 1 hour. If you weren't expecting this email, you can safely ignore it.",
    "",
    textFooter(),
  ].join("\n");
}
