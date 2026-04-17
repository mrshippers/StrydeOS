/**
 * Send test email sequence to jamal@spiresphysiotherapy.com
 *
 * Run: npx tsx scripts/send-test-emails.ts
 *
 * Sends all 5 email types with realistic mock data, set in May 2027.
 */

import { Resend } from "resend";
import { buildInviteEmail, buildInviteText } from "../src/lib/intelligence/emails/invite";
import { buildUrgentAlertEmail, buildUrgentAlertText } from "../src/lib/intelligence/emails/urgent-alert";
import { buildStateOfClinicEmail, buildStateOfClinicText } from "../src/lib/intelligence/emails/state-of-clinic";
import { buildClinicianDigestEmail, buildClinicianDigestText } from "../src/lib/intelligence/emails/clinician-digest";
import { wrapEmailLayout } from "../src/lib/intelligence/emails/layout";
import type { InsightEvent } from "../src/types/insight-events";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is required. Set it in your environment before running this script.");
}
const FROM = "StrydeOS <noreply@strydeos.com>";
const TO = "jamal@spiresphysiotherapy.com";

const resend = new Resend(RESEND_API_KEY);

// ── Mock data (May 2027 context) ───────────────────────────────

const mockCritical: InsightEvent = {
  id: "evt_may27_001",
  type: "REVENUE_LEAK_DETECTED",
  severity: "critical",
  title: "HEP assignment dropped below 70% across 3 clinicians",
  description: "Programme assignment rate fell to 67% this week.",
  ownerNarrative: "Three clinicians — Andrew, Sophie, and Ravi — assigned programmes to fewer than 70% of their patients this week. Andrew dropped from 88% to 64% (likely due to the Physitrack sync issue on Tuesday). Sophie and Ravi are consistent at 68–69%, suggesting a workflow gap rather than a technical issue. At \u00A345 per missed programme, the estimated downstream impact is \u00A3720.",
  suggestedAction: "Review programme assignment workflow with Andrew, Sophie, and Ravi during Thursday huddle.",
  revenueImpact: 720,
  clinicianId: "andrew_001",
  clinicianName: "Andrew",
  detectedAt: "2027-05-12T09:15:00Z",
};

const mockWarning: InsightEvent = {
  id: "evt_may27_002",
  type: "DNA_SPIKE",
  severity: "warning",
  title: "Monday morning DNA rate hit 12% (3 weeks running)",
  description: "Monday 9am–11am slots have a persistent DNA problem.",
  ownerNarrative: null,
  suggestedAction: "Enable Pulse SMS reminder sequence for Monday morning slots — 48hr + 2hr before appointment.",
  clinicianId: "max_001",
  clinicianName: "Max",
  detectedAt: "2027-05-12T10:00:00Z",
};

const mockPositive: InsightEvent = {
  id: "evt_may27_003",
  type: "NPS_IMPROVEMENT",
  severity: "positive",
  title: "Clinic NPS rose to 78 — highest since launch",
  description: "NPS improved from 72 to 78 this month.",
  ownerNarrative: "Your NPS jumped 6 points this month, driven by strong scores from patients seen by Sophie (NPS 84) and Ravi (NPS 81). Google Reviews are tracking alongside — 4 new 5-star reviews this week, all mentioning exercise programmes.",
  suggestedAction: "Consider sharing this with the team as positive reinforcement.",
  clinicianId: "sophie_001",
  clinicianName: "Sophie",
  detectedAt: "2027-05-12T11:00:00Z",
};

// ── Product Update email (May 2027) ────────────────────────────

