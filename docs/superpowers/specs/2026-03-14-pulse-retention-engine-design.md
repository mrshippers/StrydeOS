# Pulse Retention Engine — Design Spec
**Date:** 2026-03-14
**Status:** Approved
**Author:** Brainstorming session (Jamal + Claude)
**Approach:** Parallel tracks — type contracts first, then backend + frontend simultaneously

---

## 1. Context & Scope

StrydeOS Pulse currently provides: a patient board segmented by churn risk, 6 hard-coded comms sequence types, an n8n/Twilio outbound SMS + Resend email stack, and a send log. The `churnRisk` field on the Patient document is a boolean derived from 14 days of inactivity.

This spec upgrades Pulse to a full **patient retention engine** covering:

1. **Risk engine** — weighted 0–100 risk score + 7-state lifecycle machine (additive to existing `churnRisk`)
2. **Sequence engine** — Firestore-driven 6-touch escalating cadence, configurable per clinic, dedicated session-3 early intervention track
3. **Revenue attribution** — last-touch with per-sequence configurable attribution windows
4. **Inbound SMS logging** — raw reply text captured in `comms_log` (log-only, no auto-response)
5. **Pulse UI overhaul** — full dashboard with customisable toggle system per user

All changes are **additive**. The existing `churnRisk` boolean, `usePatients` hook shape, `trigger-sequences.ts` sequence types, and n8n workflow 06 remain intact and functional throughout.

---

## 2. Parallel Build Tracks

### Track 1 — Backend
Files touched: `types/index.ts`, `types/comms.ts`, `lib/pipeline/compute-patients.ts`, `lib/comms/trigger-sequences.ts`, `lib/pipeline/run-pipeline.ts`, `app/api/n8n/callback/route.ts`, `docs/n8n-workflows/06-pulse-sms-sequences.json`

New files: `lib/pipeline/compute-risk-score.ts`, `lib/pipeline/compute-attribution.ts`

New Firestore collections: `sequence_definitions`, `user_preferences`

### Track 2 — Frontend
Files touched: `app/continuity/page.tsx`, `hooks/usePatients.ts`, `hooks/useSequences.ts`, `hooks/useCommsLog.ts`

New files: `hooks/useUserPreferences.ts`, `components/pulse/*`

Both tracks share the type extensions defined in Section 3 as their interface contract.

---

## 3. Data Model Extensions

### 3.1 Patient document — new fields (additive)

Existing fields (`churnRisk`, `discharged`, `sessionCount`, etc.) are untouched.

```typescript
// Additive to existing Patient interface in types/index.ts
lifecycleState?: LifecycleState
riskScore?: number                    // 0–100 weighted composite
riskFactors?: RiskFactors
sessionThresholdAlert?: boolean       // true when lifecycleState = 'ONBOARDING' (sessions 1–3)
lifecycleUpdatedAt?: string           // ISO string
```

```typescript
type LifecycleState =
  | 'NEW'          // sessionCount = 0
  | 'ONBOARDING'   // sessionCount 1–3
  | 'ACTIVE'       // sessionCount > 3, nextSessionDate present
  | 'AT_RISK'      // riskScore >= 60, not discharged
  | 'LAPSED'       // no appointment in 14+ days, no future booking
  | 'RE_ENGAGED'   // was LAPSED/AT_RISK, new appointment booked within attribution window
  | 'DISCHARGED'   // discharged = true (existing flag drives this)
  | 'CHURNED'      // LAPSED for 60+ days, no response to any sequence

interface RiskFactors {
  attendance: number         // 0–100, weight 30%
  treatmentProgress: number  // 0–100, weight 25%
  hepEngagement: number      // 0–100, weight 20%
  sentiment: number          // 0–100, weight 15%
  staticRisk: number         // 0–100, weight 10%
}
```

### 3.2 CommsLogEntry — new fields (additive)

```typescript
// Additive to existing CommsLogEntry interface in types/index.ts
stepNumber?: number                          // which step in the 6-touch cadence (1–6)
attributionWindowDays?: number               // from sequence_definition at time of send
patientLifecycleStateAtSend?: LifecycleState // patient's lifecycleState when this message was sent; used by attribution query
attributedRevenuePence?: number              // populated when outcome = 'booked'
attributedAppointmentId?: string             // the appointment that closed the attribution loop
inboundReply?: string | null                 // raw SMS reply text from patient
inboundAt?: string | null                    // ISO string
```

