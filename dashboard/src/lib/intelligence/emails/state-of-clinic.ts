import type { InsightEvent } from "@/types/insight-events";
import { wrapEmailLayout, escHtml, textFooter } from "./layout";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.strydeos.com";

interface DigestData {
  clinicName: string;
  weekLabel: string;
  topEvents: InsightEvent[];
  currentStats: Record<string, unknown> | null;
  previousStats: Record<string, unknown> | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#E8913A",
  warning: "#F59E0B",
  positive: "#059669",
};

function delta(current: number | undefined, previous: number | undefined): string {
  if (current == null || previous == null) return "";
  const diff = current - previous;
  if (diff === 0) return " \u2192";
  const arrow = diff > 0 ? "\u2191" : "\u2193";
  const isPercent = current <= 1 && previous <= 1;
  const formatted = isPercent
    ? `${Math.abs(Math.round(diff * 100))}pp`
    : Math.abs(Math.round(diff * 10) / 10).toString();
  return ` ${arrow} ${formatted}`;
}

function fmtPct(val: number | undefined): string {
  if (val == null) return "\u2014";
  return `${Math.round(val * 100)}%`;
}

function fmtRate(val: number | undefined): string {
  if (val == null) return "\u2014";
  return val.toFixed(1);
}

export function buildStateOfClinicEmail(data: DigestData): string {
  const { clinicName, weekLabel, topEvents, currentStats, previousStats } = data;

  const headlineEvent = topEvents[0];
  const headlineHtml = headlineEvent
    ? `<p style="margin:0 0 8px 0;font-size:18px;font-weight:700;color:#0B2545;line-height:1.4;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(headlineEvent.title)}</p>`
    : `<p style="margin:0 0 8px 0;font-size:18px;font-weight:700;color:#059669;line-height:1.4;font-family:'Outfit',Helvetica,Arial,sans-serif;">No alerts this week. Your metrics are within target across the board.</p>`;

  const eventsHtml = topEvents
    .map(
      (e) => `
        <div style="margin-bottom:16px;padding:16px;border-radius:8px;border:1px solid #E2DFDA;background:#FFFFFF;">
          <div style="margin-bottom:8px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${SEVERITY_COLORS[e.severity] ?? "#5C6370"};margin-right:8px;vertical-align:middle;"></span>
            <span style="font-size:14px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;vertical-align:middle;">${escHtml(e.title)}</span>
          </div>
          <p style="margin:0 0 8px 0;font-size:13px;color:#5C6370;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(e.ownerNarrative ?? e.description)}</p>
          ${!e.ownerNarrative ? `<div style="padding:10px 12px;border-radius:6px;background:#F2F1EE;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">\u2192 ${escHtml(e.suggestedAction)}</p>
          </div>` : ""}
          ${e.revenueImpact ? `<p style="margin:8px 0 0 0;font-size:12px;font-weight:600;color:#EF4444;font-family:'Outfit',Helvetica,Arial,sans-serif;">Estimated impact: ~\u00A3${e.revenueImpact.toLocaleString()}</p>` : ""}
        </div>`
    )
    .join("");

  const curFollowUp = currentStats?.followUpRate as number | undefined;
  const prevFollowUp = previousStats?.followUpRate as number | undefined;
  const curDna = currentStats?.dnaRate as number | undefined;
  const prevDna = previousStats?.dnaRate as number | undefined;
  const curUtil = currentStats?.utilisationRate as number | undefined;
  const prevUtil = previousStats?.utilisationRate as number | undefined;
  const curCompletion = currentStats?.courseCompletionRate as number | undefined;
  const prevCompletion = previousStats?.courseCompletionRate as number | undefined;

  const body = `
    <!-- Headline -->
    <div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #E2DFDA;">
      ${headlineHtml}
    </div>

    <!-- Top actions -->
    ${topEvents.length > 0 ? `
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 12px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#5C6370;font-family:'Outfit',Helvetica,Arial,sans-serif;">TOP ACTIONS THIS WEEK</p>
      ${eventsHtml}
    </div>
    ` : ""}

    <!-- Quick stats -->
    <div style="margin-bottom:16px;">
      <p style="margin:0 0 12px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#5C6370;font-family:'Outfit',Helvetica,Arial,sans-serif;">QUICK STATS</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:12px;text-align:center;border:1px solid #E2DFDA;border-radius:6px;width:25%;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">${fmtRate(curFollowUp)}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#5C6370;font-family:'Outfit',Helvetica,Arial,sans-serif;">Follow-up${delta(curFollowUp, prevFollowUp)}</p>
          </td>
          <td style="padding:12px;text-align:center;border:1px solid #E2DFDA;width:25%;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">${fmtPct(curDna)}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#5C6370;font-family:'Outfit',Helvetica,Arial,sans-serif;">DNA Rate${delta(curDna, prevDna)}</p>
          </td>
          <td style="padding:12px;text-align:center;border:1px solid #E2DFDA;width:25%;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">${fmtPct(curUtil)}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#5C6370;font-family:'Outfit',Helvetica,Arial,sans-serif;">Utilisation${delta(curUtil, prevUtil)}</p>
          </td>
          <td style="padding:12px;text-align:center;border:1px solid #E2DFDA;width:25%;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">${fmtPct(curCompletion)}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#5C6370;font-family:'Outfit',Helvetica,Arial,sans-serif;">Completion${delta(curCompletion, prevCompletion)}</p>
          </td>
        </tr>
      </table>
    </div>

    <!-- CTA -->
    <div style="text-align:center;padding-top:16px;">
      <a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 28px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;">View full dashboard \u2192</a>
    </div>`;

  return wrapEmailLayout(body, {
    subtitle: `${clinicName} \u2014 Week of ${weekLabel}`,
    accentColor: "#8B5CF6",
    moduleLabel: "Intelligence",
    unsubscribeType: "digest",
    footerNote: "Powered by StrydeOS Intelligence",
    signature: "founder",
  });
}

