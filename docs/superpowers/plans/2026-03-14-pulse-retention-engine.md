# Pulse Retention Engine — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Pulse retention engine — weighted risk scoring, 7-state lifecycle machine, Firestore-driven 6-touch sequence engine, last-touch revenue attribution, inbound SMS logging, and a customisable Pulse dashboard UI.

**Architecture:** Parallel tracks sharing a type contract defined first. Backend (pipeline stages) and frontend (React components/hooks) are developed independently then wired in the final task. All changes are additive — existing `churnRisk` boolean, `usePatients` segments, and n8n workflow 06 remain intact throughout.

**Tech Stack:** TypeScript, Next.js App Router, Firebase Admin SDK (backend pipeline), Firebase client SDK (hooks), Firestore, Tailwind CSS, Lucide React, motion/react, n8n + Twilio (SMS).

**Verification:** No test runner configured. Use `cd dashboard && npx tsc --noEmit` after each backend task. Use `npm run build` at chunk boundaries. Do not add `console.log`.

---

## Chunk 1: Type Foundation

**Files:**
- Modify: `dashboard/src/types/index.ts`
- Modify: `dashboard/src/types/comms.ts`

---

### Task 1.1 — Add LifecycleState, RiskFactors, and new Patient fields to `types/index.ts`

- [ ] Open `dashboard/src/types/index.ts`. Find the `Patient` interface (currently at line ~207).

- [ ] Add the following type definitions **above** the `Patient` interface (after the `ReferralSource` interface):

```typescript
// ─── Lifecycle & Risk ─────────────────────────────────────────────────────────

export type LifecycleState =
  | "NEW"         // sessionCount = 0
  | "ONBOARDING"  // sessionCount 1–3
  | "ACTIVE"      // sessionCount > 3, nextSessionDate present
  | "AT_RISK"     // riskScore >= 60, not discharged
  | "LAPSED"      // >14 days since last session, no future booking, not discharged
  | "RE_ENGAGED"  // was LAPSED/AT_RISK, new appointment booked within attribution window
  | "DISCHARGED"  // discharged = true
  | "CHURNED";    // LAPSED for 60+ days, no sequence engagement

export interface RiskFactors {
  attendance: number;        // 0–100, weight 30%
  treatmentProgress: number; // 0–100, weight 25%
  hepEngagement: number;     // 0–100, weight 20%
  sentiment: number;         // 0–100, weight 15%
  staticRisk: number;        // 0–100, weight 10%
}
```

- [ ] Add the following **optional** fields to the end of the `Patient` interface, before the closing `}`:

```typescript
  // Retention engine fields (additive — churnRisk/discharged unchanged)
  lifecycleState?: LifecycleState;
  riskScore?: number;               // 0–100 weighted composite
  riskFactors?: RiskFactors;
  sessionThresholdAlert?: boolean;  // true when lifecycleState = 'ONBOARDING'
  lifecycleUpdatedAt?: string;      // ISO string
```

- [ ] Verify: `cd dashboard && npx tsc --noEmit` — expect 0 errors related to these additions.

- [ ] Commit:
```bash
git add dashboard/src/types/index.ts
git commit -m "feat(types): add LifecycleState, RiskFactors, retention fields to Patient"
```

---

### Task 1.2 — Add new CommsLogEntry fields and `early_intervention` SequenceType

- [ ] In `dashboard/src/types/index.ts`, find `SequenceType` (currently around line 316). Add `"early_intervention"` to the union:

```typescript
export type SequenceType =
  | "hep_reminder"
  | "rebooking_prompt"
  | "pre_auth_collection"
  | "review_prompt"
  | "reactivation_90d"
  | "reactivation_180d"
  | "early_intervention";
```

- [ ] In the same file, add the following **optional** fields to the end of the `CommsLogEntry` interface, before the closing `}`:

```typescript
  // Step tracking (multi-touch cadence)
  stepNumber?: number;                           // which step in the 6-touch cadence (1–6)
  attributionWindowDays?: number;                // from sequence_definition at send time
  patientLifecycleStateAtSend?: LifecycleState;  // patient state when this message was sent
  // Attribution
  attributedRevenuePence?: number;               // populated when outcome = 'booked'
  attributedAppointmentId?: string;
  // Inbound reply
  inboundReply?: string | null;
  inboundAt?: string | null;
```

- [ ] Run `npx tsc --noEmit` — expect 0 new errors.

- [ ] Commit:
```bash
git add dashboard/src/types/index.ts
git commit -m "feat(types): add early_intervention SequenceType, retention fields to CommsLogEntry"
```

---

### Task 1.3 — Add SequenceDefinition and SequenceStep to `types/comms.ts`

- [ ] Open `dashboard/src/types/comms.ts`. Add these interfaces and update `N8nWebhookPayload` — append below the existing exports:

```typescript
import type { LifecycleState, SequenceType, CommsChannel } from "@/types";

export type ExitCondition =
  | "appointment_booked"
  | "unsubscribed"
  | "discharged"
  | "re_engaged";

export interface SequenceStep {
  stepNumber: number;        // 1–6
  daysAfterTrigger: number;  // days after the trigger event (not after previous step)
  channel: CommsChannel;
  templateKey: string;
}

export interface SequenceDefinition {
  id: string;
  name: string;
  sequenceType: SequenceType;
  steps: SequenceStep[];
  attributionWindowDays: number | null; // null = attribution not applicable (pre_auth_collection)
  exitConditions: ExitCondition[];
  cooldownDays: number;   // min days before same sequence re-fires to same patient
  active: boolean;
  priority: number;       // lower = higher priority; early_intervention = 1
}

// Seed data — used to populate Firestore on first pipeline run
export const DEFAULT_SEQUENCE_DEFINITIONS: Omit<SequenceDefinition, "id">[] = [
  {
    name: "Early Intervention",
    sequenceType: "early_intervention",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 1, channel: "sms", templateKey: "early_intervention_step1" },
      { stepNumber: 2, daysAfterTrigger: 3, channel: "email", templateKey: "early_intervention_step2" },
    ],
    attributionWindowDays: 5,
    exitConditions: ["appointment_booked", "unsubscribed", "discharged", "re_engaged"],
    cooldownDays: 3,
    active: true,
    priority: 1,
  },
  {
    name: "Re-booking Prompt",
    sequenceType: "rebooking_prompt",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 1,  channel: "sms",   templateKey: "rebooking_step1" },
      { stepNumber: 2, daysAfterTrigger: 3,  channel: "email", templateKey: "rebooking_step2" },
      { stepNumber: 3, daysAfterTrigger: 7,  channel: "sms",   templateKey: "rebooking_step3" },
      { stepNumber: 4, daysAfterTrigger: 14, channel: "sms",   templateKey: "rebooking_step4" },
    ],
    attributionWindowDays: 7,
    exitConditions: ["appointment_booked", "unsubscribed", "discharged", "re_engaged"],
    cooldownDays: 7,
    active: true,
    priority: 2,
  },
  {
    name: "Post-Session HEP Reminder",
    sequenceType: "hep_reminder",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 1, channel: "email", templateKey: "hep_step1" },
      { stepNumber: 2, daysAfterTrigger: 3, channel: "email", templateKey: "hep_step2" },
    ],
    attributionWindowDays: 7,
    exitConditions: ["appointment_booked", "unsubscribed"],
    cooldownDays: 7,
    active: true,
    priority: 3,
  },
  {
    name: "Discharge Review Prompt",
    sequenceType: "review_prompt",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 3, channel: "sms",   templateKey: "review_step1" },
      { stepNumber: 2, daysAfterTrigger: 7, channel: "sms",   templateKey: "review_step2" },
    ],
    attributionWindowDays: 14,
    exitConditions: ["appointment_booked", "unsubscribed"],
    cooldownDays: 30,
    active: true,
    priority: 4,
  },
  {
    name: "90-Day Reactivation",
    sequenceType: "reactivation_90d",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 88,  channel: "sms",   templateKey: "reactivation_step1" },
      { stepNumber: 2, daysAfterTrigger: 91,  channel: "email", templateKey: "reactivation_step2" },
      { stepNumber: 3, daysAfterTrigger: 95,  channel: "sms",   templateKey: "reactivation_step3" },
      { stepNumber: 4, daysAfterTrigger: 102, channel: "sms",   templateKey: "reactivation_step4" },
      { stepNumber: 5, daysAfterTrigger: 118, channel: "sms",   templateKey: "reactivation_step5" },
      { stepNumber: 6, daysAfterTrigger: 148, channel: "sms",   templateKey: "reactivation_step6" },
    ],
    attributionWindowDays: 30,
    exitConditions: ["appointment_booked", "unsubscribed", "re_engaged"],
    cooldownDays: 90,
    active: true,
    priority: 5,
  },
  {
    name: "180-Day Reactivation",
    sequenceType: "reactivation_180d",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 178, channel: "sms",   templateKey: "reactivation_180_step1" },
      { stepNumber: 2, daysAfterTrigger: 181, channel: "email", templateKey: "reactivation_180_step2" },
      { stepNumber: 3, daysAfterTrigger: 185, channel: "sms",   templateKey: "reactivation_180_step3" },
      { stepNumber: 4, daysAfterTrigger: 192, channel: "sms",   templateKey: "reactivation_180_step4" },
      { stepNumber: 5, daysAfterTrigger: 208, channel: "sms",   templateKey: "reactivation_180_step5" },
      { stepNumber: 6, daysAfterTrigger: 238, channel: "sms",   templateKey: "reactivation_180_step6" },
    ],
    attributionWindowDays: 30,
    exitConditions: ["appointment_booked", "unsubscribed", "re_engaged"],
    cooldownDays: 90,
    active: false,
    priority: 6,
  },
  {
    name: "Insurance Pre-Auth Collection",
    sequenceType: "pre_auth_collection",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 0, channel: "email", templateKey: "pre_auth_step1" },
    ],
    attributionWindowDays: null,
    exitConditions: ["unsubscribed"],
    cooldownDays: 3,
    active: true,
    priority: 7,
  },
];

// Extended n8n payload — adds step tracking fields
export interface N8nSequencePayload {
  clinicId: string;
  patientId: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  clinicianName: string;
  sequenceType: SequenceType;
  logId: string;
  callbackUrl: string;
  stepNumber: number;
  sequenceDefinitionId: string;
  attributionWindowDays: number | null;
  triggerData: Record<string, unknown>;
}
```

- [ ] **IMPORTANT — import line**: `types/comms.ts` already has `import type { SequenceType, CommsChannel } from "./index";` at line 1. Do NOT add a second import block. Instead, **edit the existing import at line 1** to add `LifecycleState`:
```typescript
import type { LifecycleState, SequenceType, CommsChannel } from "./index";
```
Then add all the new interfaces below the existing exports.

