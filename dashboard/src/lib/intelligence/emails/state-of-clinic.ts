import type { InsightEvent } from "@/types/insight-events";

interface DigestData {
  clinicName: string;
  weekLabel: string;
  topEvents: InsightEvent[];
  currentStats: Record<string, unknown> | null;
  previousStats: Record<string, unknown> | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#EF4444",
  warning: "#F59E0B",
  positive: "#059669",
};

function delta(current: number | undefined, previous: number | undefined): string {
  if (current == null || previous == null) return "";
  const diff = current - previous;
  if (diff === 0) return " →";
  const arrow = diff > 0 ? "↑" : "↓";
  const isPercent = current <= 1 && previous <= 1;
  const formatted = isPercent
    ? `${Math.abs(Math.round(diff * 100))}pp`
    : Math.abs(Math.round(diff * 10) / 10).toString();
  return ` ${arrow} ${formatted}`;
}

function fmtPct(val: number | undefined): string {
  if (val == null) return "—";
  return `${Math.round(val * 100)}%`;
}

function fmtRate(val: number | undefined): string {
  if (val == null) return "—";
  return val.toFixed(1);
}

export function buildStateOfClinicEmail(data: DigestData): string {
  const { clinicName, weekLabel, topEvents, currentStats, previousStats } = data;

  const headlineEvent = topEvents[0];
  const headlineHtml = headlineEvent
    ? `<p style="margin:0 0 8px 0;font-size:18px;font-weight:700;color:#0B2545;line-height:1.4;">${escHtml(headlineEvent.title)}</p>`
    : `<p style="margin:0 0 8px 0;font-size:18px;font-weight:700;color:#059669;line-height:1.4;">No alerts this week. Your metrics are within target across the board.</p>`;

  const eventsHtml = topEvents
    .map(
      (e) => `
        <div style="margin-bottom:16px;padding:16px;border-radius:8px;border:1px solid #E2DFDA;background:#FFFFFF;">
          <div style="display:flex;align-items:center;margin-bottom:8px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${SEVERITY_COLORS[e.severity] ?? "#5C6370"};margin-right:8px;"></span>
            <span style="font-size:14px;font-weight:600;color:#0B2545;">${escHtml(e.title)}</span>
          </div>
          <p style="margin:0 0 8px 0;font-size:13px;color:#5C6370;line-height:1.5;">${escHtml(e.description)}</p>
          <div style="padding:10px 12px;border-radius:6px;background:#F2F1EE;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#0B2545;">→ ${escHtml(e.suggestedAction)}</p>
          </div>
          ${e.revenueImpact ? `<p style="margin:8px 0 0 0;font-size:12px;font-weight:600;color:#EF4444;">Estimated impact: ~£${e.revenueImpact.toLocaleString()}</p>` : ""}
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

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F1EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="padding:24px;border-radius:12px 12px 0 0;background:#0B2545;text-align:center;">
      <img src="https://strydeos.com/logo-white.png" alt="StrydeOS" width="120" style="margin-bottom:12px;">
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.7);">${escHtml(clinicName)} — Week of ${escHtml(weekLabel)}</p>
    </div>

    <!-- Content -->
    <div style="padding:24px;background:#FFFFFF;border-radius:0 0 12px 12px;border:1px solid #E2DFDA;border-top:none;">

      <!-- Headline -->
      <div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #E2DFDA;">
        ${headlineHtml}
      </div>

      <!-- Top actions -->
      ${topEvents.length > 0 ? `
      <div style="margin-bottom:24px;">
        <p style="margin:0 0 12px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#5C6370;">TOP ACTIONS THIS WEEK</p>
        ${eventsHtml}
      </div>
      ` : ""}

      <!-- Quick stats -->
      <div style="margin-bottom:16px;">
        <p style="margin:0 0 12px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#5C6370;">QUICK STATS</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="padding:12px;text-align:center;border:1px solid #E2DFDA;border-radius:6px;width:25%;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#0B2545;">${fmtRate(curFollowUp)}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#5C6370;">Follow-up${delta(curFollowUp, prevFollowUp)}</p>
            </td>
            <td style="padding:12px;text-align:center;border:1px solid #E2DFDA;width:25%;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#0B2545;">${fmtPct(curDna)}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#5C6370;">DNA Rate${delta(curDna, prevDna)}</p>
            </td>
            <td style="padding:12px;text-align:center;border:1px solid #E2DFDA;width:25%;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#0B2545;">${fmtPct(curUtil)}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#5C6370;">Utilisation${delta(curUtil, prevUtil)}</p>
            </td>
            <td style="padding:12px;text-align:center;border:1px solid #E2DFDA;width:25%;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#0B2545;">${fmtPct(curCompletion)}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#5C6370;">Completion${delta(curCompletion, prevCompletion)}</p>
            </td>
          </tr>
        </table>
      </div>

      <!-- CTA -->
      <div style="text-align:center;padding-top:16px;">
        <a href="https://app.strydeos.com/dashboard" style="display:inline-block;padding:12px 28px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">View full dashboard →</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px;text-align:center;">
      <p style="margin:0 0 4px;font-size:11px;color:#5C6370;">Powered by StrydeOS Intelligence</p>
      <p style="margin:0;font-size:11px;color:#5C6370;">
        <a href="https://app.strydeos.com/settings" style="color:#1C54F2;text-decoration:none;">Manage preferences</a>
        &nbsp;·&nbsp;
        <a href="https://app.strydeos.com/settings?unsubscribe=digest" style="color:#5C6370;text-decoration:none;">Unsubscribe</a>
      </p>
      <p style="margin:8px 0 0;font-size:11px;color:#5C6370;">hello@strydeos.com</p>
    </div>
  </div>
</body>
</html>`;
}

export function buildStateOfClinicText(data: DigestData): string {
  const { clinicName, weekLabel, topEvents, currentStats, previousStats: _prev } = data;

  const lines: string[] = [
    `${clinicName} — Week of ${weekLabel}`,
    "",
    "═══════════════════════════════════",
    "",
  ];

  if (topEvents.length > 0) {
    lines.push(topEvents[0].title, "");
    lines.push("TOP ACTIONS THIS WEEK", "");
    for (const e of topEvents) {
      lines.push(`• ${e.title}`);
      lines.push(`  ${e.description}`);
      lines.push(`  → ${e.suggestedAction}`);
      if (e.revenueImpact) lines.push(`  Estimated impact: ~£${e.revenueImpact.toLocaleString()}`);
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
  lines.push("View dashboard: https://app.strydeos.com/dashboard");
  lines.push("");
  lines.push("---");
  lines.push("Powered by StrydeOS Intelligence");
  lines.push("Manage preferences: https://app.strydeos.com/settings");
  lines.push("Unsubscribe: https://app.strydeos.com/settings?unsubscribe=digest");
  lines.push("hello@strydeos.com");

  return lines.join("\n");
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
