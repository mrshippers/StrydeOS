import { wrapEmailLayout, escHtml, textFooter } from "./layout";
import { getResend } from "@/lib/resend";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.strydeos.com";

export interface AvaDigestSummary {
  booked: number;
  callbacks: number;
  escalated: number;
  info: number;
  voicemail: number;
  total: number;
}

export interface AvaDigestCall {
  time: string;
  outcome: string;
  callerPhone: string;
  durationSeconds: number;
}

export interface AvaDigestData {
  clinicName: string;
  dateRange: string;
  summary: AvaDigestSummary;
  calls: AvaDigestCall[];
  dashboardUrl?: string;
}

const OUTCOME_LABELS: Record<string, string> = {
  booked: "Booked",
  follow_up_required: "Callback",
  escalated: "Escalated",
  resolved: "Info",
  voicemail: "Voicemail",
};

function outcomeColor(outcome: string): string {
  switch (outcome) {
    case "booked": return "#10B981";
    case "escalated": return "#EF4444";
    case "follow_up_required": return "#F59E0B";
    default: return "#6B7280";
  }
}

function chip(label: string, count: number, color: string): string {
  return `<td style="padding:0 6px;text-align:center;">
    <div style="display:inline-block;min-width:60px;padding:10px 14px;border-radius:8px;background:${escHtml(color)}14;border:1px solid ${escHtml(color)}33;">
      <div style="font-size:22px;font-weight:700;color:${escHtml(color)};font-family:'Outfit',Helvetica,Arial,sans-serif;line-height:1;">${count}</div>
      <div style="font-size:10px;font-weight:600;color:#6B7280;font-family:'Outfit',Helvetica,Arial,sans-serif;letter-spacing:0.06em;text-transform:uppercase;margin-top:4px;">${escHtml(label)}</div>
    </div>
  </td>`;
}

function buildBody(data: AvaDigestData): string {
  const { summary, calls, dateRange, clinicName } = data;
  const dashUrl = data.dashboardUrl ?? `${APP_URL}/receptionist`;

  const chipRow = `
    <table style="border-collapse:collapse;width:100%;margin:20px 0;">
      <tr>
        ${chip("Booked", summary.booked, "#10B981")}
        ${chip("Callbacks", summary.callbacks, "#F59E0B")}
        ${chip("Escalated", summary.escalated, "#EF4444")}
        ${chip("Info", summary.info, "#6B7280")}
        ${chip("Voicemail", summary.voicemail, "#8B5CF6")}
      </tr>
    </table>`;

  const callRows = calls.slice(0, 20).map((c) => {
    const callTime = new Date(c.time).toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Europe/London",
    });
    const duration = c.durationSeconds > 0
      ? `${Math.floor(c.durationSeconds / 60)}m ${c.durationSeconds % 60}s`
      : "—";
    const maskedPhone = c.callerPhone.length >= 4
      ? `••• ${c.callerPhone.slice(-4)}`
      : c.callerPhone;
    const outcomeLabel = OUTCOME_LABELS[c.outcome] ?? c.outcome;
    const color = outcomeColor(c.outcome);
    return `
      <tr style="border-bottom:1px solid #F0EDE8;">
        <td style="padding:8px 8px 8px 0;font-size:12px;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(callTime)}</td>
        <td style="padding:8px;font-size:12px;font-family:'Outfit',Helvetica,Arial,sans-serif;">
          <span style="display:inline-block;padding:2px 8px;border-radius:50px;background:${escHtml(color)}14;color:${escHtml(color)};font-size:11px;font-weight:600;">${escHtml(outcomeLabel)}</span>
        </td>
        <td style="padding:8px;font-size:12px;color:#6B7280;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(maskedPhone)}</td>
        <td style="padding:8px 0 8px 8px;font-size:12px;color:#6B7280;text-align:right;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(duration)}</td>
      </tr>`;
  }).join("");

  const callTable = calls.length > 0 ? `
    <h3 style="margin:24px 0 12px;font-size:13px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;text-transform:uppercase;letter-spacing:0.06em;">Recent calls</h3>
    <table style="border-collapse:collapse;width:100%;">
      <thead>
        <tr style="border-bottom:2px solid #E2DFDA;">
          <th style="padding:6px 8px 6px 0;font-size:11px;color:#6B7280;font-weight:600;text-align:left;font-family:'Outfit',Helvetica,Arial,sans-serif;">Time</th>
          <th style="padding:6px 8px;font-size:11px;color:#6B7280;font-weight:600;text-align:left;font-family:'Outfit',Helvetica,Arial,sans-serif;">Outcome</th>
          <th style="padding:6px 8px;font-size:11px;color:#6B7280;font-weight:600;text-align:left;font-family:'Outfit',Helvetica,Arial,sans-serif;">Caller</th>
          <th style="padding:6px 0 6px 8px;font-size:11px;color:#6B7280;font-weight:600;text-align:right;font-family:'Outfit',Helvetica,Arial,sans-serif;">Duration</th>
        </tr>
      </thead>
      <tbody>${callRows}</tbody>
    </table>` : `
    <p style="margin:20px 0;font-size:13px;color:#6B7280;font-family:'Outfit',Helvetica,Arial,sans-serif;">No calls recorded in this period.</p>`;

  return `
    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(clinicName)}</p>
    <p style="margin:0 0 16px;font-size:13px;color:#6B7280;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(dateRange)} &middot; ${summary.total} call${summary.total !== 1 ? "s" : ""} handled by Ava</p>
    ${chipRow}
    ${callTable}
    <div style="margin-top:28px;text-align:center;">
      <a href="${escHtml(dashUrl)}" style="display:inline-block;padding:11px 22px;background:#1C54F2;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;font-family:'Outfit',Helvetica,Arial,sans-serif;">View all in Ava dashboard</a>
    </div>`;
}

