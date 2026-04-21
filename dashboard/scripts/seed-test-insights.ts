/**
 * Seed test InsightEvents into Firestore for demo/verification.
 * Usage: npx tsx scripts/seed-test-insights.ts
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

// ─── Init admin ──────────────────────────────────────────
const saPath = path.resolve(__dirname, "serviceAccountKey.json");
if (!admin.apps.length) {
  if (fs.existsSync(saPath)) {
    const sa = JSON.parse(fs.readFileSync(saPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
}
const db = admin.firestore();

const CLINIC_ID = "clinic-spires";
const now = admin.firestore.Timestamp.now();

const events = [
  {
    type: "REVENUE_LEAK_DETECTED",
    clinicId: CLINIC_ID,
    clinicianId: "c-andrew",
    severity: "critical",
    title: "Andrew had 9 mid-programme patients who didn't rebook this week — roughly £1,170 in estimated leaked revenue",
    description: "9 patients are between sessions 2–5 of their programme with no follow-up booked. At £65/session with an average of 2 sessions remaining, this represents approximately £1,170 in revenue that may not materialise.",
    revenueImpact: 1170,
    suggestedAction: "Review Andrew's patient board in Pulse — filter for churn-risk patients and check if rebooking prompts have been sent.",
    actionTarget: "owner",
    createdAt: now,
    readAt: null,
    dismissedAt: null,
    resolvedAt: null,
    resolution: null,
    pulseActionId: null,
    lastNotifiedAt: now,
    metadata: { clinicianName: "Andrew Henry", midProgrammeCount: 9, avgSessionsRemaining: 2, revenuePerSession: 65 },
  },
  {
    type: "CLINICIAN_FOLLOWUP_DROP",
    clinicId: CLINIC_ID,
    clinicianId: "c-max",
    severity: "warning",
    title: "Max's follow-up rate dropped 14% this week (from 3.1 to 2.7)",
    description: "Max booked 2.7 follow-ups per initial assessment this week, down from 3.1 the previous week. This is a 14% week-on-week decline — below the 10% threshold.",
    revenueImpact: 520,
    suggestedAction: "Check if Max had cancellations or schedule gaps this week. Consider a brief 1:1 to discuss rebooking patterns.",
    actionTarget: "owner",
    createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 3600_000),
    readAt: null,
    dismissedAt: null,
    resolvedAt: null,
    resolution: null,
    pulseActionId: null,
    lastNotifiedAt: now,
    metadata: { clinicianName: "Max Hubbard", previousRate: 3.1, currentRate: 2.7, dropPercent: 14 },
  },
  {
    type: "TREATMENT_COMPLETION_WIN",
    clinicId: CLINIC_ID,
    clinicianId: "c-andrew",
    severity: "positive",
    title: "Andrew hit 92% treatment completion this week — highest in 6 weeks",
    description: "11 out of 12 discharged patients completed their full programme this week. This is Andrew's best treatment completion rate in the last 6 weeks.",
    suggestedAction: "Acknowledge this in your next team meeting — positive reinforcement drives consistency.",
    actionTarget: "owner",
    createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 7200_000),
    readAt: null,
    dismissedAt: null,
    resolvedAt: null,
    resolution: null,
    pulseActionId: null,
    lastNotifiedAt: now,
    metadata: { clinicianName: "Andrew Henry", completionRate: 0.92, completedCount: 11, totalDischarged: 12 },
  },
  {
    type: "PATIENT_DROPOUT_RISK",
    clinicId: CLINIC_ID,
    clinicianId: "c-andrew",
    patientId: "p-demo-dropout-1",
    severity: "critical",
    title: "Sarah Mitchell hasn't rebooked in 12 days — mid-programme (session 3 of 6)",
    description: "Sarah is mid-programme with Andrew (3/6 sessions completed) but hasn't booked a follow-up in 12 days. Her last session was a follow-up on 10 March.",
    revenueImpact: 195,
    suggestedAction: "Pulse will send an automated rebooking prompt if the sequence is enabled.",
    actionTarget: "patient",
    createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 1800_000),
    readAt: null,
    dismissedAt: null,
    resolvedAt: null,
    resolution: null,
    pulseActionId: "comms-log-demo-1",
    lastNotifiedAt: now,
    metadata: { patientName: "Sarah Mitchell", clinicianName: "Andrew Henry", daysSinceLastVisit: 12, sessionsCompleted: 3, treatmentLength: 6 },
  },
  {
    type: "HEP_COMPLIANCE_LOW",
    clinicId: CLINIC_ID,
    severity: "warning",
    title: "Clinic-wide HEP compliance is at 43% — below your 50% target",
    description: "Only 43% of patients seen this week were assigned a home exercise programme. This is below the clinic target of 50%.",
    suggestedAction: "Review which clinicians are under-assigning programmes. Consider making HEP assignment part of the discharge checklist.",
    actionTarget: "owner",
    createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 10800_000),
    readAt: null,
    dismissedAt: null,
    resolvedAt: null,
    resolution: null,
    pulseActionId: null,
    lastNotifiedAt: now,
    metadata: { currentCompliance: 0.43, targetCompliance: 0.50 },
  },
];

async function seed() {
  const col = db.collection(`clinics/${CLINIC_ID}/insight_events`);

  // Clear existing test events
  const existing = await col.get();
  const batch = db.batch();
  existing.docs.forEach((doc) => batch.delete(doc.ref));
  if (existing.docs.length > 0) {
    await batch.commit();
    console.log(`Cleared ${existing.docs.length} existing insight events`);
  }

  // Write new events
  for (const event of events) {
    const ref = col.doc();
    await ref.set(event);
    console.log(`✓ ${event.type}: ${event.title.slice(0, 60)}...`);
  }

  console.log(`\nSeeded ${events.length} InsightEvents into clinics/${CLINIC_ID}/insight_events`);
}

seed().catch(console.error);
