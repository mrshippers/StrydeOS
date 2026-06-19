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

// SAMPLE DATA ONLY \u2014 illustrative, fictional clinician. Never use a real
// colleague's name or real performance figures in template fixtures.
const mockEvent: InsightEvent = {
  id: "evt_001",
  type: "REVENUE_LEAK_DETECTED",
  severity: "critical",
  title: "Follow-up drop: a clinician's rebooking rate fell this week",
  description: "Sample clinician's follow-up rate dropped week on week.",
  ownerNarrative: "Sample figures for layout only. The live digest renders each clinician's real rebooking gaps and downstream revenue impact from metrics_weekly \u2014 nothing here is hardcoded.",
  suggestedAction: "Review the flagged clinic session and discuss rebooking workflow.",
  revenueImpact: 540,
  clinicianId: "sample_001",
  clinicianName: "Sample Clinician",
  detectedAt: new Date().toISOString(),
};

const mockWarning: InsightEvent = {
  id: "evt_002",
  type: "DNA_SPIKE",
  severity: "warning",
  title: "DNA rate above target for 2 consecutive weeks",
  description: "Clinic DNA rate is above the 6% target (sample value).",
  ownerNarrative: null,
  suggestedAction: "Enable SMS reminders 24hr before appointments via Pulse.",
  clinicianId: "sample_002",
  clinicianName: "Sample Clinician",
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
      firstName: "Sample",
      clinicName: "Spires Physiotherapy",
      weekLabel: "7 Apr 2026",
      stats: { followUpRate: 3.4, hepRate: 0.82, utilisationRate: 0.78, dnaRate: 0.045 },
      targets: { followUpRate: 4.0, hepRate: 0.85, utilisationRate: 0.75, dnaRate: 0.06 },
      patientsNeedingAction: 6,
      focusNote: "Sample focus note for layout only \u2014 the live digest renders each clinician's real coaching focus.",
      winNote: "Sample win note for layout only \u2014 the live digest renders each clinician's real win.",
    }),
  },
];

for (const t of templates) {
  const path = join(outDir, `${t.name}.html`);
  writeFileSync(path, t.html, "utf-8");
  console.log(`Written: ${path}`);
}