export function buildAvaDigestEmail(data: AvaDigestData): { html: string; text: string } {
  const html = wrapEmailLayout(buildBody(data), {
    subtitle: data.dateRange,
    accentColor: "#1C54F2",
    moduleLabel: "Ava",
    footerNote: "Powered by StrydeOS Ava",
    unsubscribeType: "ava_digest",
  });

  const { summary } = data;
  const text = [
    `Ava Daily Digest — ${data.clinicName}`,
    data.dateRange,
    "",
    `Booked: ${summary.booked}  |  Callbacks: ${summary.callbacks}  |  Escalated: ${summary.escalated}  |  Info: ${summary.info}  |  Voicemail: ${summary.voicemail}`,
    `Total: ${summary.total} call${summary.total !== 1 ? "s" : ""}`,
    "",
    ...data.calls.slice(0, 20).map((c) => {
      const t = new Date(c.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Europe/London" });
      const masked = c.callerPhone.length >= 4 ? `••• ${c.callerPhone.slice(-4)}` : c.callerPhone;
      const label = OUTCOME_LABELS[c.outcome] ?? c.outcome;
      return `${t}  ${label.padEnd(10)}  ${masked}`;
    }),
    "",
    `View in Ava dashboard: ${data.dashboardUrl ?? APP_URL + "/receptionist"}`,
    "",
    textFooter({ footerNote: "Powered by StrydeOS Ava", unsubscribeType: "ava_digest" }),
  ].join("\n");

  return { html, text };
}

export async function sendAvaDigestEmail(to: string, data: AvaDigestData): Promise<void> {
  const { html, text } = buildAvaDigestEmail(data);
  const resend = getResend();
  await resend.emails.send({
    from: "Ava at StrydeOS <ava@notifications.strydeos.com>",
    to,
    subject: `Ava digest — ${data.clinicName} · ${data.dateRange}`,
    html,
    text,
  });
}
