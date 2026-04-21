/**
 * Send a test of each email type to a given address via Resend.
 * Usage: npx tsx scripts/test-emails.ts [recipient]
 * Default recipient: j.o.adu@hotmail.co.uk
 */

import { buildWelcomeEmail, buildWelcomeText } from "../src/lib/intelligence/emails/welcome";
import { buildStateOfClinicEmail, buildStateOfClinicText } from "../src/lib/intelligence/emails/state-of-clinic";
import { buildClinicianDigestEmail, buildClinicianDigestText } from "../src/lib/intelligence/emails/clinician-digest";

const TO = process.argv[2] ?? "j.o.adu@hotmail.co.uk";
const RESEND_KEY = process.env.RESEND_API_KEY;
if (!RESEND_KEY) {
  console.error("RESEND_API_KEY not set");
  process.exit(1);
}

async function send(subject: string, html: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "StrydeOS <noreply@strydeos.com>",
      to: [TO],
      subject,
      html,
      text,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log(`  ✓ sent — id: ${(body as { id?: string }).id}`);
  } else {
    console.error(`  ✗ failed (${res.status}):`, body);
  }
}

const CLINIC = "Spires Physiotherapy";
const WEEK = "14 Apr 2026";

async function main() {
  console.log(`Sending test emails to ${TO}\n`);

  // 1 — Invite (clinician)
  // The invite email is sent by /api/clinicians/invite — no builder in this repo yet.
  // Skipping here; test via the settings UI instead.

  // 2 — Welcome (clinic owner on provisioning)
  console.log("2. Welcome email...");
  await send(
    `${CLINIC} is live on StrydeOS`,
    buildWelcomeEmail("Joe", CLINIC, "https://portal.strydeos.com/login?welcome=1&token=test"),
    buildWelcomeText("Joe", CLINIC, "https://portal.strydeos.com/login?welcome=1&token=test"),
  );

  // 3 — State of clinic (owner weekly digest)
  console.log("3. State of clinic digest...");
  await send(
    `${CLINIC} — Week of ${WEEK}`,
    buildStateOfClinicEmail({
      clinicName: CLINIC,
      weekLabel: WEEK,
      topEvents: [
        {
          id: "evt-1",
          clinicId: "spires",
          type: "CLINICIAN_FOLLOWUP_DROP" as const,
          severity: "warning" as const,
          title: "Andrew's follow-up rate dropped to 2.4 this week",
          description: "Below the clinic target of 4.0. 3 patients left without a follow-up booking.",
          suggestedAction: "Review Andrew's end-of-session workflow — prompt booking before checkout.",
          revenueImpact: 420,
          ownerNarrative: null,
          actionTarget: "owner" as const,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
        {
          id: "evt-2",
          clinicId: "spires",
          type: "TREATMENT_COMPLETION_WIN" as const,
          severity: "positive" as const,
          title: "Max's HEP compliance hit 72% — up from 54%",
          description: "Above clinic target of 70% for the first time this quarter.",
          suggestedAction: "Share Max's approach with the wider team.",
          ownerNarrative: null,
          actionTarget: "owner" as const,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
      ],
      currentStats: {
        followUpRate: 3.1,
        dnaRate: 0.06,
        utilisationRate: 0.78,
        treatmentCompletionRate: 0.64,
      },
      previousStats: {
        followUpRate: 3.4,
        dnaRate: 0.05,
        utilisationRate: 0.75,
        treatmentCompletionRate: 0.61,
      },
    }),
    buildStateOfClinicText({
      clinicName: CLINIC,
      weekLabel: WEEK,
      topEvents: [
        {
          id: "evt-1",
          clinicId: "spires",
          type: "CLINICIAN_FOLLOWUP_DROP" as const,
          severity: "warning" as const,
          title: "Andrew's follow-up rate dropped to 2.4 this week",
          description: "Below the clinic target of 4.0. 3 patients left without a follow-up booking.",
          suggestedAction: "Review Andrew's end-of-session workflow.",
          revenueImpact: 420,
          ownerNarrative: null,
          actionTarget: "owner" as const,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
      ],
      currentStats: {
        followUpRate: 3.1,
        dnaRate: 0.06,
        utilisationRate: 0.78,
        treatmentCompletionRate: 0.64,
      },
      previousStats: {
        followUpRate: 3.4,
        dnaRate: 0.05,
        utilisationRate: 0.75,
        treatmentCompletionRate: 0.61,
      },
    }),
  );

  // 4 — Clinician digest (sent to individual clinician)
  console.log("4. Clinician digest...");
  await send(
    `Your week at ${CLINIC} — ${WEEK}`,
    buildClinicianDigestEmail({
      firstName: "Andrew",
      clinicName: CLINIC,
      weekLabel: WEEK,
      stats: { followUpRate: 2.4, hepRate: 0.38, utilisationRate: 0.74, dnaRate: 0.07 },
      targets: { followUpRate: 4.0, hepRate: 0.80, utilisationRate: 0.80, dnaRate: 0.05 },
      patientsNeedingAction: 4,
      focusNote: "4 patients from this week haven't rebooked. Thursday DNAs are running higher than your Monday/Wednesday slots.",
      winNote: "Your Tuesday utilisation hit 100% — fully booked for the first time this quarter.",
    }),
    buildClinicianDigestText({
      firstName: "Andrew",
      clinicName: CLINIC,
      weekLabel: WEEK,
      stats: { followUpRate: 2.4, hepRate: 0.38, utilisationRate: 0.74, dnaRate: 0.07 },
      targets: { followUpRate: 4.0, hepRate: 0.80, utilisationRate: 0.80, dnaRate: 0.05 },
      patientsNeedingAction: 4,
      focusNote: "4 patients from this week haven't rebooked. Thursday DNAs are running higher than your Monday/Wednesday slots.",
      winNote: "Your Tuesday utilisation hit 100% — fully booked for the first time this quarter.",
    }),
  );

  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
