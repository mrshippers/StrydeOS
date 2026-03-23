import type { InsightEvent } from "@/types/insight-events";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "${APP_URL}";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#EF4444",
  warning: "#F59E0B",
  positive: "#059669",
};

export function buildUrgentAlertEmail(event: InsightEvent, clinicName: string): string {
  const sevColor = SEVERITY_COLORS[event.severity] ?? "#EF4444";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F1EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="padding:20px 24px;border-radius:12px 12px 0 0;background:#0B2545;">
      <img src="https://strydeos.com/logo-white.png" alt="StrydeOS" width="100" style="margin-bottom:8px;">
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.6);">Urgent Alert — ${escHtml(clinicName)}</p>
    </div>

    <!-- Content -->
    <div style="padding:24px;background:#FFFFFF;border-radius:0 0 12px 12px;border:1px solid #E2DFDA;border-top:none;">

      <!-- Severity indicator -->
      <div style="margin-bottom:20px;padding:16px;border-radius:8px;border-left:4px solid ${sevColor};background:#FAFAFA;">
        <p style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:#0B2545;line-height:1.4;">${escHtml(event.title)}</p>
        <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.5;">${escHtml(event.description)}</p>
      </div>

      <!-- Suggested action -->
      <div style="margin-bottom:20px;padding:14px 16px;border-radius:8px;background:#F2F1EE;">
        <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#5C6370;">WHAT TO DO</p>
        <p style="margin:0;font-size:14px;font-weight:600;color:#0B2545;">${escHtml(event.suggestedAction)}</p>
      </div>

      ${event.revenueImpact ? `
      <p style="margin:0 0 20px 0;font-size:13px;font-weight:600;color:#EF4444;">Estimated revenue impact: ~£${event.revenueImpact.toLocaleString()}</p>
      ` : ""}

      <!-- CTA -->
      <div style="text-align:center;padding-top:8px;">
        <a href="${APP_URL}/intelligence" style="display:inline-block;padding:12px 28px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">View in Intelligence →</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px;text-align:center;">
      <p style="margin:0 0 4px;font-size:11px;color:#5C6370;">Powered by StrydeOS Intelligence</p>
      <p style="margin:0;font-size:11px;color:#5C6370;">
        <a href="${APP_URL}/settings" style="color:#1C54F2;text-decoration:none;">Manage alerts</a>
        &nbsp;·&nbsp;
        <a href="${APP_URL}/settings?unsubscribe=urgent" style="color:#5C6370;text-decoration:none;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function buildUrgentAlertText(event: InsightEvent, clinicName: string): string {
  const lines = [
    `⚠️ URGENT ALERT — ${clinicName}`,
    "",
    event.title,
    "",
    event.description,
    "",
    `WHAT TO DO: ${event.suggestedAction}`,
  ];

  if (event.revenueImpact) {
    lines.push("", `Estimated revenue impact: ~£${event.revenueImpact.toLocaleString()}`);
  }

  lines.push(
    "",
    "View in Intelligence: ${APP_URL}/intelligence",
    "",
    "---",
    "Powered by StrydeOS Intelligence",
    "Manage alerts: ${APP_URL}/settings",
    "Unsubscribe: ${APP_URL}/settings?unsubscribe=urgent"
  );

  return lines.join("\n");
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