- [ ] Note: The existing `N8nWebhookPayload` and `CommsSequenceConfig` interfaces stay — do not remove them. The new `N8nSequencePayload` replaces `N8nWebhookPayload` in `trigger-sequences.ts` only.

- [ ] Run `npx tsc --noEmit` — expect 0 errors.

- [ ] Commit:
```bash
git add dashboard/src/types/comms.ts
git commit -m "feat(types): add SequenceDefinition, SequenceStep, N8nSequencePayload, seed data"
```

---

## Chunk 2: Risk Score Engine

**Files:**
- Create: `dashboard/src/lib/pipeline/compute-risk-score.ts`
- Modify: `dashboard/src/lib/pipeline/compute-patients.ts`

---

### Task 2.1 — Create `compute-risk-score.ts`

- [ ] Create `dashboard/src/lib/pipeline/compute-risk-score.ts`:

```typescript
/**
 * compute-risk-score.ts
 *
 * Computes a weighted 0–100 risk score and assigns a LifecycleState for each patient.
 * Called from compute-patients.ts after existing discharge/churnRisk logic.
 *
 * Factor weights:
 *   attendance       30%
 *   treatmentProgress 25%
 *   hepEngagement    20%
 *   sentiment        15%
 *   staticRisk       10%
 *
 * Lifecycle precedence (first match wins):
 *   1. CHURNED     — churnRisk=true AND last sequence >60 days ago
 *   2. DISCHARGED  — discharged=true
 *   3. RE_ENGAGED  — prior state was LAPSED/AT_RISK AND nextSessionDate now present
 *   4. AT_RISK     — riskScore >= 60 AND !discharged
 *   5. LAPSED      — daysSinceLast >14 AND !nextSessionDate AND !discharged
 *   6. ONBOARDING  — sessionCount 1–3
 *   7. NEW         — sessionCount = 0
 *   8. ACTIVE      — all other cases
 */

import type { LifecycleState, RiskFactors } from "@/types";

export interface RiskScoreInput {
  sessionCount: number;
  courseLength: number;
  lastSessionDate?: string | null;
  nextSessionDate?: string | null;
  discharged: boolean;
  churnRisk: boolean;
  insuranceFlag: boolean;
  hepProgramId?: string | null;
  hepComplianceData?: boolean; // true if Physitrack compliance data present
  isInitialAssessmentWithNoFollowUp?: boolean;
  followUpBookedAtLastSession?: boolean;
  dnasInFirstThreeSessions?: number; // count of DNA appointments in first 3 sessions
  sessionsAttendedLast4Weeks?: number;
  sessionsScheduledLast4Weeks?: number;
  nprsImprovement?: number | null;   // positive = improvement
  npsScore?: number | null;          // 0–10
  priorLifecycleState?: LifecycleState | null;
  lastSequenceSentAt?: string | null;
  now?: Date;
}

export interface RiskScoreResult {
  riskScore: number;
  riskFactors: RiskFactors;
  lifecycleState: LifecycleState;
  sessionThresholdAlert: boolean;
}

export function computeRiskScore(input: RiskScoreInput): RiskScoreResult {
  const now = input.now ?? new Date();

  // ── Factor: attendance (30%) ────────────────────────────────────────────
  let attendance = 100;
  if (
    input.sessionsScheduledLast4Weeks !== undefined &&
    input.sessionsScheduledLast4Weeks > 0
  ) {
    attendance =
      ((input.sessionsAttendedLast4Weeks ?? 0) /
        input.sessionsScheduledLast4Weeks) *
      100;
  }
  if ((input.dnasInFirstThreeSessions ?? 0) > 0) attendance -= 20;
  attendance = Math.max(0, Math.min(100, attendance));

  // ── Factor: treatmentProgress (25%) ────────────────────────────────────
  const courseLen = Math.max(1, input.courseLength);
  let treatmentProgress = (input.sessionCount / courseLen) * 100;
  if (input.followUpBookedAtLastSession) treatmentProgress += 15;
  if (input.sessionCount < 3 && !input.nextSessionDate) treatmentProgress -= 25;
  treatmentProgress = Math.max(0, Math.min(100, treatmentProgress));

  // ── Factor: hepEngagement (20%) ────────────────────────────────────────
  let hepEngagement = 0;
  if (input.hepProgramId) {
    hepEngagement = input.hepComplianceData ? 100 : 50;
  }

  // ── Factor: sentiment (15%) ────────────────────────────────────────────
  let sentiment = 50; // neutral default
  if (input.nprsImprovement !== null && input.nprsImprovement !== undefined) {
    if (input.nprsImprovement > 0) sentiment = 100;
    else if (input.nprsImprovement < 0) sentiment = 0;
    else sentiment = 50;
  } else if (input.npsScore !== null && input.npsScore !== undefined) {
    sentiment = (input.npsScore / 10) * 100;
  }
  sentiment = Math.max(0, Math.min(100, sentiment));

  // ── Factor: staticRisk (10%) ────────────────────────────────────────────
  let staticRisk = 70;
  if (input.insuranceFlag) staticRisk -= 30;
  if (input.isInitialAssessmentWithNoFollowUp) staticRisk -= 20;
  staticRisk = Math.max(0, Math.min(100, staticRisk));

  // ── Composite score ─────────────────────────────────────────────────────
  const riskScore = Math.round(
    attendance * 0.3 +
      treatmentProgress * 0.25 +
      hepEngagement * 0.2 +
      sentiment * 0.15 +
      staticRisk * 0.1
  );

  const riskFactors: RiskFactors = {
    attendance,
    treatmentProgress,
    hepEngagement,
    sentiment,
    staticRisk,
  };

  // ── Lifecycle state ─────────────────────────────────────────────────────
  const daysSinceLast = input.lastSessionDate
    ? Math.floor(
        (now.getTime() - new Date(input.lastSessionDate).getTime()) /
          86_400_000
      )
    : Infinity;

  const daysSinceLastSequence = input.lastSequenceSentAt
    ? Math.floor(
        (now.getTime() - new Date(input.lastSequenceSentAt).getTime()) /
          86_400_000
      )
    : Infinity;

  let lifecycleState: LifecycleState;

  if (input.churnRisk && daysSinceLastSequence > 60) {
    // CHURNED: lapsed and no sequence engagement in 60+ days
    lifecycleState = "CHURNED";
  } else if (input.discharged) {
    lifecycleState = "DISCHARGED";
  } else if (
    (input.priorLifecycleState === "LAPSED" ||
      input.priorLifecycleState === "AT_RISK") &&
    !!input.nextSessionDate
  ) {
    // RE_ENGAGED: was at-risk/lapsed, now has a future appointment
    lifecycleState = "RE_ENGAGED";
  } else if (riskScore >= 60 && !input.discharged) {
    lifecycleState = "AT_RISK";
  } else if (daysSinceLast > 14 && !input.nextSessionDate && !input.discharged) {
    lifecycleState = "LAPSED";
  } else if (input.sessionCount >= 1 && input.sessionCount <= 3) {
    lifecycleState = "ONBOARDING";
  } else if (input.sessionCount === 0) {
    lifecycleState = "NEW";
  } else {
    lifecycleState = "ACTIVE";
  }

  return {
    riskScore,
    riskFactors,
    lifecycleState,
    sessionThresholdAlert: lifecycleState === "ONBOARDING",
  };
}
```

- [ ] Run `npx tsc --noEmit` — expect 0 errors.

- [ ] Commit:
```bash
git add dashboard/src/lib/pipeline/compute-risk-score.ts
git commit -m "feat(pipeline): add compute-risk-score — weighted 0-100 score + lifecycle state"
```

---

### Task 2.2 — Wire risk score into `compute-patients.ts`

- [ ] Open `dashboard/src/lib/pipeline/compute-patients.ts`.

- [ ] Add import at the top:
```typescript
import { computeRiskScore } from "./compute-risk-score";
import type { LifecycleState } from "@/types";
```

- [ ] In the `apptsByPatient` map building loop (around line 56), change the type to capture full appointment data needed for risk scoring. Replace the existing map type and loop:

```typescript
  const apptsByPatient = new Map<
    string,
    { dateTime: string; status: string; followUpBooked: boolean; isInitialAssessment: boolean }[]
  >();
  for (const doc of appointmentsSnap.docs) {
    const data = doc.data();
    const pid = data.patientId as string;
    if (!pid) continue;
    if (!apptsByPatient.has(pid)) apptsByPatient.set(pid, []);
    apptsByPatient.get(pid)!.push({
      dateTime: data.dateTime as string,
      status: data.status as string,
      followUpBooked: (data.followUpBooked as boolean) ?? false,
      isInitialAssessment: (data.isInitialAssessment as boolean) ?? false,
    });
  }
```

- [ ] After the existing `discharged`/`churnRisk` block (after line ~113, where `churnRisk = true` can be set), add the risk score computation before the `update` object. Replace the existing `const update` block with:

```typescript
      // ── Risk score + lifecycle state ────────────────────────────────────
      const lastAppt = completed.length > 0 ? completed[completed.length - 1] : null;
      const firstThreeAppts = completed.slice(0, 3);
      const dnaInFirstThree = appointments.filter(
        (a) =>
          a.status === "dna" &&
          firstThreeAppts.some((c) => c.dateTime === a.dateTime)
      ).length;

      // Appointments in last 4 weeks
      const fourWeeksAgo = new Date(now.getTime() - 28 * 86_400_000).toISOString();
      const recentAppts = appointments.filter((a) => a.dateTime >= fourWeeksAgo);
      const recentScheduled = recentAppts.filter(
        (a) => a.status === "scheduled" || a.status === "completed" || a.status === "dna"
      ).length;
      const recentAttended = recentAppts.filter((a) => a.status === "completed").length;

      const priorLifecycleState = (data.lifecycleState as LifecycleState | undefined) ?? null;
      const lastSequenceSentAt = (data.lastSequenceSentAt as string | undefined) ?? null;

      const riskResult = computeRiskScore({
        sessionCount,
        courseLength,
        lastSessionDate,
        nextSessionDate,
        discharged,
        churnRisk,
        insuranceFlag: (data.insuranceFlag as boolean) ?? false,
        hepProgramId: data.hepProgramId as string | undefined,
        hepComplianceData: !!(data.hepComplianceData),
        isInitialAssessmentWithNoFollowUp:
          sessionCount === 1 && lastAppt?.isInitialAssessment && !lastAppt?.followUpBooked,
        followUpBookedAtLastSession: lastAppt?.followUpBooked ?? false,
        dnasInFirstThreeSessions: dnaInFirstThree,
        sessionsAttendedLast4Weeks: recentAttended,
        sessionsScheduledLast4Weeks: recentScheduled,
        priorLifecycleState,
        lastSequenceSentAt,
        now,
      });

      const update: Record<string, unknown> = {
        sessionCount,
        lastSessionDate: lastSessionDate ?? null,
        nextSessionDate: nextSessionDate ?? null,
        discharged,
        churnRisk,
        courseLength,
        // New retention fields (additive)
        lifecycleState: riskResult.lifecycleState,
        riskScore: riskResult.riskScore,
        riskFactors: riskResult.riskFactors,
        sessionThresholdAlert: riskResult.sessionThresholdAlert,
        lifecycleUpdatedAt: nowIso,
        updatedAt: nowIso,
      };

      // NOTE: The existing `batch.update(patientsRef.doc(patientDoc.id), update)` call
      // at line ~126 remains UNCHANGED — do not remove or replace it.
```