function buildProductUpdateEmail(): string {
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Hi Jamal,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#5C6370;line-height:1.7;font-family:'Outfit',Helvetica,Arial,sans-serif;">
      Here's what shipped in May. Three things that matter for Spires:
    </p>

    <!-- Update 1 -->
    <div style="margin-bottom:24px;padding:20px;border-radius:8px;background:#F9F8F6;border:1px solid #E2DFDA;">
      <div style="margin-bottom:8px;">
        <span style="display:inline-block;padding:3px 10px;border-radius:50px;background:#8B5CF6;color:#FFFFFF;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Intelligence</span>
      </div>
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Clinician coaching notes</p>
      <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.6;font-family:'Outfit',Helvetica,Arial,sans-serif;">
        Weekly digests now include a personalised coaching note for each clinician — specific, constructive observations based on their data. No blame, just patterns. Andrew's Thursday afternoon gap has already been flagged twice; this makes those conversations easier.
      </p>
    </div>

    <!-- Update 2 -->
    <div style="margin-bottom:24px;padding:20px;border-radius:8px;background:#F9F8F6;border:1px solid #E2DFDA;">
      <div style="margin-bottom:8px;">
        <span style="display:inline-block;padding:3px 10px;border-radius:50px;background:#0891B2;color:#FFFFFF;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Pulse</span>
      </div>
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Smart rebooking reminders</p>
      <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.6;font-family:'Outfit',Helvetica,Arial,sans-serif;">
        Pulse now detects patients who haven't rebooked within 72 hours of their last session and sends a personalised SMS nudge. Early results from Spires: 14 of 22 nudged patients rebooked within 24 hours. This alone could recover \u00A3600+/month in lost follow-ups.
      </p>
    </div>

    <!-- Update 3 -->
    <div style="margin-bottom:24px;padding:20px;border-radius:8px;background:#F9F8F6;border:1px solid #E2DFDA;">
      <div style="margin-bottom:8px;">
        <span style="display:inline-block;padding:3px 10px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Ava</span>
      </div>
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">Multi-clinic call routing</p>
      <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.6;font-family:'Outfit',Helvetica,Arial,sans-serif;">
        Ava now supports per-clinic phone numbers with independent availability rules. Each clinic gets its own number, greeting, and booking calendar. No more shared voicemail boxes — patients hear the right clinic name from the first ring.
      </p>
    </div>

    <!-- Coming next -->
    <div style="margin-bottom:24px;padding-top:20px;border-top:1px solid #E2DFDA;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#5C6370;font-family:'Outfit',Helvetica,Arial,sans-serif;">COMING IN JUNE</p>
      <p style="margin:0;font-size:13px;color:#5C6370;line-height:1.7;font-family:'Outfit',Helvetica,Arial,sans-serif;">
        \u2022 <strong style="color:#0B2545;">Outcome measures</strong> — NPRS, PSFS, QuickDASH integration with per-patient tracking<br>
        \u2022 <strong style="color:#0B2545;">TM3 integration</strong> — Beta access for Blue Zinc clinics (finally)<br>
        \u2022 <strong style="color:#0B2545;">Google Reviews auto-request</strong> — Pulse triggers review requests after high-NPS sessions
      </p>
    </div>

    <!-- CTA -->
    <div style="text-align:center;padding-top:8px;">
      <a href="https://app.strydeos.com/dashboard" style="display:inline-block;padding:12px 28px;border-radius:50px;background:#1C54F2;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;">Open your dashboard \u2192</a>
    </div>`;

  return wrapEmailLayout(body, {
    subtitle: "Product Update \u2014 May 2027",
    accentColor: "#1C54F2",
    footerNote: "StrydeOS Product Updates",
    footerLinks: [
      { label: "Manage preferences", href: "https://app.strydeos.com/settings" },
    ],
  });
}

// ── Send sequence ──────────────────────────────────────────────

const emails = [
  {
    subject: "Your StrydeOS invite \u2014 set your password to get started",
    html: buildInviteEmail("https://app.strydeos.com/login?token=demo_test_may27"),
    text: buildInviteText("https://app.strydeos.com/login?token=demo_test_may27"),
  },
  {
    subject: "\u26A0\uFE0F HEP assignment dropped below 70% \u2014 Spires Physiotherapy",
    html: buildUrgentAlertEmail(mockCritical, "Spires Physiotherapy"),
    text: buildUrgentAlertText(mockCritical, "Spires Physiotherapy"),
  },
  {
    subject: "Your clinic this week \u2014 Spires Physiotherapy",
    html: buildStateOfClinicEmail({
      clinicName: "Spires Physiotherapy",
      weekLabel: "12 May 2027",
      topEvents: [mockCritical, mockWarning, mockPositive],
      currentStats: { followUpRate: 4.1, dnaRate: 0.058, utilisationRate: 0.79, courseCompletionRate: 0.74 },
      previousStats: { followUpRate: 3.8, dnaRate: 0.072, utilisationRate: 0.76, courseCompletionRate: 0.71 },
    }),
    text: buildStateOfClinicText({
      clinicName: "Spires Physiotherapy",
      weekLabel: "12 May 2027",
      topEvents: [mockCritical, mockWarning, mockPositive],
      currentStats: { followUpRate: 4.1, dnaRate: 0.058, utilisationRate: 0.79, courseCompletionRate: 0.74 },
      previousStats: { followUpRate: 3.8, dnaRate: 0.072, utilisationRate: 0.76, courseCompletionRate: 0.71 },
    }),
  },
  {
    subject: "Your week at Spires Physiotherapy \u2014 12 May 2027",
    html: buildClinicianDigestEmail({
      firstName: "Andrew",
      clinicName: "Spires Physiotherapy",
      weekLabel: "12 May 2027",
      stats: { followUpRate: 4.3, hepRate: 0.86, utilisationRate: 0.81, dnaRate: 0.038 },
      targets: { followUpRate: 4.0, hepRate: 0.85, utilisationRate: 0.75, dnaRate: 0.06 },
      patientsNeedingAction: 3,
      focusNote: "Your Monday caseload had the highest follow-up conversion this week \u2014 all 8 patients rebooked. Thursday still shows a gap \u2014 2 of 5 patients didn't rebook.",
      winNote: "HEP compliance hit 86% \u2014 your personal best. Patients are completing programmes at a higher rate when you assign them same-day.",
    }),
    text: buildClinicianDigestText({
      firstName: "Andrew",
      clinicName: "Spires Physiotherapy",
      weekLabel: "12 May 2027",
      stats: { followUpRate: 4.3, hepRate: 0.86, utilisationRate: 0.81, dnaRate: 0.038 },
      targets: { followUpRate: 4.0, hepRate: 0.85, utilisationRate: 0.75, dnaRate: 0.06 },
      patientsNeedingAction: 3,
      focusNote: "Your Monday caseload had the highest follow-up conversion this week \u2014 all 8 patients rebooked. Thursday still shows a gap \u2014 2 of 5 patients didn't rebook.",
      winNote: "HEP compliance hit 86% \u2014 your personal best. Patients are completing programmes at a higher rate when you assign them same-day.",
    }),
  },
  {
    subject: "What shipped in May \u2014 StrydeOS Product Update",
    html: buildProductUpdateEmail(),
    text: "StrydeOS Product Update — May 2027\n\nHi Jamal,\n\nHere's what shipped in May.\n\n1. Intelligence: Clinician coaching notes — personalised observations in weekly digests.\n2. Pulse: Smart rebooking reminders — SMS nudges for patients who haven't rebooked within 72hrs.\n3. Ava: Multi-clinic call routing — per-clinic numbers with independent availability.\n\nComing in June: Outcome measures (NPRS, PSFS, QuickDASH), TM3 integration beta, Google Reviews auto-request.\n\nOpen your dashboard: https://app.strydeos.com/dashboard",
  },
];

async function sendAll() {
  console.log(`Sending ${emails.length} test emails to ${TO}...\n`);

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: TO,
        subject: `[TEST] ${email.subject}`,
        html: email.html,
        text: email.text,
      });

      if (error) {
        console.error(`  ${i + 1}. FAILED: ${email.subject}\n     ${error.message}`);
      } else {
        console.log(`  ${i + 1}. SENT: ${email.subject}\n     ID: ${data?.id}`);
      }
    } catch (err) {
      console.error(`  ${i + 1}. ERROR: ${email.subject}\n     ${err}`);
    }

    // Small delay between sends to avoid rate limiting
    if (i < emails.length - 1) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  console.log("\nDone. Check jamal@spiresphysiotherapy.com inbox.");
}

sendAll();
