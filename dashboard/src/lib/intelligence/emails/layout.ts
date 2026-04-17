/**
 * Shared email layout — brand-consistent wrapper for all StrydeOS transactional emails.
 *
 * Uses inline styles only (email client compatibility).
 * Brand tokens sourced from brand.ts / brand-identity-sheet.html.
 *
 * Colours: Navy #0B2545, Blue #1C54F2, Cloud #F2F1EE, Cream #FAF9F7, Border #E2DFDA
 * Typography: Outfit (via Google Fonts), system fallbacks for email clients that block web fonts
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.strydeos.com";

// Inline SVG Monolith mark — base64-encoded for email client compatibility.
// This is the canonical mark from monolith.svg, simplified for email.
const MONOLITH_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(`<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="c" x1="0.1" y1="0" x2="0.85" y2="1"><stop offset="0%" stop-color="#2E6BFF" stop-opacity="0.58"/><stop offset="100%" stop-color="#091D3E" stop-opacity="0.72"/></linearGradient><radialGradient id="r" cx="28%" cy="24%" r="60%"><stop offset="0%" stop-color="#6AABFF" stop-opacity="0.42"/><stop offset="100%" stop-color="#1C54F2" stop-opacity="0"/></radialGradient><linearGradient id="t" x1="0.05" y1="1" x2="0.35" y2="0"><stop offset="0%" stop-color="white" stop-opacity="0.55"/><stop offset="100%" stop-color="white" stop-opacity="0.97"/></linearGradient><clipPath id="p"><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath><clipPath id="a"><polygon points="35,52 57,40 57,20 35,20"/></clipPath></defs><rect width="100" height="100" rx="24" fill="url(#c)"/><rect width="100" height="100" rx="24" fill="url(#r)"/><rect x="35" y="20" width="22" height="60" rx="5" fill="white" fill-opacity="0.07"/><rect x="35" y="46" width="22" height="34" rx="5" fill="black" fill-opacity="0.10"/><g clip-path="url(#p)"><polyline points="32,80 46,72 60,80" stroke="white" stroke-opacity="0.20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><polyline points="32,72 46,64 60,72" stroke="white" stroke-opacity="0.42" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><polyline points="32,64 46,56 60,64" stroke="white" stroke-opacity="0.72" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g><rect x="35" y="20" width="22" height="60" rx="5" fill="url(#t)" clip-path="url(#a)"/><line x1="33" y1="52" x2="59" y2="39" stroke="white" stroke-width="1.2" stroke-opacity="0.55" stroke-linecap="round"/></svg>`).toString("base64")}`;

// ── Signature blocks ────────────────────────────────────────────

export interface SignatureOptions {
  name?: string;
  title?: string;
  company?: string;
  location?: string;
  url?: string;
}

const DEFAULT_SIGNATURE: SignatureOptions = {
  name: "Jamal",
  title: "Founder",
  company: "StrydeOS",
  location: "Spires Physiotherapy \u00B7 London",
  url: "strydeos.com",
};

/** Option A — Founder signature with Monolith mark + blue rule */
export function founderSignature(opts: SignatureOptions = {}): string {
  const { name, title, company, location, url } = { ...DEFAULT_SIGNATURE, ...opts };
  return `
    <div style="border-top:2px solid #1C54F2;padding-top:16px;margin-top:24px;display:flex;gap:14px;align-items:flex-start;">
      <img src="${MONOLITH_DATA_URI}" alt="StrydeOS" width="40" height="40" style="display:block;border:0;flex-shrink:0;">
      <div style="border-left:2px solid #1C54F2;padding-left:12px;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(name!)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#6B7280;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(title!)} \u00B7 ${escHtml(company!)}</p>
        ${location ? `<p style="margin:2px 0 0;font-size:12px;color:#6B7280;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(location)}</p>` : ""}
        ${url ? `<p style="margin:6px 0 0;font-size:12px;font-family:'Outfit',Helvetica,Arial,sans-serif;"><a href="https://${escHtml(url)}" style="color:#1C54F2;text-decoration:none;">${escHtml(url)}</a></p>` : ""}
      </div>
    </div>`;
}

/** Option A plain-text */
export function founderSignatureText(opts: SignatureOptions = {}): string {
  const { name, title, company, location, url } = { ...DEFAULT_SIGNATURE, ...opts };
  const lines = [`${name}`, `${title} \u00B7 ${company}`];
  if (location) lines.push(location);
  if (url) lines.push(url);
  return lines.join("\n");
}

/** Option B — System signature, centred with Monolith + wordmark */
export function systemSignature(): string {
  return `
    <div style="border-top:2px solid #1C54F2;padding-top:16px;margin-top:24px;text-align:center;">
      <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:6px;">
        <img src="${MONOLITH_DATA_URI}" alt="StrydeOS" width="24" height="24" style="display:inline-block;vertical-align:middle;border:0;">
        <span style="font-weight:700;font-size:14px;color:#0B2545;letter-spacing:-0.02em;font-family:'Outfit',Helvetica,Arial,sans-serif;">Stryde<span style="color:#1C54F2;">OS</span></span>
      </div>
      <p style="margin:0;font-size:11px;color:#6B7280;font-family:'Outfit',Helvetica,Arial,sans-serif;">The Clinic OS for private practice</p>
      <p style="margin:6px 0 0;font-size:11px;font-family:'Outfit',Helvetica,Arial,sans-serif;"><a href="https://strydeos.com" style="color:#1C54F2;text-decoration:none;">strydeos.com</a></p>
    </div>`;
}

// ── Layout options ──────────────────────────────────────────────

interface EmailLayoutOptions {
  /** Subtitle line beneath the logo (e.g. "Spires Physiotherapy — Week of 7 Apr") */
  subtitle?: string;
  /** Module accent colour for the header border. Default: Blue #1C54F2 */
  accentColor?: string;
  /** Module label shown as a small chip (e.g. "Intelligence", "Ava") */
  moduleLabel?: string;
  /** Footer links — defaults to settings + unsubscribe */
  footerLinks?: { label: string; href: string }[];
  /** Unsubscribe query param (e.g. "digest", "urgent"). Omit to hide unsubscribe. */
  unsubscribeType?: string;
  /** Footer note (e.g. "Powered by StrydeOS Intelligence") */
  footerNote?: string;
  /** Append a signature block to the body. "founder" | "system" | false */
  signature?: "founder" | "system" | false;
  /** Custom signature options (only used when signature === "founder") */
  signatureOptions?: SignatureOptions;
}

export function wrapEmailLayout(bodyHtml: string, options: EmailLayoutOptions = {}): string {
  const {
    subtitle,
    accentColor = "#1C54F2",
    moduleLabel,
    footerLinks,
    unsubscribeType,
    footerNote = "Powered by StrydeOS",
    signature = false,
    signatureOptions,
  } = options;

  const moduleBadge = moduleLabel
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:50px;background:${accentColor};color:#FFFFFF;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-left:10px;vertical-align:middle;">${escHtml(moduleLabel)}</span>`
    : "";

  const subtitleHtml = subtitle
    ? `<p style="margin:0;font-size:13px;color:rgba(255,255,255,0.55);font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(subtitle)}</p>`
    : "";

  const defaultFooterLinks = [
    { label: "Manage preferences", href: `${APP_URL}/settings` },
    ...(unsubscribeType
      ? [{ label: "Unsubscribe", href: `${APP_URL}/settings?unsubscribe=${unsubscribeType}` }]
      : []),
  ];
  const links = footerLinks ?? defaultFooterLinks;

  const footerLinksHtml = links
    .map(
      (l, i) =>
        `<a href="${escHtml(l.href)}" style="color:${i === links.length - 1 && unsubscribeType ? "#8B8B8B" : "#1C54F2"};text-decoration:none;font-size:11px;">${escHtml(l.label)}</a>`
    )
    .join(`<span style="color:#CCCCCC;margin:0 6px;">&middot;</span>`);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <title>StrydeOS</title>
  <!--[if mso]>
  <style>body,table,td{font-family:Helvetica,Arial,sans-serif !important;}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#F2F1EE;font-family:'Outfit',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- HEADER -->
    <div style="padding:28px 28px 24px;border-radius:12px 12px 0 0;background:#0B2545;border-bottom:3px solid ${accentColor};">
      <div style="margin-bottom:${subtitle ? "14px" : "0"};">
        <img src="${MONOLITH_DATA_URI}" alt="StrydeOS" width="36" height="36" style="display:inline-block;vertical-align:middle;border:0;">
        <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:'Outfit',Helvetica,Arial,sans-serif;font-weight:700;font-size:18px;letter-spacing:-0.02em;color:#FFFFFF;">Stryde<span style="color:#4B8BF5;">OS</span></span>
        ${moduleBadge}
      </div>
      ${subtitleHtml}
    </div>

    <!-- BODY -->
    <div style="padding:28px;background:#FFFFFF;border:1px solid #E2DFDA;border-top:none;border-radius:0 0 12px 12px;">
      ${bodyHtml}
      ${signature === "founder" ? founderSignature(signatureOptions) : signature === "system" ? systemSignature() : ""}
    </div>

    <!-- FOOTER -->
    <div style="padding:20px 8px;text-align:center;">
      <p style="margin:0 0 6px;font-size:11px;color:#8B8B8B;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escHtml(footerNote)}</p>
      <p style="margin:0;">${footerLinksHtml}</p>
    </div>
  </div>
</body>
</html>`;
}

/** Plain-text footer for text-only fallback emails */
export function textFooter(options: { footerNote?: string; unsubscribeType?: string } = {}): string {
  const { footerNote = "Powered by StrydeOS", unsubscribeType } = options;
  const lines = [
    "---",
    footerNote,
    `Manage preferences: ${APP_URL}/settings`,
  ];
  if (unsubscribeType) {
    lines.push(`Unsubscribe: ${APP_URL}/settings?unsubscribe=${unsubscribeType}`);
  }
  return lines.join("\n");
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { escHtml };