`patientLifecycleStateAtSend` is written by `trigger-sequences.ts` at send time, copied from the patient's current `lifecycleState`. This is required by the attribution query in Section 6.1 which filters `comms_log` entries by this field.

### 3.3 SequenceType — new types (additive)

```typescript
// Additive to SequenceType union in types/comms.ts
type SequenceType =
  | 'hep_reminder'
  | 'rebooking_prompt'
  | 'pre_auth_collection'
  | 'review_prompt'
  | 'reactivation_90d'
  | 'reactivation_180d'
  | 'early_intervention'      // NEW — sessions 1–3 focused
```

### 3.4 New Firestore collection — `sequence_definitions/{sequenceId}`

Path: `clinics/{clinicId}/sequence_definitions/{sequenceId}`

```typescript
interface SequenceDefinition {
  id: string
  name: string
  sequenceType: SequenceType
  steps: SequenceStep[]
  attributionWindowDays: number | null  // null for sequences where attribution is not applicable (e.g. pre_auth_collection)
  exitConditions: ExitCondition[]       // ['appointment_booked', 'unsubscribed', 'discharged', 're_engaged']
  cooldownDays: number                  // min days before same sequence re-fires to same patient
  active: boolean
  priority: number                      // lower = higher priority; early_intervention = 1
}

interface SequenceStep {
  stepNumber: number                    // 1–6
  daysAfterTrigger: number             // days after the sequence trigger event (not after previous step)
  channel: CommsChannel
  templateKey: string                   // references message template
}
```

**Relationship to existing `CommsSequenceConfig` / `DEFAULT_SEQUENCES`:**
`SequenceDefinition` replaces `CommsSequenceConfig` as the runtime sequence configuration. `DEFAULT_SEQUENCES` in `types/comms.ts` becomes the seed data source used to populate `sequence_definitions` on first pipeline run — it is not read at runtime after seeding. `useSequences.ts` migrates to read from `clinics/{clinicId}/sequence_definitions` instead of `clinics/{clinicId}/settings/comms_sequences`. The enabled/disabled toggle state for each sequence moves to `SequenceDefinition.active`. The `settings/comms_sequences` document is preserved in Firestore (backward compat) but is no longer the source of truth — it is ignored by the new system.

Default definitions seeded on first pipeline run if collection empty:

| sequenceType | steps | attributionWindowDays | cooldownDays | priority |
|---|---|---|---|---|
| `early_intervention` | 2 (1d SMS, 3d Email) | 5 | 3 | 1 |
| `rebooking_prompt` | 4 (1d SMS, 3d Email, 7d SMS, 14d SMS) | 7 | 7 | 2 |
| `hep_reminder` | 2 (1d Email, 3d Email) | 7 | 7 | 3 |
| `review_prompt` | 2 (3d SMS, 7d SMS) | 14 | 30 | 4 |
| `reactivation_90d` | 6 (full cadence) | 30 | 90 | 5 |
| `reactivation_180d` | 6 (full cadence) | 30 | 90 | 6 |
| `pre_auth_collection` | 1 (0d Email) | null | 3 | 7 |

### 3.5 New Firestore collection — `user_preferences/{userId}`

Path: `user_preferences/{userId}` (top-level, not clinic-scoped — preferences follow the user)

```typescript
interface UserPreferences {
  userId: string
  clinicId: string
  visibleSegments: LifecycleState[]        // which lifecycle states to show on board
  visibleMetrics: string[]                 // column keys to display
  visibleSequenceTypes: SequenceType[]     // which sequence cards to show
  showRevenue: boolean                     // toggle attribution £ figures
  updatedAt: string                        // ISO string
}
```

Default: all segments, all metrics, all sequences, revenue visible.

---

## 4. Risk Score Engine

New file: `lib/pipeline/compute-risk-score.ts`

Runs as a sub-step of Stage 5 (`computePatientFields`), after existing discharge/churnRisk logic.

### 4.1 Factor computation

**attendance (weight 30%)**
```
base = (sessionsAttended ÷ sessionsScheduled in last 4 weeks) × 100
penalty: -20 if any DNA in first 3 sessions
floor: 0
```