- [ ] Run `npx tsc --noEmit` — expect 0 errors.

- [ ] Commit:
```bash
git add dashboard/src/lib/pipeline/compute-patients.ts
git commit -m "feat(pipeline): wire computeRiskScore into compute-patients — writes lifecycleState + riskScore"
```

---

## Chunk 3: Sequence Engine

**Files:**
- Modify: `dashboard/src/lib/comms/trigger-sequences.ts`

This is a full rewrite of the sequence triggering logic. The existing `isEligible` function and `DEFAULT_SEQUENCES` usage are replaced with Firestore-driven definitions and per-step progression.

---

### Task 3.1 — Rewrite `trigger-sequences.ts`

- [ ] Replace the entire content of `dashboard/src/lib/comms/trigger-sequences.ts` with:

```typescript
/**
 * trigger-sequences.ts
 *
 * Stage 5b: For each patient, loads sequence definitions from Firestore,
 * evaluates eligibility and step progression, fires n8n webhooks, and
 * writes to comms_log.
 *
 * Sequence definitions are seeded on first run from DEFAULT_SEQUENCE_DEFINITIONS.
 * Step progression: daysAfterTrigger is measured from the trigger event date,
 * not from the previous step's sentAt.
 *
 * Exit conditions checked before each step fires:
 *   - nextSessionDate present → appointment_booked
 *   - lifecycleState is DISCHARGED or RE_ENGAGED
 *   - prior comms_log entry for this patient+sequence has outcome 'unsubscribed'
 */

import type { Firestore } from "firebase-admin/firestore";
import type { SequenceType } from "@/types";
import type { SequenceDefinition, N8nSequencePayload } from "@/types/comms";
import { DEFAULT_SEQUENCE_DEFINITIONS } from "@/types/comms";

const N8N_BASE   = process.env.N8N_WEBHOOK_BASE_URL;
const N8N_SECRET = process.env.N8N_COMMS_WEBHOOK_SECRET;
const APP_URL    = process.env.APP_URL ?? "";
const N8N_TIMEOUT = 10_000;

export interface TriggerResult {
  fired:   number;
  skipped: number;
  errors:  string[];
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function triggerCommsSequences(
  db: Firestore,
  clinicId: string
): Promise<TriggerResult> {
  if (!N8N_BASE?.trim()) {
    return { fired: 0, skipped: 0, errors: ["N8N_WEBHOOK_BASE_URL not set — comms skipped"] };
  }

  const now       = new Date();
  const clinicRef = db.collection("clinics").doc(clinicId);

  // ── Load or seed sequence definitions ──────────────────────────────────
  const definitions = await loadOrSeedDefinitions(db, clinicId);
  const activeDefinitions = definitions
    .filter((d) => d.active)
    .sort((a, b) => a.priority - b.priority);

  // ── Load supporting data ────────────────────────────────────────────────
  const [patientsSnap, cliniciansSnap, allLogsSnap] = await Promise.all([
    clinicRef.collection("patients").get(),
    clinicRef.collection("clinicians").get(),
    // Load last 200 days of comms_log for step progression queries
    clinicRef
      .collection("comms_log")
      .where("sentAt", ">=", new Date(now.getTime() - 200 * 86_400_000).toISOString())
      .get(),
  ]);

  const clinicianNames: Record<string, string> = {};
  for (const doc of cliniciansSnap.docs) {
    clinicianNames[doc.id] = (doc.data().name as string) ?? "Your clinician";
  }

  // Index comms_log by "patientId:sequenceType" → sorted entries
  const logsByKey = new Map<string, Array<{ stepNumber: number; sentAt: string; outcome: string }>>();
  for (const doc of allLogsSnap.docs) {
    const d = doc.data();
    if (!d.patientId || !d.sequenceType) continue;
    const key = `${d.patientId}:${d.sequenceType}`;
    if (!logsByKey.has(key)) logsByKey.set(key, []);
    logsByKey.get(key)!.push({
      stepNumber: (d.stepNumber as number) ?? 1,
      sentAt:     d.sentAt as string,
      outcome:    d.outcome as string,
    });
  }
  // Sort each group by sentAt ascending
  for (const entries of logsByKey.values()) {
    entries.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  }

  let fired   = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const patientDoc of patientsSnap.docs) {
    const patient   = patientDoc.data();
    const patientId = patientDoc.id;
    const email     = patient.contact?.email as string | undefined;
    const phone     = patient.contact?.phone as string | undefined;
    const lifecycleState = patient.lifecycleState as string | undefined;

    // ── Patient-level exit: DISCHARGED or RE_ENGAGED stops most sequences ──
    // (sequence-level exit conditions checked per-sequence below)

    for (const def of activeDefinitions) {
      const key = `${patientId}:${def.sequenceType}`;
      const priorLogs = logsByKey.get(key) ?? [];

      // ── Exit: prior unsubscribe ───────────────────────────────────────
      if (priorLogs.some((l) => l.outcome === "unsubscribed")) {
        skipped++;
        continue;
      }

      // ── Exit: appointment_booked (nextSessionDate present) ───────────
      if (
        def.exitConditions.includes("appointment_booked") &&
        patient.nextSessionDate
      ) {
        skipped++;
        continue;
      }

      // ── Exit: discharged ─────────────────────────────────────────────
      if (
        def.exitConditions.includes("discharged") &&
        patient.discharged === true &&
        def.sequenceType !== "review_prompt" &&
        def.sequenceType !== "reactivation_90d" &&
        def.sequenceType !== "reactivation_180d"
      ) {
        skipped++;
        continue;
      }

      // ── Exit: re_engaged ──────────────────────────────────────────────
      if (
        def.exitConditions.includes("re_engaged") &&
        lifecycleState === "RE_ENGAGED"
      ) {
        skipped++;
        continue;
      }

      // ── Eligibility ───────────────────────────────────────────────────
      const triggerDate = getTriggerDate(patient, def.sequenceType);
      if (!triggerDate) { skipped++; continue; }

      if (!isEligible(patient, def.sequenceType, now)) { skipped++; continue; }

      // ── Step progression ──────────────────────────────────────────────
      const nextStep = getNextStep(def, priorLogs, triggerDate, now);
      if (!nextStep) { skipped++; continue; }

      // ── Cooldown: last log entry must be older than cooldownDays ──────
      if (priorLogs.length > 0) {
        const lastSent = priorLogs[priorLogs.length - 1].sentAt;
        const daysSinceLast = Math.floor(
          (now.getTime() - new Date(lastSent).getTime()) / 86_400_000
        );
        if (daysSinceLast < def.cooldownDays && nextStep.stepNumber > 1) {
          // Step-to-step: only enforce cooldown if the last log was from a prior step
          // (not same-step re-send attempt); skip if too soon
          const lastStepNum = priorLogs[priorLogs.length - 1].stepNumber;
          if (lastStepNum === nextStep.stepNumber) { skipped++; continue; }
        }
      }

      // ── Contact requirement ───────────────────────────────────────────
      if (nextStep.channel === "email" && !email) { skipped++; continue; }
      if (nextStep.channel === "sms"   && !phone) { skipped++; continue; }

      // ── Pre-create comms_log doc ──────────────────────────────────────
      const logRef = clinicRef.collection("comms_log").doc();

      const payload: N8nSequencePayload = {
        clinicId,
        patientId,
        patientName:           (patient.name as string) ?? "Patient",
        patientEmail:          email,
        patientPhone:          phone,
        clinicianName:         clinicianNames[patient.clinicianId as string] ?? "Your clinician",
        sequenceType:          def.sequenceType,
        logId:                 logRef.id,
        callbackUrl:           `${APP_URL}/api/n8n/callback`,
        stepNumber:            nextStep.stepNumber,
        sequenceDefinitionId:  def.id,
        attributionWindowDays: def.attributionWindowDays,
        triggerData: {
          sessionCount:    patient.sessionCount,
          lastSessionDate: patient.lastSessionDate,
          nextSessionDate: patient.nextSessionDate,
          discharged:      patient.discharged,
          churnRisk:       patient.churnRisk,
          lifecycleState:  patient.lifecycleState,
          riskScore:       patient.riskScore,
          insuranceFlag:   patient.insuranceFlag,
          insurerName:     patient.insurerName,
          hepProgramId:    patient.hepProgramId,
          channel:         nextStep.channel,
          templateKey:     nextStep.templateKey,
          stepNumber:      nextStep.stepNumber,
        },
      };

      // ── Fire n8n webhook ──────────────────────────────────────────────
      const url = `${N8N_BASE!.replace(/\/$/, "")}/${def.sequenceType}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(N8N_SECRET ? { "x-webhook-secret": N8N_SECRET } : {}),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(N8N_TIMEOUT),
        });

        if (!res.ok) {
          errors.push(`[${def.sequenceType}] step${nextStep.stepNumber} ${patientId} → n8n HTTP ${res.status}`);
          continue;
        }

        // ── Write comms_log ───────────────────────────────────────────
        await logRef.set({
          patientId,
          sequenceType:               def.sequenceType,
          channel:                    nextStep.channel,
          sentAt:                     now.toISOString(),
          outcome:                    "no_action",
          n8nExecutionId:             null,
          stepNumber:                 nextStep.stepNumber,
          attributionWindowDays:      def.attributionWindowDays,
          patientLifecycleStateAtSend: patient.lifecycleState ?? null,
          createdAt:                  now.toISOString(),
          createdBy:                  "trigger-sequences",
        });

        // Update lastSequenceSentAt on patient doc for CHURNED detection
        await clinicRef.collection("patients").doc(patientId).set(
          { lastSequenceSentAt: now.toISOString() },
          { merge: true }
        );

        // Add to local index so same-run dedup works
        const entries = logsByKey.get(key) ?? [];
        entries.push({ stepNumber: nextStep.stepNumber, sentAt: now.toISOString(), outcome: "no_action" });
        logsByKey.set(key, entries);

        fired++;
      } catch (err) {
        errors.push(
          `[${def.sequenceType}] step${nextStep.stepNumber} ${patientId} → ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return { fired, skipped, errors };
}

// ─── Seed / load sequence definitions ────────────────────────────────────────

async function loadOrSeedDefinitions(
  db: Firestore,
  clinicId: string
): Promise<SequenceDefinition[]> {
  const ref = db
    .collection("clinics")
    .doc(clinicId)
    .collection("sequence_definitions");
  const snap = await ref.get();

  if (!snap.empty) {
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SequenceDefinition));
  }

  // Seed defaults
  const batch = db.batch();
  const seeded: SequenceDefinition[] = [];
  for (const def of DEFAULT_SEQUENCE_DEFINITIONS) {
    const docRef = ref.doc();
    batch.set(docRef, def);
    seeded.push({ id: docRef.id, ...def });
  }
  await batch.commit();
  return seeded;
}

// ─── Step progression ─────────────────────────────────────────────────────────

function getNextStep(
  def: SequenceDefinition,
  priorLogs: Array<{ stepNumber: number; sentAt: string; outcome: string }>,
  triggerDate: Date,
  now: Date
): (typeof def.steps)[0] | null {
  const daysSinceTrigger = Math.floor(
    (now.getTime() - triggerDate.getTime()) / 86_400_000
  );

  if (priorLogs.length === 0) {
    // No prior sends — evaluate step 1
    const step1 = def.steps.find((s) => s.stepNumber === 1);
    if (!step1) return null;
    if (daysSinceTrigger < step1.daysAfterTrigger) return null;
    return step1;
  }

  const lastSentStep = priorLogs[priorLogs.length - 1].stepNumber;
  const nextStepNum = lastSentStep + 1;
  const nextStep = def.steps.find((s) => s.stepNumber === nextStepNum);
  if (!nextStep) return null; // sequence complete

  if (daysSinceTrigger < nextStep.daysAfterTrigger) return null;
  return nextStep;
}

// ─── Trigger date ──────────────────────────────────────────────────────────────

/**
 * Returns the event date from which daysAfterTrigger is measured.
 * For most sequences this is lastSessionDate.
 * Returns null if the required data is absent.
 */
function getTriggerDate(
  patient: Record<string, unknown>,
  sequenceType: SequenceType
): Date | null {
  const lastSession = patient.lastSessionDate
    ? new Date(patient.lastSessionDate as string)
    : null;

  switch (sequenceType) {
    case "early_intervention":
    case "rebooking_prompt":
      return lastSession;
    case "hep_reminder":
      return lastSession;
    case "review_prompt":
      return lastSession;
    case "reactivation_90d":
      return lastSession;
    case "reactivation_180d":
      return lastSession;
    case "pre_auth_collection":
      return new Date(); // fires immediately on eligibility
    default:
      return lastSession;
  }
}

// ─── Eligibility ──────────────────────────────────────────────────────────────

function isEligible(
  patient: Record<string, unknown>,
  sequenceType: SequenceType,
  now: Date
): boolean {
  const lastSession  = patient.lastSessionDate ? new Date(patient.lastSessionDate as string) : null;
  const hoursAgo     = lastSession
    ? (now.getTime() - lastSession.getTime()) / 3_600_000
    : Infinity;
  const sessionCount = (patient.sessionCount as number) ?? 0;

  switch (sequenceType) {
    case "early_intervention":
      return (patient.sessionThresholdAlert === true) && !patient.nextSessionDate;

    case "rebooking_prompt":
      return patient.churnRisk === true && sessionCount >= 2;

    case "hep_reminder":
      // Last session was 20–48 h ago; patient has no next appointment booked
      return hoursAgo >= 20 && hoursAgo <= 48 && !patient.nextSessionDate;

    case "review_prompt":
      return patient.discharged === true;

    case "pre_auth_collection":
      return patient.insuranceFlag === true && sessionCount === 1;

    case "reactivation_90d":
      return patient.discharged === true && !!patient.lastSessionDate;

    case "reactivation_180d":
      return patient.discharged === true && !!patient.lastSessionDate;

    default:
      return false;
  }
}
```

- [ ] Run `npx tsc --noEmit` — fix any remaining type errors.

- [ ] Commit:
```bash
git add dashboard/src/lib/comms/trigger-sequences.ts
git commit -m "feat(pipeline): rewrite trigger-sequences with Firestore-driven step progression"
```

---

## Chunk 4: Attribution Engine

**Files:**
- Create: `dashboard/src/lib/pipeline/compute-attribution.ts`
- Modify: `dashboard/src/lib/pipeline/run-pipeline.ts`

---

### Task 4.1 — Create `compute-attribution.ts`

- [ ] Create `dashboard/src/lib/pipeline/compute-attribution.ts`:

```typescript
/**
 * compute-attribution.ts
 *
 * Stage 5c: Last-touch revenue attribution.
 *
 * For each appointment updated since the last pipeline run that results in a booking,
 * finds the most recent comms_log entry for the same patient within the sequence's
 * attribution window where patientLifecycleStateAtSend was AT_RISK, LAPSED, or RE_ENGAGED.
 * Updates that comms_log entry with outcome='booked' and attributedRevenuePence.
 *
 * pre_auth_collection entries (attributionWindowDays=null) are excluded.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { StageResult } from "./types";

const ATTRIBUTABLE_STATES = new Set(["AT_RISK", "LAPSED", "RE_ENGAGED"]);

export async function computeAttribution(
  db: Firestore,
  clinicId: string,
  lastRunAt?: string  // ISO string from pipeline config; limits appointment scan to recent updates
): Promise<StageResult> {
  const start = Date.now();
  const errors: string[] = [];
  let count = 0;

  try {
    const clinicRef = db.collection("clinics").doc(clinicId);

    // Scope to appointments updated since last pipeline run (or last 48h as fallback)
    // This prevents re-scanning the full appointment history on every run.
    const sinceDate = lastRunAt ?? new Date(Date.now() - 48 * 3_600_000).toISOString();

    let apptQuery = clinicRef
      .collection("appointments")
      .where("status", "in", ["scheduled", "completed"])
      .where("updatedAt", ">=", sinceDate);

    const apptSnap = await apptQuery.get();

    for (const apptDoc of apptSnap.docs) {
      const appt = apptDoc.data();
      const patientId = appt.patientId as string | undefined;
      if (!patientId) continue;

      const apptDateTime = appt.dateTime as string;

      // Find comms_log entries for this patient that are unattributed and within window
      const logsSnap = await clinicRef
        .collection("comms_log")
        .where("patientId", "==", patientId)
        .where("outcome", "!=", "booked")
        .get();

      // Filter to entries where patientLifecycleStateAtSend is attributable
      // and sentAt is within attributionWindowDays before apptDateTime
      const candidates = logsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
        .filter((entry) => {
          const state = entry.patientLifecycleStateAtSend as string | undefined;
          if (!state || !ATTRIBUTABLE_STATES.has(state)) return false;

          const windowDays = entry.attributionWindowDays as number | null | undefined;
          if (windowDays === null || windowDays === undefined) return false; // pre_auth excluded

          const sentAt = new Date(entry.sentAt as string);
          const apptDate = new Date(apptDateTime);
          const daysBefore = Math.floor(
            (apptDate.getTime() - sentAt.getTime()) / 86_400_000
          );
          return daysBefore >= 0 && daysBefore <= windowDays;
        })
        .sort((a, b) =>
          (b.sentAt as string).localeCompare(a.sentAt as string)
        ); // newest first

      if (candidates.length === 0) continue;

      // Last-touch: most recent qualifying entry
      const winner = candidates[0];
      await clinicRef.collection("comms_log").doc(winner.id).set(
        {
          outcome: "booked",
          attributedRevenuePence: (appt.revenueAmountPence as number) ?? 0,
          attributedAppointmentId: apptDoc.id,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      count++;
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return {
    stage: "compute-attribution",
    ok: errors.length === 0,
    count,
    errors,
    durationMs: Date.now() - start,
  };
}
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add dashboard/src/lib/pipeline/compute-attribution.ts
git commit -m "feat(pipeline): add compute-attribution — last-touch revenue attribution Stage 5c"
```

---

### Task 4.2 — Add Stage 5c to `run-pipeline.ts`

- [ ] Open `dashboard/src/lib/pipeline/run-pipeline.ts`.

- [ ] Add import at the top:
```typescript
import { computeAttribution } from "./compute-attribution";
```

- [ ] After the Stage 5b block (the `trigger-comms` try/catch, ending around line 137), add Stage 5c:

```typescript
  // ── Stage 5c: Revenue Attribution ────────────────────────────────────────
  // Pass lastFullRunAt from pipeline config so attribution only scans recently updated appointments
  const lastFullRunAt = (pipelineSnap.data()?.lastFullRunAt as string | undefined);
  const attrStart = Date.now();
  try {
    const attrResult = await computeAttribution(db, clinicId, lastFullRunAt);
    stages.push(attrResult);
  } catch (err) {
    stages.push({
      stage: "compute-attribution",
      ok: false,
      count: 0,
      errors: [err instanceof Error ? err.message : String(err)],
      durationMs: Date.now() - attrStart,
    });
  }
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add dashboard/src/lib/pipeline/run-pipeline.ts
git commit -m "feat(pipeline): add Stage 5c compute-attribution to run-pipeline"
```

---

## Chunk 5: Inbound SMS + Firestore Rules

**Files:**
- Modify: `dashboard/src/app/api/n8n/callback/route.ts`
- Modify: `dashboard/firestore.rules`

---

### Task 5.1 — Extend n8n callback to handle inbound replies

- [ ] Open `dashboard/src/app/api/n8n/callback/route.ts`. The POST handler currently handles outbound enrichment only.

- [ ] Replace the entire file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import type { CommsOutcome, SequenceType, CommsChannel } from "@/types";

const N8N_SECRET = process.env.N8N_COMMS_WEBHOOK_SECRET;

/**
 * POST /api/n8n/callback
 *
 * Handles two event types:
 *
 * 1. Standard n8n execution callback (type absent or type != 'inbound_reply'):
 *    Enriches the comms_log doc created by trigger-sequences with execution ID and outcome.
 *
 * 2. Inbound SMS reply (type = 'inbound_reply'):
 *    Matches the sender's phone to the most recently contacted patient,
 *    writes inboundReply + inboundAt to the most recent comms_log entry.
 *    On no match, writes an orphan log entry. Always returns 200.
 */
export async function POST(request: NextRequest) {
  try {
    const secret =
      request.headers.get("x-webhook-secret") ??
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (!N8N_SECRET || secret !== N8N_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.type === "inbound_reply") {
      return handleInboundReply(body);
    }

    return handleOutboundCallback(body);
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Outbound callback ────────────────────────────────────────────────────────

async function handleOutboundCallback(body: Record<string, unknown>) {
  const {
    clinicId,
    patientId,
    sequenceType,
    channel,
    logId,
    executionId,
    outcome,
    openedAt,
    clickedAt,
  } = body as {
    clinicId:     string;
    patientId:    string;
    sequenceType: SequenceType;
    channel:      CommsChannel;
    logId:        string;
    executionId:  string;
    outcome:      string;
    openedAt?:    string;
    clickedAt?:   string;
  };

  if (!clinicId || !patientId || !sequenceType) {
    return NextResponse.json(
      { error: "clinicId, patientId and sequenceType are required" },
      { status: 400 }
    );
  }

  const db  = getAdminDb();
  const now = new Date().toISOString();
  const clinicRef    = db.collection("clinics").doc(clinicId);
  const commsLogColl = clinicRef.collection("comms_log");
  const resolvedOutcome = mapOutcome(outcome);

  if (logId) {
    await commsLogColl.doc(logId).set(
      {
        n8nExecutionId: executionId ?? null,
        outcome:        resolvedOutcome,
        ...(openedAt  ? { openedAt }  : {}),
        ...(clickedAt ? { clickedAt } : {}),
        updatedAt: now,
      },
      { merge: true }
    );
  } else {
    await commsLogColl.add({
      patientId,
      sequenceType,
      channel:        channel ?? "email",
      sentAt:         now,
      outcome:        resolvedOutcome,
      n8nExecutionId: executionId ?? null,
      ...(openedAt  ? { openedAt }  : {}),
      ...(clickedAt ? { clickedAt } : {}),
      createdAt:  now,
      createdBy:  "n8n-callback",
    });
  }

  return NextResponse.json({ ok: true });
}

// ─── Inbound reply ────────────────────────────────────────────────────────────

async function handleInboundReply(body: Record<string, unknown>) {
  const { clinicId, fromPhone, replyText, receivedAt } = body as {
    clinicId:   string;
    fromPhone:  string;
    replyText:  string;
    receivedAt: string;
  };

  if (!clinicId || !fromPhone) {
    return NextResponse.json({ ok: true }); // gracefully ignore malformed
  }

  const db  = getAdminDb();
  const now = receivedAt ?? new Date().toISOString();
  const clinicRef = db.collection("clinics").doc(clinicId);

  // Find patient(s) matching this phone number
  const patientsSnap = await clinicRef
    .collection("patients")
    .where("contact.phone", "==", fromPhone)
    .get();

  if (patientsSnap.empty) {
    // No patient match — write orphan entry
    await clinicRef.collection("comms_log").add({
      patientId:    null,
      sequenceType: null,
      channel:      "sms",
      outcome:      "no_action",
      sentAt:       now,
      inboundReply: replyText ?? null,
      inboundAt:    now,
      createdAt:    now,
      createdBy:    "inbound-orphan",
    });
    return NextResponse.json({ ok: true });
  }

  // If multiple patients share the phone, take the one most recently contacted
  let targetPatientId: string;
  if (patientsSnap.docs.length === 1) {
    targetPatientId = patientsSnap.docs[0].id;
  } else {
    const patientIds = patientsSnap.docs.map((d) => d.id);
    const logsSnap = await clinicRef
      .collection("comms_log")
      .where("patientId", "in", patientIds)
      .orderBy("sentAt", "desc")
      .limit(1)
      .get();
    targetPatientId = logsSnap.empty
      ? patientsSnap.docs[0].id
      : (logsSnap.docs[0].data().patientId as string);
  }

  // Find most recent comms_log entry for this patient
  const recentLogSnap = await clinicRef
    .collection("comms_log")
    .where("patientId", "==", targetPatientId)
    .where("channel", "==", "sms")
    .orderBy("sentAt", "desc")
    .limit(1)
    .get();

  if (recentLogSnap.empty) {
    // Patient found but no log — write orphan
    await clinicRef.collection("comms_log").add({
      patientId:    targetPatientId,
      sequenceType: null,
      channel:      "sms",
      outcome:      "no_action",
      sentAt:       now,
      inboundReply: replyText ?? null,
      inboundAt:    now,
      createdAt:    now,
      createdBy:    "inbound-orphan",
    });
    return NextResponse.json({ ok: true });
  }

  await recentLogSnap.docs[0].ref.set(
    { inboundReply: replyText ?? null, inboundAt: now },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapOutcome(raw: string | undefined): CommsOutcome {
  if (!raw) return "no_action";
  const lower = raw.toLowerCase();
  if (lower === "booked" || lower === "rebooked") return "booked";
  if (lower === "unsubscribed" || lower === "optout" || lower === "stop") return "unsubscribed";
  return "no_action";
}
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add dashboard/src/app/api/n8n/callback/route.ts
git commit -m "feat(api): extend n8n callback to handle inbound_reply SMS logging"
```

---

### Task 5.2 — Add Firestore security rules for new collections

- [ ] Open `dashboard/firestore.rules`. Add two new rule blocks inside the outermost `match /databases/{database}/documents` block, after the `/users` block:

```
    // ─── User Preferences ──────────────────────────────────────────────
    // Each user can read/write only their own preferences doc.
    match /user_preferences/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
```

- [ ] Also add inside the `match /clinics/{clinicId}` block, after the existing `comms_log` rule:

```
      // Sequence Definitions — owners/admins can read; write is pipeline-only
      match /sequence_definitions/{defId} {
        allow read: if isClinicMember(clinicId) || isSuperAdmin();
        allow write: if false;
      }
```

- [ ] Commit:
```bash
git add dashboard/firestore.rules
git commit -m "feat(firestore): add security rules for user_preferences and sequence_definitions"
```

---

## Chunk 6: User Preferences Hook

**Files:**
- Create: `dashboard/src/hooks/useUserPreferences.ts`

---

### Task 6.1 — Create `useUserPreferences.ts`

- [ ] Create `dashboard/src/hooks/useUserPreferences.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { LifecycleState, SequenceType } from "@/types";

export interface UserPreferences {
  userId: string;
  clinicId: string;
  visibleSegments: LifecycleState[];
  visibleMetrics: string[];
  visibleSequenceTypes: SequenceType[];
  showRevenue: boolean;
  updatedAt: string;
}

const ALL_SEGMENTS: LifecycleState[] = [
  "NEW", "ONBOARDING", "ACTIVE", "AT_RISK", "LAPSED", "RE_ENGAGED", "DISCHARGED", "CHURNED",
];

const ALL_METRICS = [
  "riskScore", "lifecycleState", "sessions", "lastVisit",
  "nextAppointment", "hepStatus", "followUpBooked", "clinician",
];

const ALL_SEQUENCE_TYPES: SequenceType[] = [
  "early_intervention", "rebooking_prompt", "hep_reminder",
  "review_prompt", "reactivation_90d", "reactivation_180d",
];

function defaultPreferences(userId: string, clinicId: string): UserPreferences {
  return {
    userId,
    clinicId,
    visibleSegments:      ALL_SEGMENTS,
    visibleMetrics:       ALL_METRICS,
    visibleSequenceTypes: ALL_SEQUENCE_TYPES,
    showRevenue:          true,
    updatedAt:            new Date().toISOString(),
  };
}

export function useUserPreferences() {
  const { user } = useAuth();
  const userId  = user?.uid ?? null;
  const clinicId = user?.clinicId ?? null;

  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!db || !userId || !clinicId) {
      setLoading(false);
      return;
    }

    const ref = doc(db, "user_preferences", userId);
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          setPreferences(snap.data() as UserPreferences);
        } else {
          setPreferences(defaultPreferences(userId, clinicId));
        }
      })
      .catch(() => {
        setPreferences(defaultPreferences(userId, clinicId));
      })
      .finally(() => setLoading(false));
  }, [userId, clinicId]);

  const updatePreferences = useCallback(
    (partial: Partial<UserPreferences>) => {
      if (!db || !userId || !clinicId) return;

      setPreferences((prev) => {
        const next = {
          ...(prev ?? defaultPreferences(userId, clinicId)),
          ...partial,
          updatedAt: new Date().toISOString(),
        };

        // Debounced Firestore write
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          setDoc(doc(db, "user_preferences", userId), next).catch(() => {});
        }, 500);

        return next;
      });
    },
    [userId, clinicId]
  );

  const prefs = preferences ?? (userId && clinicId ? defaultPreferences(userId, clinicId) : null);

  return { preferences: prefs, updatePreferences, loading };
}
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add dashboard/src/hooks/useUserPreferences.ts
git commit -m "feat(hooks): add useUserPreferences — reads/writes user_preferences Firestore doc"
```

---

## Chunk 7: Core UI Components

**Files (all new):**
- `dashboard/src/components/pulse/RiskScoreBadge.tsx`
- `dashboard/src/components/pulse/LifecycleStateBadge.tsx`
- `dashboard/src/components/pulse/RiskFactorPanel.tsx`
- `dashboard/src/components/pulse/SessionThresholdStrip.tsx`
- `dashboard/src/components/pulse/PatientBoard.tsx`

---

### Task 7.1 — `RiskScoreBadge.tsx`

- [ ] Create `dashboard/src/components/pulse/RiskScoreBadge.tsx`:

```typescript
import type { FC } from "react";

