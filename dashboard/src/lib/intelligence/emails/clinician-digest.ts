/**
 * Clinician Weekly Digest — email template builders.
 *
 * Clinical framing only. No revenue figures. No blame.
 * Benchmarks labelled "UK avg" — never reference PPB by name.
 */

import { wrapEmailLayout, escHtml, textFooter } from "./layout";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.strydeos.com";

export interface ClinicianDigestData {
  firstName: string;
  clinicName: string;
  weekLabel: string;
  /** Current week stats */
  stats: {
    followUpRate: number;
    hepRate: number;
    utilisationRate: number;
    dnaRate: number;
  };
  /** Clinic KPI targets */
  targets: {
    followUpRate: number;
    hepRate: number;
    utilisationRate: number;
    dnaRate: number;
  };
  /** Number of patients needing follow-up */
  patientsNeedingAction: number;
  /** A single observational note (e.g. "Your Thursday DNA rate is higher than other days") */
  focusNote: string | null;
  /** A positive win to highlight */
  winNote: string | null;
}

function fmtPct(val: number): string {
  return `${Math.round(val * 100)}%`;
}

function fmtRate(val: number): string {
  return val.toFixed(1);
}

function metricRow(
  label: string,
  value: string,
  target: string,
  ukAvg: string
): string {
  return `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#5C6370;font-family:'Outfit',Helvetica,Arial,sans-serif;">${label}</td>
      <td style="padding:8px 12px;font-size:14px;font-weight:700;color:#0B2545;text-align:right;font-family:'Outfit',Helvetica,Arial,sans-serif;">${value}</td>
      <td style="padding:8px 12px;font-size:12px;color:#5C6370;text-align:right;font-family:'Outfit',Helvetica,Arial,sans-serif;">target: ${target}</td>
      <td style="padding:8px 0;font-size:12px;color:#5C6370;text-align:right;font-family:'Outfit',Helvetica,Arial,sans-serif;">${ukAvg}</td>
    </tr>`;
}

export function buildClinicianDigestEmail(data: ClinicianDigestData): string {
  const { firstName, clinicName, weekLabel, stats, targets, patientsNeedingAction, focusNote, winNote } = data;

  const statsTable = `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${metricRow("Follow-up rate", fmtRate(stats.followUpRate), fmtRate(targets.followUpRate), "UK avg: 4.0\u20135.5")}
      <tr><td colspan="4" style="padding:0;border-bottom:1px solid #F2F1EE;"></td></tr>
      ${metricRow("HEP compliance", fmtPct(stats.hepRate), fmtPct(targets.hepRate), "UK avg: 70\u201385%")}
      <tr><td colspan="4" style="padding:0;border-bottom:1px solid #F2F1EE;"></td></tr>
      ${metricRow("Utilisation", fmtPct(stats.utilisationRate), fmtPct(targets.utilisationRate), "UK avg: ~72%")}
      <tr><td colspan="4" style="padding:0;border-bottom:1px solid #F2F1EE;"></td></tr>
      ${metricRow("DNA rate", fmtPct(stats.dnaRate), `\u2264${fmtPct(targets.dnaRate)}`, "UK avg: \u22646%")}
    </table>`;

  const focusHtml = focusNote
    ? `<div style="margin:16px 0;padding:14px 16px;border-radius:8px;background:#F0FDFA;border:1px solid rgba(8,145,178,0.2);">
        <p style="margin:0;font-size:13px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">This week's focus</p>
        <p style="margin:4px 0 0;font-size:13px;color:#5C6370;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(focusNote)}</p>
      </div>`
    : patientsNeedingAction > 0
      ? `<div style="margin:16px 0;padding:14px 16px;border-radius:8px;background:#F0FDFA;border:1px solid rgba(8,145,178,0.2);">
          <p style="margin:0;font-size:13px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">This week's focus</p>
          <p style="margin:4px 0 0;font-size:13px;color:#5C6370;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">${patientsNeedingAction} patient${patientsNeedingAction === 1 ? "" : "s"} in your caseload haven't rebooked.</p>
        </div>`
      : "";

  const winHtml = winNote
    ? `<div style="margin:16px 0;padding:14px 16px;border-radius:8px;background:#F0FDF4;border:1px solid rgba(5,150,105,0.2);">
        <p style="margin:0;font-size:13px;color:#059669;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">\u2713 ${escHtml(winNote)}</p>
      </div>`
    : "";

  const body = `
    <!-- Greeting -->
    <p style="margin:0;font-size:15px;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Hi ${escHtml(firstName)},</p>
    <p style="margin:8px 0 0;font-size:13px;color:#5C6370;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">Here's how your week looked.</p>

    <!-- Stats -->
    ${statsTable}

    <!-- Focus -->
    ${focusHtml}

    <!-- Win -->
    ${winHtml}

    <!-- CTA -->
    <div style="padding-top:8px;">
      <a href="${APP_URL}/dashboard" style="display:inline-block;padding:10px 20px;background:#1C54F2;color:#FFFFFF;font-size:13px;font-weight:600;border-radius:50px;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;">
        Open your dashboard \u2192
      </a>
    </div>`;

  return wrapEmailLayout(body, {
    subtitle: `Your week at ${clinicName} \u2014 ${weekLabel}`,
    accentColor: "#8B5CF6",
    moduleLabel: "Intelligence",
    footerNote: "Sent by StrydeOS",
    footerLinks: [
      { label: "Notification preferences", href: `${APP_URL}/settings` },
    ],
    signature: "system",
  });
}

export function buildClinicianDigestText(data: ClinicianDigestData): string {
  const { firstName, clinicName, weekLabel, stats, targets, patientsNeedingAction, focusNote, winNote } = data;

  let text = `Your week at ${clinicName} \u2014 ${weekLabel}\n\n`;
  text += `Hi ${firstName},\n\n`;
  text += `YOUR NUMBERS\n`;
  text += `Follow-up rate:  ${fmtRate(stats.followUpRate)}  (target: ${fmtRate(targets.followUpRate)} | UK avg: 4.0\u20135.5)\n`;
  text += `HEP compliance:  ${fmtPct(stats.hepRate)}  (target: ${fmtPct(targets.hepRate)} | UK avg: 70\u201385%)\n`;
  text += `Utilisation:     ${fmtPct(stats.utilisationRate)}  (target: ${fmtPct(targets.utilisationRate)} | UK avg: ~72%)\n`;
  text += `DNA rate:        ${fmtPct(stats.dnaRate)}  (target: \u2264${fmtPct(targets.dnaRate)} | UK avg: \u22646%)\n\n`;

  if (focusNote) {
    text += `THIS WEEK'S FOCUS\n${focusNote}\n\n`;
  } else if (patientsNeedingAction > 0) {
    text += `THIS WEEK'S FOCUS\n${patientsNeedingAction} patient${patientsNeedingAction === 1 ? "" : "s"} in your caseload haven't rebooked.\n\n`;
  }

  if (winNote) {
    text += `WIN\n${winNote}\n\n`;
  }

  text += `Open your dashboard: ${APP_URL}/dashboard\n`;
  text += textFooter({ footerNote: "Sent by StrydeOS" });
  return text;
}