**treatmentProgress (weight 25%)**
```
base = (sessionCount ÷ courseLength) × 100
bonus: +15 if followUpBooked = true on most recent completed appointment
penalty: -25 if sessionCount < 3 AND no nextSessionDate (session-3 cliff risk)
floor: 0
```

**hepEngagement (weight 20%)**
```
100 if hepProgramId present AND HEP provider compliance data received
50  if hepProgramId present, no compliance data
0   if no hepProgramId
```

**sentiment (weight 15%)**
```
Derived from most recent OutcomeScore if available (NPRS improvement, PSFS progression).
100 = measurable positive change
50  = stable / no data
0   = deterioration detected
NPS score feeds in when available (mapped to 0–100)
Default: 50 (neutral)
```

**staticRisk (weight 10%)**
```
baseline: 70
-30 if insuranceFlag = true
-20 if sessionCount = 1 AND no followUpBooked on initial assessment
floor: 0
```

### 4.2 Composite score

```
riskScore = (attendance × 0.30) + (treatmentProgress × 0.25) + (hepEngagement × 0.20) + (sentiment × 0.15) + (staticRisk × 0.10)
```

riskScore ≥ 60 → `lifecycleState` transitions to `AT_RISK`

### 4.3 Lifecycle state assignment

State is assigned after riskScore is computed. Precedence (highest to lowest):

```
1. CHURNED:     churnRisk=true AND lastSequenceSentAt > 60 days ago (no engagement)
2. DISCHARGED:  discharged=true (existing flag)
3. RE_ENGAGED:  existingLifecycleState is 'LAPSED' or 'AT_RISK' AND nextSessionDate is now present
4. AT_RISK:     riskScore >= 60 AND !discharged
5. LAPSED:      daysSinceLastSession > 14 AND !nextSessionDate AND !discharged (≡ churnRisk)
6. ONBOARDING:  sessionCount >= 1 AND sessionCount <= 3
7. NEW:         sessionCount = 0
8. ACTIVE:      all other cases
```

**RE_ENGAGED detection:** `compute-risk-score.ts` receives the patient's existing Firestore document (passed by `compute-patients.ts` which already reads the full patient doc before computing). The existing `patient.lifecycleState` field on that document represents the prior state. If `patient.lifecycleState` is `'LAPSED'` or `'AT_RISK'` and `nextSessionDate` is now present, the new state is `RE_ENGAGED`. No separate Firestore read is required.

`sessionThresholdAlert = (lifecycleState === 'ONBOARDING')`

### 4.4 Integration into pipeline

`compute-patients.ts` calls `computeRiskScore(patient, appointments)` after existing field derivation, passing the full existing patient document so the prior `lifecycleState` is available for RE_ENGAGED detection. New fields written to Firestore in the same batch update. Existing `churnRisk` and `discharged` fields unchanged.

---

## 5. Sequence Engine

### 5.1 sequence_definitions seeding

`trigger-sequences.ts` loads sequence definitions from Firestore at the start of each pipeline run. If the collection is empty (first run), it seeds the default definitions before proceeding.

### 5.2 Eligibility evaluation

For each patient, each active sequence definition is evaluated in priority order:

**early_intervention** — fires when:
- `sessionThresholdAlert = true` (sessions 1–3)
- No `early_intervention` sent in last `cooldownDays`
- `nextSessionDate` not present (dropout risk present)

**rebooking_prompt** — fires when:
- `churnRisk = true` AND `sessionCount >= 2`
- No `rebooking_prompt` sent in last `cooldownDays`

**hep_reminder** — fires when:
- `lastSessionDate` within 20–48h ago AND `nextSessionDate` absent
- `hepProgramId` present
- No `hep_reminder` sent in last `cooldownDays`

**review_prompt** — fires when:
- `discharged = true` AND `lastSessionDate` within 48–80h ago
- No `review_prompt` sent in last `cooldownDays`

**reactivation_90d** — fires when:
- `discharged = true` AND `lastSessionDate` 88–94 days ago
- No `reactivation_90d` sent in last `cooldownDays`

**reactivation_180d** — fires when:
- `discharged = true` AND `lastSessionDate` 178–184 days ago
- No `reactivation_180d` sent in last `cooldownDays`

**pre_auth_collection** — unchanged from current implementation

### 5.3 Step number tracking

