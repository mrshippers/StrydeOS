import type { InsightEvent } from "@/types/insight-events";
import { wrapEmailLayout, escHtml, textFooter } from "./layout";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#EF4444",
  warning: "#F59E0B",
  positive: "#059669",
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.strydeos.com";

export function buildUrgentAlertEmail(event: InsightEvent, clinicName: string): string {
  const sevColor = SEVERITY_COLORS[event.severity] ?? "#EF4444";

  const body = `
    <!-- Severity indicator -->
    <div style="margin-bottom:20px;padding:16px;border-radius:8px;border-left:4px solid ${sevColor};background:#FAFAFA;">
      <p style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:#0B2545;line-height:1.4;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(event.title)}</p>
      <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.5;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(event.ownerNarrative ?? event.description)}</p>
    </div>

    ${!event.ownerNarrative ? `
    <!-- Suggested action -->
    <div style="margin-bottom:20px;padding:14px 16px;border-radius:8px;background:#F2F1EE;">
      <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#5C6370;font-family:'Outfit',Helvetica,Arial,sans-serif;">WHAT TO DO</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(event.suggestedAction)}</p>
    </div>` : ""}

    ${event.revenueImpact ? `
    <p style="margin:0 0 20px 0;font-size:13px;font-weight:600;color:#EF4444;font-family:'Outfit',Helvetica,Arial,sans-serif;">Estimated revenue impact: ~\u00A3${event.revenueImpact.toLocaleString()}</p>
    ` : ""}

    <!-- CTA -->
    <div style="text-align:center;padding-top:8px;">
      <a href="${APP_URL}/intelligence" style="display:inline-block;padding:12px 28px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;">View in Intelligence \u2192</a>
    </div>`;

  return wrapEmailLayout(body, {
    subtitle: `Urgent Alert \u2014 ${clinicName}`,
    accentColor: "#EF4444",
    moduleLabel: "Intelligence",
    unsubscribeType: "urgent",
    footerNote: "Powered by StrydeOS Intelligence",
    footerLinks: [
      { label: "Manage alerts", href: `${APP_URL}/settings` },
      { label: "Unsubscribe", href: `${APP_URL}/settings?unsubscribe=urgent` },
    ],
  });
}

export function buildUrgentAlertText(event: InsightEvent, clinicName: string): string {
  const lines = [
    `URGENT ALERT \u2014 ${clinicName}`,
    "",
    event.title,
    "",
    event.ownerNarrative ?? event.description,
    "",
    ...(event.ownerNarrative ? [] : [`WHAT TO DO: ${event.suggestedAction}`]),
  ];

  if (event.revenueImpact) {
    lines.push("", `Estimated revenue impact: ~\u00A3${event.revenueImpact.toLocaleString()}`);
  }

  lines.push(
    "",
    `View in Intelligence: ${APP_URL}/intelligence`,
    "",
    textFooter({ footerNote: "Powered by StrydeOS Intelligence", unsubscribeType: "urgent" })
  );

  return lines.join("\n");
}
