/**
 * Export individual email template HTML files.
 * Run: npx tsx scripts/export-emails.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { buildInviteEmail } from "../src/lib/intelligence/emails/invite";
import { buildUrgentAlertEmail } from "../src/lib/intelligence/emails/urgent-alert";
import { buildStateOfClinicEmail } from "../src/lib/intelligence/emails/state-of-clinic";
import { buildClinicianDigestEmail } from "../src/lib/intelligence/emails/clinician-digest";
import type { InsightEvent } from "../src/types/insight-events";

const outDir = "/Users/joa/Desktop/stryde email comms";

const mockEvent: InsightEvent = {
  id: "evt_001",
  type: "REVENUE_LEAK_DETECTED",
  severity: "critical",
  title: "Follow-up drop: Andrew's rebooking rate fell 18% this week",
  description: "Andrew's follow-up rate dropped from 4.2 to 3.4.",
  ownerNarrative: "Andrew saw 33 patients this week but only 27 had follow-ups booked. The 6 missed rebookings represent approximately \u00A3540 in lost downstream revenue. His Thursday afternoon clinic had the highest drop-off rate \u2014 3 of the 6 gaps came from that session.",
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

const templates = [
  {
    name: "1-invite",
    html: buildInviteEmail("https://portal.strydeos.com/login?token=abc123"),
  },
  {
    name: "2-urgent-alert",
    html: buildUrgentAlertEmail(mockEvent, "Spires Physiotherapy"),
  },
  {
    name: "3-state-of-clinic",
    html: buildStateOfClinicEmail({
      clinicName: "Spires Physiotherapy",
      weekLabel: "7 Apr 2026",
      topEvents: [mockEvent, mockWarning],
      currentStats: {
        followUpRate: 3.8,
        dnaRate: 0.082,
        utilisationRate: 0.74,
        courseCompletionRate: 0.68,
      },
      previousStats: {
        followUpRate: 4.2,
        dnaRate: 0.055,
        utilisationRate: 0.71,
        courseCompletionRate: 0.72,
      },
    }),
  },
  {
    name: "4-clinician-digest",
    html: buildClinicianDigestEmail({
      firstName: "Andrew",
      clinicName: "Spires Physiotherapy",
      weekLabel: "7 Apr 2026",
      stats: { followUpRate: 3.4, hepRate: 0.82, utilisationRate: 0.78, dnaRate: 0.045 },
      targets: { followUpRate: 4.0, hepRate: 0.85, utilisationRate: 0.75, dnaRate: 0.06 },
      patientsNeedingAction: 6,
      focusNote: "Your Thursday afternoon clinic had the most rebooking gaps this week \u2014 3 of 6 missed follow-ups came from that session.",
      winNote: "HEP compliance is at 82%, up from 76% last week. Keep it going.",
    }),
  },
];

for (const t of templates) {
  const path = join(outDir, `${t.name}.html`);
  writeFileSync(path, t.html, "utf-8");
  console.log(`Written: ${path}`);
}