interface Props {
  score: number; // 0–100
  size?: "sm" | "md";
}

export const RiskScoreBadge: FC<Props> = ({ score, size = "md" }) => {
  const colour =
    score >= 60
      ? { bg: "bg-[#EF4444]/10", text: "text-[#EF4444]" }
      : score >= 40
      ? { bg: "bg-[#F59E0B]/10", text: "text-[#F59E0B]" }
      : { bg: "bg-[#10B981]/10", text: "text-[#10B981]" };

  const sizeClass = size === "sm" ? "text-[11px] px-1.5 py-0.5" : "text-xs px-2 py-1";

  return (
    <span
      className={`inline-flex items-center font-bold rounded-md tabular-nums ${sizeClass} ${colour.bg} ${colour.text}`}
    >
      {score}
    </span>
  );
};
```

---

### Task 7.2 — `LifecycleStateBadge.tsx`

- [ ] Create `dashboard/src/components/pulse/LifecycleStateBadge.tsx`:

```typescript
import type { FC } from "react";
import type { LifecycleState } from "@/types";

const STATE_STYLES: Record<LifecycleState, { bg: string; text: string; label: string }> = {
  NEW:        { bg: "bg-[#1C54F2]/10", text: "text-[#1C54F2]", label: "New" },
  ONBOARDING: { bg: "bg-[#1C54F2]/10", text: "text-[#1C54F2]", label: "Onboarding" },
  ACTIVE:     { bg: "bg-[#10B981]/10", text: "text-[#10B981]", label: "Active" },
  AT_RISK:    { bg: "bg-[#F59E0B]/10", text: "text-[#F59E0B]", label: "At Risk" },
  LAPSED:     { bg: "bg-orange-100",   text: "text-orange-600", label: "Lapsed" },
  RE_ENGAGED: { bg: "bg-[#0891B2]/10", text: "text-[#0891B2]", label: "Re-engaged" },
  DISCHARGED: { bg: "bg-gray-100",     text: "text-gray-500",  label: "Discharged" },
  CHURNED:    { bg: "bg-[#EF4444]/10", text: "text-[#EF4444]", label: "Churned" },
};