The deduplication query now checks per-step, not per-sequence-type. `stepNumber` is stored on every `comms_log` entry at write time.

**Step progression algorithm** (run per patient per eligible sequence, inside `trigger-sequences.ts`):

1. Query `comms_log` for all entries where `patientId` matches and `sequenceType` matches, ordered by `sentAt` DESC.
2. If no entries exist: this is step 1. Fire if the patient is eligible and `daysAfterTrigger` (day 1 = 1) has elapsed since the eligibility trigger date.
3. If entries exist: take the most recent entry's `stepNumber`. The next step is `stepNumber + 1`. Look up that step's `daysAfterTrigger` from the sequence definition. Fire if `(now - eligibilityTriggerDate) >= daysAfterTrigger`.
4. If `stepNumber + 1` exceeds the total steps in the definition: sequence is complete, do not fire.
5. If the most recent entry's `outcome` is `'unsubscribed'`: do not fire any further steps.
6. Steps are keyed to `daysAfterTrigger` from the **trigger event date** (not from the previous step's `sentAt`). This means if a step fires late, subsequent steps still fire at their scheduled offset from the original trigger — there is no cascading delay.

The **eligibility trigger date** is the event that caused the patient to become eligible for the sequence:
- `early_intervention` / `rebooking_prompt`: the date `nextSessionDate` became absent (approximated as `lastSessionDate + 1 day`)
- `hep_reminder`: `lastSessionDate`
- `review_prompt` / `reactivation_*`: `lastSessionDate`

### 5.4 n8n payload extension

Existing payload structure extended with:
```typescript
{
  // existing fields unchanged
  stepNumber: number          // which step in the cadence
  sequenceDefinitionId: string
  attributionWindowDays: number
}
```

### 5.5 The 6-touch escalating cadence (default for reactivation sequences)

| Step | Delay | Channel | Template theme |
|------|-------|---------|----------------|
| 1 | 24h | SMS | Direct recall + one-click rebooking link |
| 2 | 3 days | Email | Condition-specific educational content + CTA |
| 3 | 7 days | SMS | Gentle urgency, specific care reference |
| 4 | 14 days | SMS | Barrier acknowledgement |
| 5 | 30 days | SMS + Email | Re-engagement with outcome reference |
| 6 | 60–90 days | SMS | Final reactivation — records-transfer language |

### 5.6 Exit conditions

Exit conditions are evaluated at the start of each step's eligibility check, before any message is sent. Stage 5b (`trigger-sequences.ts`) runs after Stage 5 (`compute-patients.ts`) in the same pipeline execution, so `lifecycleState` and `nextSessionDate` reflect the current run's computed values.

Exit conditions (any one triggers exit):
- `nextSessionDate` is present (patient has rebooked) → exit sequence, no further steps
- `lifecycleState` is `'DISCHARGED'` or `'RE_ENGAGED'` → exit sequence
- Any prior `comms_log` entry for this patient+sequence has `outcome: 'unsubscribed'` → exit, do not send

**Pipeline ordering note:** Stage 5c (`compute-attribution.ts`) runs after Stage 5b. If a patient rebooks between pipeline runs, Stage 5b will detect `nextSessionDate` (set by Stage 5 in the current run) and exit the sequence before firing. Stage 5c then attributes the revenue. There is no race condition within a single pipeline run because the stages are sequential.

### 5.7 Inbound SMS logging

New n8n webhook route added to workflow 06: Twilio inbound SMS → n8n → `POST /api/n8n/callback` with:
```typescript
{
  type: 'inbound_reply'
  fromPhone: string           // the patient's phone number (E.164 format from Twilio)
  replyText: string
  receivedAt: string          // ISO string
}
```

**Matching logic in `/api/n8n/callback`:**
1. Query `comms_log` for all entries where `channel: 'sms'` and the patient's `contact.phone` matches `fromPhone`. Resolve `patientId` from the matched patient document.
2. If multiple patients share the same phone number: select the patient with the most recent `sentAt` in `comms_log` (most recently contacted). This is the best available heuristic for a log-only feature.
3. Select the most recent `comms_log` entry for the resolved `patientId` (by `sentAt` DESC) as the entry to annotate.
4. Write `inboundReply: replyText` and `inboundAt: receivedAt` to that entry.
5. **If no match is found** (phone not in any patient record, or no outbound history): write an orphan log entry to `clinics/{clinicId}/comms_log` with `{ patientId: null, sequenceType: null, channel: 'sms', outcome: 'no_action', inboundReply: replyText, inboundAt: receivedAt, createdBy: 'inbound-orphan' }`. Return HTTP 200 to n8n — do not fail the webhook.

No automated response is generated in any case.

---

## 6. Revenue Attribution

New file: `lib/pipeline/compute-attribution.ts`

Runs as Stage 5c in the pipeline, after `trigger-sequences.ts` (Stage 5b).

### 6.1 Attribution logic

On each pipeline run, for each clinic:
1. Query all appointments with `status: 'scheduled'` or `status: 'completed'` updated since last pipeline run
2. For each such appointment, find `comms_log` entries for the same `patientId` where:
   - `outcome !== 'booked'` (not yet attributed)
   - `sentAt` is within `attributionWindowDays` before `appointment.dateTime` (use the `attributionWindowDays` stored on the comms_log entry itself, written at send time)
   - `patientLifecycleStateAtSend` is one of `'AT_RISK'`, `'LAPSED'`, or `'RE_ENGAGED'` (field written at send time per Section 3.2)
3. Last-touch wins: select the most recent qualifying `comms_log` entry by `sentAt`
4. Update that entry:
   ```
   outcome: 'booked'
   attributedRevenuePence: appointment.revenueAmountPence ?? 0
   attributedAppointmentId: appointment.id
   ```
5. `pre_auth_collection` entries (`attributionWindowDays: null`) are excluded from attribution queries.

### 6.2 Attribution windows by sequence type

Stored in `sequence_definitions.attributionWindowDays` (configurable per clinic):

| Sequence | Default window |
|---|---|
| `early_intervention` | 5 days |
| `rebooking_prompt` | 7 days |
| `hep_reminder` | 7 days |
| `review_prompt` | 14 days |
| `reactivation_90d` | 30 days |
| `reactivation_180d` | 30 days |

### 6.3 Revenue aggregation for UI

Aggregated by sequence type and by calendar month. Stored as a derived view on `comms_log` — no separate collection needed. `useCommsLog` hook extended to compute:
```typescript
attributionBySequence: Record<SequenceType, { count: number; totalRevenuePence: number }>
totalAttributedRevenuePence: number
attributedThisMonthPence: number
```

---

## 7. Pulse UI

### 7.1 Page structure

`app/continuity/page.tsx` retains the 3-tab structure. A **"Customise View"** button is added to the page header (top-right, secondary style). All new components live in `components/pulse/`.

### 7.2 Customise View panel — `CustomisePanel.tsx`

Slide-in drawer from the right (not a modal). Persists to `user_preferences/{userId}` on every toggle change via `useUserPreferences` hook.

Four toggle groups:

**Patient Segments** — toggle LifecycleState values:
`ONBOARDING` · `ACTIVE` · `AT_RISK` · `LAPSED` · `RE_ENGAGED` · `DISCHARGED` · `CHURNED`

**Metric Columns** — toggle column keys:
`riskScore` · `lifecycleState` · `sessions` · `lastVisit` · `nextAppointment` · `hepStatus` · `followUpBooked` · `clinician`

**Sequence Types** — toggle which sequence cards appear in Comms Sequences tab:
`early_intervention` · `rebooking_prompt` · `hep_reminder` · `review_prompt` · `reactivation_90d` · `reactivation_180d`

**Revenue** — single toggle: show/hide attribution £ figures across all tabs

Default: all on.

### 7.3 `useUserPreferences` hook — new file

`hooks/useUserPreferences.ts`

```typescript
function useUserPreferences(): {
  preferences: UserPreferences
  updatePreferences: (partial: Partial<UserPreferences>) => Promise<void>
  loading: boolean
}
```

Reads from `user_preferences/{userId}` on mount using the client Firebase SDK (`db` from `@/lib/firebase`), consistent with all other client-side hooks. Writes on every toggle change (debounced 500ms). Returns defaults if document doesn't exist yet.

**Firestore security rule required** — add to `firestore.rules`:
```
match /user_preferences/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```
This rule must be deployed before `useUserPreferences` is used in production. Include in the implementation plan as a required step.

### 7.4 Patient Board tab

**Session-3 Alert strip** — `SessionThresholdStrip.tsx`

Pinned above the main patient list. Always visible regardless of segment filter settings. Shows only patients where `sessionThresholdAlert = true`.

Per-patient row: name · sessions badge ("2 of 6") · clinician · last visit · "Send Early Intervention" action button (fires `early_intervention` sequence immediately via `/api/comms/send`).

Left border: Teal `#0891B2`. Background: subtle Teal at 8% opacity.

**Patient board** — `PatientBoard.tsx`

Replaces current board. Patients grouped by `lifecycleState`. Only segments in `preferences.visibleSegments` shown. Group headers are collapsible, show patient count and average riskScore.

Each patient row renders only columns in `preferences.visibleMetrics`.

**Risk score badge** — `RiskScoreBadge.tsx`

Coloured number badge:
- 0–39: brand green (`#10B981`)
- 40–59: amber (`#F59E0B`)
- 60–100: red (`#EF4444`)

Clicking a patient row expands an inline **risk factor breakdown panel** — `RiskFactorPanel.tsx`. Horizontal bar chart (5 bars) showing each factor score against its weight. Uses Teal for attendance, Purple for treatment progress, Blue for HEP, BlueGlow for sentiment, and muted grey (`#64748B`) for static risk. All colour values sourced from `brand.ts` — Navy is not used as a bar fill colour (it would be invisible against the Navy surface).

**Lifecycle state badge** — `LifecycleStateBadge.tsx`

Coloured pill badge per state:
- `NEW` / `ONBOARDING` → Blue `#1C54F2`
- `ACTIVE` → Green
- `AT_RISK` → Amber
- `LAPSED` → Orange
- `RE_ENGAGED` → Teal `#0891B2`
- `DISCHARGED` → Muted grey
- `CHURNED` → Red

### 7.5 Comms Sequences tab

Replaces current sequence list. Shows only sequence types in `preferences.visibleSequenceTypes`.

**SequenceCard.tsx** — per sequence:
- Sequence name + step indicator ("Step 2 of 6 active")
- Enrolled patients count
- Messages sent this month
- Rebook conversion rate
- Attribution revenue (hidden if `preferences.showRevenue = false`)

Expandable to show full cadence: each step's delay, channel icon, template preview.

### 7.6 Send Log tab

Existing send log retained. Two additions per `comms_log` entry:
- **Reply badge** — appears if `inboundReply` is set; tooltip shows raw reply text
- **Attribution tag** — "£X recovered" in Teal if `attributedRevenuePence > 0`

---

## 8. Files to Create

| File | Purpose |
|---|---|
| `src/lib/pipeline/compute-risk-score.ts` | Risk factor computation + lifecycle state assignment |
| `src/lib/pipeline/compute-attribution.ts` | Last-touch revenue attribution, Stage 5c |
| `src/hooks/useUserPreferences.ts` | Read/write user_preferences Firestore document |
| `src/components/pulse/CustomisePanel.tsx` | Slide-in drawer with toggle groups |
| `src/components/pulse/SessionThresholdStrip.tsx` | Pinned session-3 alert strip |
| `src/components/pulse/PatientBoard.tsx` | Lifecycle-grouped patient list |
| `src/components/pulse/RiskScoreBadge.tsx` | Coloured 0–100 score badge |
| `src/components/pulse/RiskFactorPanel.tsx` | Inline factor breakdown bar chart |
| `src/components/pulse/LifecycleStateBadge.tsx` | Lifecycle state pill badge |
| `src/components/pulse/SequenceCard.tsx` | Sequence summary + cadence detail |

---

## 9. Files to Modify

| File | Change |
|---|---|
| `src/types/index.ts` | Add `LifecycleState`, `RiskFactors`, new Patient fields, new CommsLogEntry fields |
| `src/types/comms.ts` | Add `early_intervention` to `SequenceType`; add `SequenceDefinition`, `SequenceStep` interfaces |
| `src/lib/pipeline/compute-patients.ts` | Call `computeRiskScore` after existing field derivation; write new fields in batch |
| `src/lib/comms/trigger-sequences.ts` | Load `sequence_definitions` from Firestore; evaluate eligibility per definition; add `stepNumber` to payload and comms_log; add `early_intervention` eligibility |
| `src/lib/pipeline/run-pipeline.ts` | Add Stage 5c (`computeAttribution`) after trigger-sequences |
| `src/app/api/n8n/callback/route.ts` | Handle `type: 'inbound_reply'`; write `inboundReply`/`inboundAt` to comms_log |
| `src/hooks/usePatients.ts` | Expose new Patient fields (`lifecycleState`, `riskScore`, `riskFactors`, `sessionThresholdAlert`) |
| `src/hooks/useSequences.ts` | Migrate data source from `settings/comms_sequences` to `sequence_definitions` collection; `active` field on `SequenceDefinition` replaces the enabled-map; extend stats with attribution revenue; filter by `preferences.visibleSequenceTypes` |
| `src/hooks/useCommsLog.ts` | Compute `attributionBySequence`, `totalAttributedRevenuePence`, `attributedThisMonthPence` |
| `src/app/continuity/page.tsx` | Add Customise button; render new components; wire `useUserPreferences` |
| `docs/n8n-workflows/06-pulse-sms-sequences.json` | Add inbound SMS route; add step-aware payload fields |

---

## 10. Risk Score Runbook

> **Purpose:** document the scoring model for any developer working on `compute-risk-score.ts`.

### Factors and weights

| Factor | Weight | Key signals |
|---|---|---|
| Attendance | 30% | Sessions attended ÷ scheduled (last 4 weeks). Penalty: -20 if DNA in first 3 sessions. |
| Treatment Progress | 25% | sessionCount ÷ courseLength. Bonus: +15 if follow-up booked at last appointment. Penalty: -25 if sessionCount < 3 AND no nextSessionDate (session-3 cliff). |
| HEP Engagement | 20% | 100 if hepProgramId + HEP provider compliance data. 50 if hepProgramId only. 0 if no HEP assigned. |
| Sentiment | 15% | NPRS/PSFS outcome improvement maps to 0–100. NPS feeds in when available. Default: 50 (neutral). |
| Static Risk | 10% | Baseline 70. -30 if insuranceFlag. -20 if first-session with no follow-up booked same-day. Floor 0. |

### Lifecycle state precedence

States are assigned in this order (first match wins):
1. **CHURNED** — `churnRisk = true` AND last outbound sequence was >60 days ago
2. **DISCHARGED** — `discharged = true`
3. **RE_ENGAGED** — prior state was LAPSED or AT_RISK AND `nextSessionDate` newly present
4. **AT_RISK** — `riskScore >= 60` AND not discharged
5. **LAPSED** — `daysSinceLastSession > 14` AND no `nextSessionDate` AND not discharged (equivalent to existing `churnRisk`)
6. **ONBOARDING** — `sessionCount >= 1 AND sessionCount <= 3`
7. **NEW** — `sessionCount = 0`
8. **ACTIVE** — all other cases

### Session-3 threshold

`sessionThresholdAlert = true` whenever `lifecycleState === 'ONBOARDING'`. This is the key intervention window. The `early_intervention` sequence is the highest-priority sequence (priority = 1) and fires exclusively when this flag is true. The brief confirms that patients who survive 3 sessions are exponentially more likely to complete treatment — early intervention in this window delivers the highest retention ROI.

### Score thresholds

| Range | Interpretation | UI colour |
|---|---|---|
| 0–39 | Low risk | Green |
| 40–59 | Moderate risk | Amber |
| 60–100 | High risk → AT_RISK state | Red |

---

## 11. What Is Out of Scope

- Multi-touch revenue attribution (confirmed post-MVP)
- Auto-reply to inbound SMS (log-only in this build)
- PROMs outcome measures layer (separate future spec)
- Payment plan messaging (explicitly excluded by Jamal)
- NHS-specific features
- Self-serve sequence template editing (sequences are defined in Firestore; editing UI is a future admin feature)

---

## 12. Constraints & Non-Negotiables

- `churnRisk` boolean stays on the Patient document — backward-compatible
- No changes to Firebase Auth, routing, or multi-tenant `clinicId` partitioning
- Firestore region: `europe-west2` — never change
- All colours from `brand.ts` only — no hardcoded hex values in components
- TypeScript throughout — match existing conventions in each modified file
- No `console.log` in production code
- `useUserPreferences` is top-level (not clinic-scoped) so preferences follow the authenticated user across clinics
