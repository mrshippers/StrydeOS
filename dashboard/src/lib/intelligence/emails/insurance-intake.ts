/**
 * Patient-facing insurance intake email (Pulse delivery).
 * Sent automatically before an appointment with a secure link to the form.
 */

import { wrapEmailLayout, textFooter } from "./layout";

export function buildInsuranceIntakeEmail(opts: {
  patientName?: string;
  clinicName: string;
  url: string;
}): { html: string; text: string } {
  const greeting = opts.patientName ? `Hi ${opts.patientName.split(" ")[0]},` : "Hello,";

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0B2545;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;color:#0B2545;line-height:1.6;">
      Ahead of your appointment at ${escapeHtml(opts.clinicName)}, please confirm your private insurance
      details using the secure link below. It takes under a minute, with no phone call and no photos of
      your card.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#0B2545;line-height:1.6;">
      You will pick your insurer, add your policy number and address, and that is it. Your appointment can
      then be processed without delay.
    </p>
    <div style="text-align:center;margin:8px 0 8px;">
      <a href="${escapeHtml(opts.url)}" style="display:inline-block;padding:14px 32px;border-radius:50px;background:#0891B2;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;">Confirm insurance details</a>
    </div>
    <p style="margin:20px 0 0;font-size:12px;color:#6B7280;line-height:1.6;">
      This link is personal to you and expires in 7 days. If you have already done this, you can ignore this email.
    </p>`;

  const html = wrapEmailLayout(body, {
    subtitle: opts.clinicName,
    moduleLabel: "Pulse",
    accentColor: "#0891B2",
    footerNote: "Sent by your clinic via StrydeOS",
    signature: false,
  });

  const text = [
    greeting,
    "",
    `Ahead of your appointment at ${opts.clinicName}, please confirm your private insurance details using the secure link below. It takes under a minute - no phone call, no photos.`,
    "",
    `Confirm insurance details: ${opts.url}`,
    "",
    "This link is personal to you and expires in 7 days.",
    "",
    textFooter({ footerNote: "Sent by your clinic via StrydeOS" }),
  ].join("\n");

  return { html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