interface Props {
  state: LifecycleState;
}

export const LifecycleStateBadge: FC<Props> = ({ state }) => {
  const s = STATE_STYLES[state] ?? STATE_STYLES.ACTIVE;
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
};
```

---

### Task 7.3 — `RiskFactorPanel.tsx`

- [ ] Create `dashboard/src/components/pulse/RiskFactorPanel.tsx`:

```typescript
import type { FC } from "react";
import type { RiskFactors } from "@/types";

interface Props {
  factors: RiskFactors;
}

const FACTOR_CONFIG = [
  { key: "attendance",        label: "Attendance",         weight: 30, colour: "#0891B2" }, // Teal
  { key: "treatmentProgress", label: "Treatment Progress", weight: 25, colour: "#8B5CF6" }, // Purple
  { key: "hepEngagement",     label: "HEP Engagement",     weight: 20, colour: "#1C54F2" }, // Blue
  { key: "sentiment",         label: "Outcomes / Sentiment", weight: 15, colour: "#4B8BF5" }, // BlueGlow
  { key: "staticRisk",        label: "Patient Profile",    weight: 10, colour: "#64748B" }, // slate-500
] as const;

export const RiskFactorPanel: FC<Props> = ({ factors }) => {
  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
      {FACTOR_CONFIG.map(({ key, label, weight, colour }) => {
        const score = Math.round(factors[key] ?? 0);
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] text-muted w-36 shrink-0">{label} <span className="opacity-50">({weight}%)</span></span>
            <div className="flex-1 h-1.5 bg-cloud-dark rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${score}%`, backgroundColor: colour }}
              />
            </div>
            <span className="text-[10px] font-semibold text-navy w-6 text-right tabular-nums">{score}</span>
          </div>
        );
      })}
    </div>
  );
};
```

---

### Task 7.4 — `SessionThresholdStrip.tsx`

- [ ] Create `dashboard/src/components/pulse/SessionThresholdStrip.tsx`:

```typescript
"use client";

