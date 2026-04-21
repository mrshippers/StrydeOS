/**
 * Email template preview generator.
 *
 * Run: npx tsx scripts/preview-emails.ts
 * Opens: scripts/email-preview.html (all templates side by side)
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { buildInviteEmail } from "../src/lib/intelligence/emails/invite";
import { buildUrgentAlertEmail } from "../src/lib/intelligence/emails/urgent-alert";
import { buildStateOfClinicEmail } from "../src/lib/intelligence/emails/state-of-clinic";
import { buildClinicianDigestEmail } from "../src/lib/intelligence/emails/clinician-digest";
import type { InsightEvent } from "../src/types/insight-events";

// ── Mock data ──────────────────────────────────────────────────

const mockEvent: InsightEvent = {
  id: "evt_001",
  type: "REVENUE_LEAK_DETECTED",
  severity: "critical",
  title: "Follow-up drop: Andrew's rebooking rate fell 18% this week",
  description: "Andrew's follow-up rate dropped from 4.2 to 3.4 — 6 initial assessments had no follow-up booked within 7 days.",
  ownerNarrative: "Andrew saw 33 patients this week but only 27 had follow-ups booked. The 6 missed rebookings represent approximately £540 in lost downstream revenue. His Thursday afternoon clinic had the highest drop-off rate — 3 of the 6 gaps came from that session.",
  suggestedAction: "Review Andrew's Thursday afternoon caseload and discuss rebooking workflow.",
  revenueImpact: 540,
  clinicianId: "andrew_001",
  clinicianName: "Andrew",
  detectedAt: new Date().toISOString(),
};

const mockWarning: InsightEvent = {
  id: "evt_002",
  type: "DNA_SPIKE",
  severity: "warning",
  title: "DNA rate above target for 2 consecutive weeks",
  description: "Clinic DNA rate is 8.2% vs 6% target.",
  ownerNarrative: null,
  suggestedAction: "Enable SMS reminders 24hr before appointments via Pulse.",
  clinicianId: "max_001",
  clinicianName: "Max",
  detectedAt: new Date().toISOString(),
};

// ── Generate all templates ─────────────────────────────────────

const templates = [
  {
    name: "Clinician Invite",
    html: buildInviteEmail("https://app.strydeos.com/login?token=abc123"),
  },
  {
    name: "Urgent Alert",
    html: buildUrgentAlertEmail(mockEvent, "Spires Physiotherapy"),
  },
  {
    name: "State of Clinic (Weekly Digest)",
    html: buildStateOfClinicEmail({
      clinicName: "Spires Physiotherapy",
      weekLabel: "7 Apr 2026",
      topEvents: [mockEvent, mockWarning],
      currentStats: {
        followUpRate: 3.8,
        dnaRate: 0.082,
        utilisationRate: 0.74,
        treatmentCompletionRate: 0.68,
      },
      previousStats: {
        followUpRate: 4.2,
        dnaRate: 0.055,
        utilisationRate: 0.71,
        treatmentCompletionRate: 0.72,
      },
    }),
  },
  {
    name: "Clinician Weekly Digest",
    html: buildClinicianDigestEmail({
      firstName: "Andrew",
      clinicName: "Spires Physiotherapy",
      weekLabel: "7 Apr 2026",
      stats: {
        followUpRate: 3.4,
        hepRate: 0.82,
        utilisationRate: 0.78,
        dnaRate: 0.045,
      },
      targets: {
        followUpRate: 4.0,
        hepRate: 0.85,
        utilisationRate: 0.75,
        dnaRate: 0.06,
      },
      patientsNeedingAction: 6,
      focusNote: "Your Thursday afternoon clinic had the most rebooking gaps this week — 3 of 6 missed follow-ups came from that session.",
      winNote: "HEP compliance is at 82%, up from 76% last week. Keep it going.",
    }),
  },
];

// ── Build preview page ─────────────────────────────────────────

const previewPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>StrydeOS Email Templates Preview</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Outfit', sans-serif; background: #0B2545; color: white; padding: 40px; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .subtitle { font-size: 14px; color: rgba(255,255,255,0.4); margin-bottom: 40px; }
    .template { margin-bottom: 60px; }
    .template-label { font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #4B8BF5; margin-bottom: 12px; }
    .frame-wrapper { background: #F2F1EE; border-radius: 12px; padding: 0; overflow: hidden; }
    iframe { width: 100%; border: none; min-height: 600px; }
  </style>
</head>
<body>
  <h1>StrydeOS Email Templates</h1>
  <p class="subtitle">Brand-consistent transactional email previews. Generated ${new Date().toISOString().slice(0, 10)}.</p>
  ${templates
    .map(
      (t, i) => `
  <div class="template">
    <div class="template-label">${i + 1}. ${t.name}</div>
    <div class="frame-wrapper">
      <iframe srcdoc="${t.html.replace(/"/g, "&quot;").replace(/'/g, "&#39;")}"></iframe>
    </div>
  </div>`
    )
    .join("")}
</body>
</html>`;

const outPath = join(__dirname, "email-preview.html");
writeFileSync(outPath, previewPage, "utf-8");
console.log(`Preview written to: ${outPath}`);
console.log("Open in a browser to inspect all templates.");