export function buildStateOfClinicText(data: DigestData): string {
  const { clinicName, weekLabel, topEvents, currentStats, previousStats: _prev } = data;

  const lines: string[] = [
    `${clinicName} \u2014 Week of ${weekLabel}`,
    "",
    "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
    "",
  ];

  if (topEvents.length > 0) {
    lines.push(topEvents[0].title, "");
    lines.push("TOP ACTIONS THIS WEEK", "");
    for (const e of topEvents) {
      lines.push(`\u2022 ${e.title}`);
      lines.push(`  ${e.ownerNarrative ?? e.description}`);
      if (!e.ownerNarrative) lines.push(`  \u2192 ${e.suggestedAction}`);
      if (e.revenueImpact) lines.push(`  Estimated impact: ~\u00A3${e.revenueImpact.toLocaleString()}`);
      lines.push("");
    }
  } else {
    lines.push("No alerts this week. Your metrics are within target across the board.", "");
  }

  lines.push("QUICK STATS", "");

  const curFollowUp = currentStats?.followUpRate as number | undefined;
  const curDna = currentStats?.dnaRate as number | undefined;
  const curUtil = currentStats?.utilisationRate as number | undefined;
  const curCompletion = currentStats?.courseCompletionRate as number | undefined;

  lines.push(`Follow-up Rate: ${fmtRate(curFollowUp)}`);
  lines.push(`DNA Rate: ${fmtPct(curDna)}`);
  lines.push(`Utilisation: ${fmtPct(curUtil)}`);
  lines.push(`Course Completion: ${fmtPct(curCompletion)}`);
  lines.push("");
  lines.push(`View dashboard: ${APP_URL}/dashboard`);
  lines.push("");
  lines.push(textFooter({ footerNote: "Powered by StrydeOS Intelligence", unsubscribeType: "digest" }));

  return lines.join("\n");
}