import type { FC } from "react";
import { Zap } from "lucide-react";
import type { Patient } from "@/types";
import type { Clinician } from "@/types";
import { daysSince } from "@/lib/utils";

interface Props {
  patients: Patient[];
  clinicianMap: Record<string, Clinician>;
  onSendEarlyIntervention: (patientId: string) => void;
}

export const SessionThresholdStrip: FC<Props> = ({
  patients,
  clinicianMap,
  onSendEarlyIntervention,
}) => {
  const onboarding = patients.filter((p) => p.sessionThresholdAlert);
  if (onboarding.length === 0) return null;

  return (
    <div
      className="rounded-[var(--radius-card)] border-l-4 border-[#0891B2] bg-[#0891B2]/5 border border-[#0891B2]/20 p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} className="text-[#0891B2]" />
        <h3 className="text-sm font-semibold text-[#0891B2]">
          Session 1–3 Early Intervention · {onboarding.length} patient{onboarding.length !== 1 ? "s" : ""}
        </h3>
        <span className="text-[10px] text-muted ml-1">Highest dropout risk window</span>
      </div>
      <div className="space-y-2">
        {onboarding.map((p) => {
          const clinician = clinicianMap[p.clinicianId];
          const lastSeen = p.lastSessionDate ? daysSince(p.lastSessionDate) : null;
          return (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#0891B2]/15 flex items-center justify-center text-[10px] font-bold text-[#0891B2] shrink-0">
                  {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy truncate">{p.name}</p>
                  <p className="text-[11px] text-muted">
                    Session {p.sessionCount} of {p.courseLength}
                    {clinician ? ` · ${clinician.name}` : ""}
                    {lastSeen !== null ? ` · Last seen ${lastSeen}d ago` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onSendEarlyIntervention(p.id)}
                className="text-[11px] font-semibold text-[#0891B2] hover:text-[#0670A0] transition-colors whitespace-nowrap shrink-0"
              >
                Send intervention →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

---

### Task 7.5 — `PatientBoard.tsx`

- [ ] Create `dashboard/src/components/pulse/PatientBoard.tsx`:

```typescript
"use client";

import { useState, type FC } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Patient, LifecycleState } from "@/types";
import type { Clinician } from "@/types";
import { RiskScoreBadge } from "./RiskScoreBadge";
import { LifecycleStateBadge } from "./LifecycleStateBadge";
import { RiskFactorPanel } from "./RiskFactorPanel";
import EmptyState from "@/components/ui/EmptyState";
import { daysSince } from "@/lib/utils";

interface Props {
  patients: Patient[];
  clinicianMap: Record<string, Clinician>;
  visibleSegments: LifecycleState[];
  visibleMetrics: string[];
  onSendReminder: (patientId: string) => void;
}

const SEGMENT_ORDER: LifecycleState[] = [
  "ONBOARDING", "ACTIVE", "AT_RISK", "LAPSED", "RE_ENGAGED", "NEW", "DISCHARGED", "CHURNED",
];

const SEGMENT_LABELS: Record<LifecycleState, string> = {
  NEW: "New", ONBOARDING: "Onboarding", ACTIVE: "Active", AT_RISK: "At Risk",
  LAPSED: "Lapsed", RE_ENGAGED: "Re-engaged", DISCHARGED: "Discharged", CHURNED: "Churned",
};

export const PatientBoard: FC<Props> = ({
  patients,
  clinicianMap,
  visibleSegments,
  visibleMetrics,
  onSendReminder,
}) => {
  const [collapsed, setCollapsed] = useState<Set<LifecycleState>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const grouped = SEGMENT_ORDER
    .filter((s) => visibleSegments.includes(s))
    .map((state) => ({
      state,
      patients: patients.filter((p) => (p.lifecycleState ?? "ACTIVE") === state),
    }))
    .filter((g) => g.patients.length > 0);

  if (grouped.length === 0) {
    return (
      <EmptyState module="pulse" heading="No patients match your filters" subtext="Adjust your segment filters in Customise View." />
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(({ state, patients: group }) => {
        const isCollapsed = collapsed.has(state);
        const avgRisk = group
          .filter((p) => p.riskScore !== undefined)
          .reduce((acc, p, _, arr) => acc + (p.riskScore ?? 0) / arr.length, 0);

        return (
          <div key={state} className="rounded-[var(--radius-card)] border border-border bg-white shadow-[var(--shadow-card)] overflow-hidden">
            <button
              onClick={() => setCollapsed((prev) => {
                const next = new Set(prev);
                isCollapsed ? next.delete(state) : next.add(state);
                return next;
              })}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-cloud-light/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {isCollapsed ? <ChevronRight size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                <LifecycleStateBadge state={state} />
                <span className="text-xs text-muted">{group.length} patient{group.length !== 1 ? "s" : ""}</span>
                {avgRisk > 0 && (
                  <span className="text-[10px] text-muted">· avg risk <RiskScoreBadge score={Math.round(avgRisk)} size="sm" /></span>
                )}
              </div>
            </button>

            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="divide-y divide-border/50">
                    {group.map((p) => {
                      const clinician = clinicianMap[p.clinicianId];
                      const isExpanded = expanded.has(p.id);
                      const lastSeen = p.lastSessionDate ? daysSince(p.lastSessionDate) : null;

                      return (
                        <div key={p.id} className="px-4 py-3">
                          <div
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => setExpanded((prev) => {
                              const next = new Set(prev);
                              isExpanded ? next.delete(p.id) : next.add(p.id);
                              return next;
                            })}
                          >
                            <div className="w-8 h-8 rounded-full bg-blue/10 flex items-center justify-center text-[10px] font-bold text-blue shrink-0">
                              {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-navy truncate">{p.name}</p>
                              <p className="text-[11px] text-muted">
                                {visibleMetrics.includes("sessions") && `${p.sessionCount}/${p.courseLength} sessions`}
                                {visibleMetrics.includes("clinician") && clinician ? ` · ${clinician.name}` : ""}
                                {visibleMetrics.includes("lastVisit") && lastSeen !== null ? ` · Last ${lastSeen}d ago` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {visibleMetrics.includes("riskScore") && p.riskScore !== undefined && (
                                <RiskScoreBadge score={p.riskScore} />
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); onSendReminder(p.id); }}
                                className="text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors"
                              >
                                Re-engage →
                              </button>
                            </div>
                          </div>

                          {isExpanded && p.riskFactors && (
                            <RiskFactorPanel factors={p.riskFactors} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] Run `npx tsc --noEmit` — fix any type errors (likely `Clinician` import path — check `@/types` for the Clinician export).

- [ ] Commit:
```bash
git add dashboard/src/components/pulse/
git commit -m "feat(ui): add core Pulse components — badges, risk panel, session strip, patient board"
```

---

## Chunk 8: Sequence & Customise UI

**Files (all new):**
- `dashboard/src/components/pulse/SequenceCard.tsx`
- `dashboard/src/components/pulse/CustomisePanel.tsx`

---

### Task 8.1 — `SequenceCard.tsx`

- [ ] Create `dashboard/src/components/pulse/SequenceCard.tsx`:

```typescript
"use client";

import { useState, type FC } from "react";
import { Mail, MessageSquare, Clock, Send, Eye, MousePointer, CalendarCheck, ChevronDown, ChevronRight, PoundSterling } from "lucide-react";
import type { SequenceDefinition } from "@/types/comms";

interface SequenceStats {
  sent: number;
  opened: number;
  clicked: number;
  rebooked: number;
  attributedRevenuePence: number;
}

interface Props {
  definition: SequenceDefinition;
  stats: SequenceStats;
  showRevenue: boolean;
  onToggle: (active: boolean) => void;
}

const CHANNEL_ICONS = {
  sms:      <MessageSquare size={14} />,
  email:    <Mail size={14} />,
  whatsapp: <MessageSquare size={14} />,
};

export const SequenceCard: FC<Props> = ({ definition, stats, showRevenue, onToggle }) => {
  const [expanded, setExpanded] = useState(false);

  const conversionRate = stats.sent > 0
    ? Math.round((stats.rebooked / stats.sent) * 100)
    : 0;

  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden transition-all hover:shadow-[var(--shadow-elevated)]">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0891B2]/10 flex items-center justify-center shrink-0">
              {definition.steps[0]?.channel === "sms"
                ? <MessageSquare size={16} className="text-[#0891B2]" />
                : <Mail size={16} className="text-[#0891B2]" />}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-navy">{definition.name}</h4>
              <p className="text-xs text-muted mt-0.5">
                {definition.steps.length} step{definition.steps.length !== 1 ? "s" : ""} ·{" "}
                {definition.attributionWindowDays
                  ? `${definition.attributionWindowDays}d attribution window`
                  : "no attribution"}
              </p>
              <button
                onClick={() => setExpanded((e) => !e)}
                className="text-[11px] font-semibold text-[#0891B2] hover:text-[#0670A0] transition-colors mt-1 flex items-center gap-1"
              >
                {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                View cadence
              </button>
            </div>
          </div>
          <button
            onClick={() => onToggle(!definition.active)}
            className="shrink-0 ml-2"
            title={definition.active ? "Disable sequence" : "Enable sequence"}
          >
            <div className={`w-10 h-5 rounded-full transition-colors relative ${definition.active ? "bg-[#0891B2]" : "bg-gray-200"}`}>
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${definition.active ? "left-5.5" : "left-0.5"}`} style={{ left: definition.active ? "1.375rem" : "0.125rem" }} />
            </div>
          </button>
        </div>

        {stats.sent > 0 && (
          <div className={`grid gap-3 pt-3 border-t border-border/50 ${showRevenue ? "grid-cols-5" : "grid-cols-4"}`}>
            <div className="text-center">
              <p className="font-display text-lg text-navy">{stats.sent}</p>
              <p className="text-[10px] text-muted flex items-center justify-center gap-1"><Send size={9} /> Sent</p>
            </div>
            <div className="text-center">
              <p className="font-display text-lg text-navy">{stats.opened}</p>
              <p className="text-[10px] text-muted flex items-center justify-center gap-1"><Eye size={9} /> Opened</p>
            </div>
            <div className="text-center">
              <p className="font-display text-lg text-navy">{stats.clicked}</p>
              <p className="text-[10px] text-muted flex items-center justify-center gap-1"><MousePointer size={9} /> Clicked</p>
            </div>
            <div className="text-center">
              <p className="font-display text-lg text-navy">{conversionRate}%</p>
              <p className="text-[10px] text-muted flex items-center justify-center gap-1"><CalendarCheck size={9} /> Rebooked</p>
            </div>
            {showRevenue && (
              <div className="text-center">
                <p className="font-display text-lg text-[#0891B2]">
                  £{(stats.attributedRevenuePence / 100).toFixed(0)}
                </p>
                <p className="text-[10px] text-muted flex items-center justify-center gap-1"><PoundSterling size={9} /> Recovered</p>
              </div>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border/50 bg-cloud-light/30 px-5 py-3 space-y-2">
          {definition.steps.map((step) => (
            <div key={step.stepNumber} className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-[#0891B2]/10 text-[#0891B2] text-[10px] font-bold flex items-center justify-center shrink-0">
                {step.stepNumber}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cloud-dark text-muted shrink-0">
                {CHANNEL_ICONS[step.channel]}
                {step.channel.toUpperCase()}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted shrink-0">
                <Clock size={9} />
                Day {step.daysAfterTrigger}
              </span>
              <span className="text-[10px] text-muted font-mono truncate">{step.templateKey}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

---

### Task 8.2 — `CustomisePanel.tsx`

- [ ] Create `dashboard/src/components/pulse/CustomisePanel.tsx`:

```typescript
"use client";

import { type FC } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { LifecycleState, SequenceType } from "@/types";
import type { UserPreferences } from "@/hooks/useUserPreferences";

interface Props {
  open: boolean;
  onClose: () => void;
  preferences: UserPreferences;
  onUpdate: (partial: Partial<UserPreferences>) => void;
}

const SEGMENTS: { value: LifecycleState; label: string }[] = [
  { value: "ONBOARDING",  label: "Onboarding (sessions 1–3)" },
  { value: "ACTIVE",      label: "Active" },
  { value: "AT_RISK",     label: "At Risk" },
  { value: "LAPSED",      label: "Lapsed" },
  { value: "RE_ENGAGED",  label: "Re-engaged" },
  { value: "DISCHARGED",  label: "Discharged" },
  { value: "CHURNED",     label: "Churned" },
  { value: "NEW",         label: "New (no sessions yet)" },
];

const METRICS: { value: string; label: string }[] = [
  { value: "riskScore",        label: "Risk Score" },
  { value: "lifecycleState",   label: "Lifecycle State" },
  { value: "sessions",         label: "Session Count" },
  { value: "lastVisit",        label: "Last Visit" },
  { value: "nextAppointment",  label: "Next Appointment" },
  { value: "hepStatus",        label: "HEP Status" },
  { value: "followUpBooked",   label: "Follow-up Booked" },
  { value: "clinician",        label: "Clinician" },
];

const SEQUENCES: { value: SequenceType; label: string }[] = [
  { value: "early_intervention", label: "Early Intervention" },
  { value: "rebooking_prompt",   label: "Re-booking Prompt" },
  { value: "hep_reminder",       label: "HEP Reminder" },
  { value: "review_prompt",      label: "Review Prompt" },
  { value: "reactivation_90d",   label: "90-Day Reactivation" },
  { value: "reactivation_180d",  label: "180-Day Reactivation" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${checked ? "bg-[#0891B2]" : "bg-gray-200"}`}
    >
      <div
        className="w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all"
        style={{ left: checked ? "1.25rem" : "0.125rem" }}
      />
    </button>
  );
}

function ToggleGroup<T extends string>({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T, checked: boolean) => void;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-navy uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-2.5">
        {items.map(({ value, label }) => (
          <div key={value} className="flex items-center justify-between gap-3">
            <span className="text-sm text-navy">{label}</span>
            <Toggle
              checked={selected.includes(value)}
              onChange={(v) => onToggle(value, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export const CustomisePanel: FC<Props> = ({ open, onClose, preferences, onUpdate }) => {
  function toggleSegment(value: LifecycleState, checked: boolean) {
    const next = checked
      ? [...preferences.visibleSegments, value]
      : preferences.visibleSegments.filter((s) => s !== value);
    onUpdate({ visibleSegments: next });
  }

  function toggleMetric(value: string, checked: boolean) {
    const next = checked
      ? [...preferences.visibleMetrics, value]
      : preferences.visibleMetrics.filter((m) => m !== value);
    onUpdate({ visibleMetrics: next });
  }

  function toggleSequenceType(value: SequenceType, checked: boolean) {
    const next = checked
      ? [...preferences.visibleSequenceTypes, value]
      : preferences.visibleSequenceTypes.filter((s) => s !== value);
    onUpdate({ visibleSequenceTypes: next });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-navy/20 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white shadow-[var(--shadow-elevated)] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white border-b border-border px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={15} className="text-[#0891B2]" />
                <h2 className="text-sm font-semibold text-navy">Customise View</h2>
              </div>
              <button onClick={onClose} className="text-muted hover:text-navy transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-7">
              <ToggleGroup
                title="Patient Segments"
                items={SEGMENTS}
                selected={preferences.visibleSegments}
                onToggle={toggleSegment}
              />
              <div className="border-t border-border/50" />
              <ToggleGroup
                title="Metric Columns"
                items={METRICS}
                selected={preferences.visibleMetrics}
                onToggle={toggleMetric}
              />
              <div className="border-t border-border/50" />
              <ToggleGroup
                title="Sequence Types"
                items={SEQUENCES}
                selected={preferences.visibleSequenceTypes}
                onToggle={toggleSequenceType}
              />
              <div className="border-t border-border/50" />
              <div>
                <h3 className="text-xs font-semibold text-navy uppercase tracking-wide mb-3">Revenue</h3>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-navy">Show attributed revenue</span>
                  <Toggle
                    checked={preferences.showRevenue}
                    onChange={(v) => onUpdate({ showRevenue: v })}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add dashboard/src/components/pulse/SequenceCard.tsx dashboard/src/components/pulse/CustomisePanel.tsx
git commit -m "feat(ui): add SequenceCard and CustomisePanel components"
```

---

## Chunk 9: Hook Extensions + Page Wire-up

**Files:**
- Modify: `dashboard/src/hooks/usePatients.ts`
- Modify: `dashboard/src/hooks/useSequences.ts`
- Modify: `dashboard/src/hooks/useCommsLog.ts`
- Modify: `dashboard/src/app/continuity/page.tsx`

---

### Task 9.1 — Extend `usePatients.ts`

- [ ] Open `dashboard/src/hooks/usePatients.ts`. Add `byLifecycleState` derived map alongside existing `active`/`churnRisk`/`postDischarge`:

```typescript
  const byLifecycleState = useMemo(() => {
    const map = new Map<string, Patient[]>();
    for (const p of patients) {
      const state = p.lifecycleState ?? "ACTIVE";
      if (!map.has(state)) map.set(state, []);
      map.get(state)!.push(p);
    }
    return map;
  }, [patients]);

  const sessionAlerts = useMemo(
    () => patients.filter((p) => p.sessionThresholdAlert),
    [patients]
  );
```

- [ ] Add `byLifecycleState` and `sessionAlerts` to the return object:
```typescript
  return { patients, active, churnRisk, postDischarge, byLifecycleState, sessionAlerts, loading, error };
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add dashboard/src/hooks/usePatients.ts
git commit -m "feat(hooks): add byLifecycleState and sessionAlerts to usePatients"
```

---

### Task 9.2 — Extend `useSequences.ts` to read from `sequence_definitions`

- [ ] Open `dashboard/src/hooks/useSequences.ts`. Replace the entire file with:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useCommsLog } from "@/hooks/useCommsLog";
import type { CommsLogEntry, SequenceType } from "@/types";
import type { SequenceDefinition } from "@/types/comms";

export interface SequenceWithStats extends SequenceDefinition {
  sent: number;
  opened: number;
  clicked: number;
  rebooked: number;
  attributedRevenuePence: number;
}

function computeStats(
  log: CommsLogEntry[],
  sequenceType: SequenceType
): { sent: number; opened: number; clicked: number; rebooked: number; attributedRevenuePence: number } {
  const filtered = log.filter((e) => e.sequenceType === sequenceType);
  return {
    sent:                   filtered.length,
    opened:                 filtered.filter((e) => e.openedAt).length,
    clicked:                filtered.filter((e) => e.clickedAt).length,
    rebooked:               filtered.filter((e) => e.outcome === "booked").length,
    attributedRevenuePence: filtered.reduce((sum, e) => sum + ((e as { attributedRevenuePence?: number }).attributedRevenuePence ?? 0), 0),
  };
}

export function useSequences() {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const { commsLog } = useCommsLog();

  const [definitions, setDefinitions] = useState<SequenceDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !clinicId) { setLoading(false); return; }

    const ref = collection(db, "clinics", clinicId, "sequence_definitions");
    const unsub: Unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const defs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as SequenceDefinition))
          .sort((a, b) => a.priority - b.priority);
        setDefinitions(defs);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [clinicId]);

  const toggleSequence = useCallback(
    async (definitionId: string, active: boolean) => {
      if (!db || !clinicId) return;
      // Optimistic
      setDefinitions((prev) =>
        prev.map((d) => (d.id === definitionId ? { ...d, active } : d))
      );
      try {
        await updateDoc(
          doc(db, "clinics", clinicId, "sequence_definitions", definitionId),
          { active }
        );
      } catch {
        // Revert
        setDefinitions((prev) =>
          prev.map((d) => (d.id === definitionId ? { ...d, active: !active } : d))
        );
      }
    },
    [clinicId]
  );

  const sequences: SequenceWithStats[] = definitions.map((def) => ({
    ...def,
    ...computeStats(commsLog, def.sequenceType),
  }));

  return { sequences, toggleSequence, loading };
}
```

- [ ] **Update `firestore.rules`** — the rule added in Task 5.2 set `allow write: if false` for `sequence_definitions`. The toggle in `useSequences` uses `updateDoc` from the client SDK, which requires write access. Update the rule in `firestore.rules` to:
```
      match /sequence_definitions/{defId} {
        allow read: if isClinicMember(clinicId) || isSuperAdmin();
        allow update: if isClinicOwnerOrAdmin(clinicId) || isSuperAdmin();
        allow create, delete: if false;
      }
```
**Note:** Do not deploy Chunk 5 to production in isolation — the toggle will fail until this Task 9.2 rule update is also deployed.

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add dashboard/src/hooks/useSequences.ts dashboard/firestore.rules
git commit -m "feat(hooks): migrate useSequences to read sequence_definitions from Firestore"
```

---

### Task 9.3 — Extend `useCommsLog.ts` with attribution aggregates

- [ ] Open `dashboard/src/hooks/useCommsLog.ts`. Add the new return fields to `UseCommsLogResult`:

```typescript
export interface UseCommsLogResult {
  commsLog:                    CommsLogEntry[];
  commsStats:                  CommsStats;
  attributionBySequence:       Record<string, { count: number; totalRevenuePence: number }>;
  totalAttributedRevenuePence: number;
  attributedThisMonthPence:    number;
  loading:                     boolean;
  isDemo:                      boolean;
  error:                       string | null;
}
```

- [ ] Add the `deriveAttribution` helper and wire it into the return:

```typescript
function deriveAttribution(log: CommsLogEntry[]): {
  attributionBySequence: Record<string, { count: number; totalRevenuePence: number }>;
  totalAttributedRevenuePence: number;
  attributedThisMonthPence: number;
} {
  const attributed = log.filter((e) => e.outcome === "booked" && (e as { attributedRevenuePence?: number }).attributedRevenuePence);
  const bySequence: Record<string, { count: number; totalRevenuePence: number }> = {};

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let total = 0;
  let thisMonth = 0;

  for (const entry of attributed) {
    const rev = (entry as { attributedRevenuePence?: number }).attributedRevenuePence ?? 0;
    const key = entry.sequenceType ?? "unknown";
    if (!bySequence[key]) bySequence[key] = { count: 0, totalRevenuePence: 0 };
    bySequence[key].count++;
    bySequence[key].totalRevenuePence += rev;
    total += rev;
    if (new Date(entry.sentAt) >= startOfMonth) thisMonth += rev;
  }

  return {
    attributionBySequence: bySequence,
    totalAttributedRevenuePence: total,
    attributedThisMonthPence: thisMonth,
  };
}
```

- [ ] In the `return` statements of `useCommsLog`, add the new fields. Replace both return statements:

The demo return (inside `if (isDemo)`) becomes:
```typescript
  if (isDemo) {
    return {
      commsLog:                    getDemoCommsLog(),
      commsStats:                  getDemoCommsStats(),
      attributionBySequence:       {},
      totalAttributedRevenuePence: 0,
      attributedThisMonthPence:    0,
      loading,
      isDemo:                      true,
      error:                       null,
    };
  }
```

The real data return becomes:
```typescript
  const attribution = deriveAttribution(commsLog);
  return {
    commsLog,
    commsStats: deriveStats(commsLog),
    ...attribution,
    loading,
    isDemo: false,
    error,
  };
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add dashboard/src/hooks/useCommsLog.ts
git commit -m "feat(hooks): add attribution aggregates to useCommsLog"
```

---

### Task 9.4 — Wire everything into `continuity/page.tsx`

This is the final assembly. Replace the contents of `dashboard/src/app/continuity/page.tsx`:

- [ ] At the top, update imports to add:
```typescript
import { useState, Suspense } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { SessionThresholdStrip } from "@/components/pulse/SessionThresholdStrip";
import { PatientBoard } from "@/components/pulse/PatientBoard";
import { SequenceCard } from "@/components/pulse/SequenceCard";
import { CustomisePanel } from "@/components/pulse/CustomisePanel";
```

- [ ] In the `ContinuityPage` function, add:
```typescript
  const { preferences, updatePreferences } = useUserPreferences();
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const { patients, sessionAlerts, loading } = usePatients(selectedClinician);
  const { sequences, toggleSequence } = useSequences();
  const { commsLog, commsStats, totalAttributedRevenuePence, attributedThisMonthPence, isDemo: commsIsDemo } = useCommsLog();
```

- [ ] **Check `PageHeader` props**: Open `dashboard/src/components/ui/PageHeader.tsx`. If it does not accept an `actions` prop, add `actions?: React.ReactNode` to its props interface and render `{actions}` in the top-right slot. Then use:
```typescript
      <PageHeader
        title="Pulse"
        subtitle="Track patient journeys, manage comms sequences, and reduce drop-off"
        clinicians={clinicians}
        selectedClinician={selectedClinician}
        onClinicianChange={setSelectedClinician}
        accentColor="#0891B2"
        actions={
          <button
            onClick={() => setCustomiseOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-navy transition-colors px-3 py-1.5 rounded-lg border border-border hover:border-navy/30"
          >
            <SlidersHorizontal size={13} />
            Customise View
          </button>
        }
      />
```
If `PageHeader` cannot accept `actions`, render the button immediately after the `<PageHeader ... />` line inside a flex wrapper instead.

- [ ] Replace the Patient Board view section with:
```typescript
      {activeView === "patients" && preferences && (
        <div className="animate-fade-in space-y-5">
          <SessionThresholdStrip
            patients={sessionAlerts}
            clinicianMap={clinicianMap}
            onSendEarlyIntervention={async (patientId) => {
              // Reuse existing handleSendReminder logic, sequenceType = 'early_intervention'
              const patient = patients.find((p) => p.id === patientId);
              if (!patient) return;
              const to = patient.contact.phone ?? patient.contact.email;
              const channel = patient.contact.phone ? "sms" : "email";
              if (!to || !user?.clinicId) return;
              try {
                await fetch("/api/comms/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    clinicId: user.clinicId,
                    patientId: patient.id,
                    patientName: patient.name,
                    sequenceType: "early_intervention",
                    channel,
                    to,
                    body: `Hi ${patient.name.split(" ")[0]}, your physio wanted to check in before your next session. How are you getting on with your exercises? Reply here or call us to chat.`,
                  }),
                });
                toast(`Early intervention sent to ${patient.name}`, "success");
              } catch {
                toast(`Failed to send to ${patient.name}`, "error");
              }
            }}
          />

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 skeleton-shimmer rounded-[var(--radius-card)]" />
              ))}
            </div>
          ) : (
            <PatientBoard
              patients={patients}
              clinicianMap={clinicianMap}
              visibleSegments={preferences.visibleSegments}
              visibleMetrics={preferences.visibleMetrics}
              onSendReminder={handleSendReminder}
            />
          )}
        </div>
      )}
```

- [ ] Replace the Comms Sequences view section with:
```typescript
      {activeView === "sequences" && preferences && (
        <div className="space-y-4 animate-fade-in">
          {preferences.showRevenue && (totalAttributedRevenuePence > 0) && (
            <div className="rounded-[var(--radius-card)] bg-[#0891B2]/5 border border-[#0891B2]/20 p-4 flex items-center gap-3">
              <span className="text-sm text-navy font-medium">
                Total recovered via Pulse this month:
              </span>
              <span className="font-display text-xl text-[#0891B2]">
                £{(attributedThisMonthPence / 100).toFixed(0)}
              </span>
            </div>
          )}
          {sequences
            .filter((s) => preferences.visibleSequenceTypes.includes(s.sequenceType))
            .map((seq) => (
              <SequenceCard
                key={seq.id}
                definition={seq}
                stats={seq}
                showRevenue={preferences.showRevenue}
                onToggle={(active) => toggleSequence(seq.id, active)}
              />
            ))}
        </div>
      )}
```

- [ ] Update the Send Log view to add reply badge and attribution tag per row. In the table body, after the outcome cell add:
```typescript
                        <td className="py-3 px-4">
                          {(entry as { inboundReply?: string }).inboundReply ? (
                            <span title={(entry as { inboundReply?: string }).inboundReply ?? ""} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#0891B2]/10 text-[#0891B2] cursor-help">
                              Reply ↩
                            </span>
                          ) : null}
                          {(entry as { attributedRevenuePence?: number }).attributedRevenuePence ? (
                            <span className="text-[10px] font-semibold text-[#0891B2] ml-1">
                              £{((entry as { attributedRevenuePence?: number }).attributedRevenuePence! / 100).toFixed(0)} recovered
                            </span>
                          ) : null}
                        </td>
```

- [ ] Add `CustomisePanel` just before the closing `</div>`:
```typescript
      <CustomisePanel
        open={customiseOpen}
        onClose={() => setCustomiseOpen(false)}
        preferences={preferences ?? { visibleSegments: [], visibleMetrics: [], visibleSequenceTypes: [], showRevenue: true, userId: "", clinicId: "", updatedAt: "" }}
        onUpdate={updatePreferences}
      />
```

- [ ] Run `npx tsc --noEmit` — fix any remaining type errors.

- [ ] Run `npm run build` — must pass with 0 errors.

- [ ] Commit:
```bash
git add dashboard/src/app/continuity/page.tsx
git commit -m "feat(ui): wire Pulse retention engine into continuity page — board, sequences, customise panel"
```

---

## Final verification

- [ ] Run `cd dashboard && npm run build` — must complete with 0 errors and 0 type errors.

- [ ] Deploy to Vercel staging (or local `npm run dev`) and verify:
  - Pulse page loads without error
  - Customise View panel opens and toggles persist across page reload
  - Session Threshold Strip appears when ONBOARDING patients exist
  - Patient Board groups by lifecycleState, expands risk factor panel on click
  - Comms Sequences tab shows SequenceCards with stats
  - Send Log shows reply badge and attribution tag where data exists

- [ ] Final commit:
```bash
git add -A
git commit -m "feat(pulse): complete retention engine — risk scoring, lifecycle states, attribution, UI overhaul"
```
