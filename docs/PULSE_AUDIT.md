# PULSE_AUDIT.md

Phase 1 read-only audit of the Pulse module sync architecture.

Files examined:
- `dashboard/src/components/pulse/PatientBoard.tsx`
- `dashboard/src/components/pulse/PatientEditModal.tsx`
- `dashboard/src/components/pulse/SessionThresholdStrip.tsx`
- `dashboard/src/components/pulse/SequenceCard.tsx`
- `dashboard/src/components/pulse/RiskFactorPanel.tsx`
- `dashboard/src/components/pulse/RiskScoreBadge.tsx`
- `dashboard/src/components/pulse/ComplexityIndicators.tsx`
- `dashboard/src/components/pulse/ComplexityPanel.tsx`
- `dashboard/src/components/pulse/ClinicalNotesPanel.tsx`
- `dashboard/src/components/pulse/CustomisePanel.tsx`
- `dashboard/src/components/pulse/LifecycleStateBadge.tsx`
- `dashboard/src/components/PulseMark.tsx`
- `dashboard/src/hooks/usePatients.ts`
- `dashboard/src/hooks/useInsightEvents.ts`
- `dashboard/src/hooks/useTodaysFocus.ts`
- `dashboard/src/hooks/useSequences.ts`
- `dashboard/src/hooks/useCommsLog.ts`
- `dashboard/src/hooks/useLiveActivity.ts`
- `dashboard/src/hooks/useInsightEngineUnlock.ts`
- `dashboard/src/hooks/useClinicalNotes.ts`
- `dashboard/src/hooks/useDemoData.ts`
- `dashboard/src/hooks/useDemoComms.ts`
- `dashboard/src/app/patients/[id]/page.tsx`
- `dashboard/src/app/clinicians/page.tsx`
- `dashboard/src/app/api/n8n/callback/route.ts`
- `dashboard/src/app/api/comms/send/route.ts`
- `dashboard/src/app/api/webhooks/resend/route.ts`
- `dashboard/src/app/api/webhooks/twilio/route.ts`
- `dashboard/src/app/api/pipeline/run/route.ts`
- `dashboard/src/lib/pipeline/compute-patients.ts`
- `dashboard/src/lib/pipeline/sync-patients.ts`
- `dashboard/src/lib/comms/trigger-sequences.ts`
- `dashboard/src/lib/queries.ts` (patient, comms, insight event subscription functions)
- `dashboard/src/types/comms.ts`
- `dashboard/scripts/seed-test-insights.ts`
- `dashboard/scripts/send-test-emails.ts`
- `dashboard/scripts/preview-emails.ts`

Not found (missing):
- `dashboard/src/app/pulse/**` — no dedicated Pulse page route exists
- `dashboard/src/app/api/**/*pulse*` — no pulse-specific API routes
- `dashboard/src/app/api/**/*sequence*` — no sequence-specific API routes

---

## 1. Patient data origins

### PatientBoard.tsx

| Field | Firestore path | Fetch type | Has cleanup? |
|---|---|---|---|
| `p.name` | `clinics/{clinicId}/patients/{id}.name` | onSnapshot via `usePatients` | Yes (via `subscribePatients` return value, line 62 `usePatients.ts`) |
| `p.lifecycleState` | `clinics/{clinicId}/patients/{id}.lifecycleState` | onSnapshot | Yes |
| `p.sessionCount` | `clinics/{clinicId}/patients/{id}.sessionCount` | onSnapshot | Yes |
| `p.courseLength` | `clinics/{clinicId}/patients/{id}.courseLength` | onSnapshot | Yes |
| `p.clinicianId` | `clinics/{clinicId}/patients/{id}.clinicianId` | onSnapshot | Yes |
| `p.lastSessionDate` | `clinics/{clinicId}/patients/{id}.lastSessionDate` | onSnapshot | Yes |
| `p.riskScore` | `clinics/{clinicId}/patients/{id}.riskScore` | onSnapshot | Yes |
| `p.riskFactors` | `clinics/{clinicId}/patients/{id}.riskFactors` | onSnapshot | Yes |
| `p.complexitySignals` | `clinics/{clinicId}/patients/{id}.complexitySignals` | onSnapshot | Yes |
| `p.complexityUpdatedAt` | `clinics/{clinicId}/patients/{id}.complexityUpdatedAt` | onSnapshot | Yes |
| `p.heidiPatientId` | `clinics/{clinicId}/patients/{id}.heidiPatientId` | onSnapshot | Yes |
| `p.sessionThresholdAlert` | `clinics/{clinicId}/patients/{id}.sessionThresholdAlert` | onSnapshot | Yes |
| `activeEvents` (insight badges) | `clinics/{clinicId}/insight_events/*` | onSnapshot via `useInsightEvents` | Yes |
| `clinicianMap` | Passed as prop (fetched upstream via `useClinicians` hook, separate onSnapshot) | onSnapshot (upstream) | Yes (upstream) |

The `PatientBoard` receives `patients` and `clinicianMap` as props — it does not fetch directly. Both are onSnapshot-backed at the page level.

### PatientEditModal.tsx

| Field | Origin | Fetch type |
|---|---|---|
| `name`, `email`, `phone`, `sessionCount`, `courseLength`, `clinicianId`, `lastSessionDate`, `nextSessionDate` | Initialised from `patient` prop passed at open time (lines 22-29) | Local `useState` shadow copy of Firestore data |

The modal creates a local `useState` copy of all editable fields at open time. These shadow state values are disconnected from Firestore for the duration of the modal being open. If Firestore updates the patient mid-edit (e.g. a PMS sync), the modal values do not update. On save, `updatePatient()` writes back via `updateDoc`. There is no `syncState` write and no indication of stale data.

### SessionThresholdStrip.tsx

| Field | Origin | Fetch type |
|---|---|---|
| `p.sessionThresholdAlert` | `clinics/{clinicId}/patients/{id}.sessionThresholdAlert` | onSnapshot (inherited from `usePatients`) |
| `p.sessionCount`, `p.courseLength`, `p.lastSessionDate`, `p.clinicianId` | Same as PatientBoard | onSnapshot |

The strip receives `patients` as a prop; it filters for `p.sessionThresholdAlert === true` (line 19). Data is real-time via parent hook.

### SequenceCard.tsx

| Field | Origin | Fetch type |
|---|---|---|
| `definition.*` (name, steps, active, sequenceType, attributionWindowDays) | `clinics/{clinicId}/sequence_definitions/{id}` | onSnapshot via `useSequences` |
| `stats.sent/opened/clicked/rebooked/attributedRevenuePence` | Derived from `commsLog` via `useCommsLog` / `useSequences` merge | onSnapshot via `useCommsLog` |

Stats are computed client-side from the `comms_log` onSnapshot feed. The `useSequences` hook initialises stats as all zeros (line 137-144 `useSequences.ts`); the merge with `commsLog` stats happens at the consumer (the Pulse page, not audited here directly).

### RiskFactorPanel.tsx

All fields (`attendance`, `treatmentProgress`, `hepEngagement`, `sentiment`, `staticRisk`) come from the `factors` prop which is `p.riskFactors` from the patient object. Data origin is onSnapshot.

The factor weights are hardcoded in the component (line 10-15: `weight: 30, 25, 20, 15, 10`). These are display-only constants, not business logic.

### ComplexityPanel.tsx / ComplexityIndicators.tsx

All fields come from the `signals` prop which is `p.complexitySignals` from the patient object. Data origin is onSnapshot. The `updatedAt` field maps to `p.complexityUpdatedAt`. No independent Firestore fetch.

### ClinicalNotesPanel.tsx

| Field | Firestore path | Fetch type | Has cleanup? |
|---|---|---|---|
| `notes` array | `clinics/{clinicId}/clinical_notes` filtered by `patientId` | `getDocs` (one-shot, `useClinicalNotes.ts` line 39) | Yes (cancelled flag pattern, line 30 `useClinicalNotes.ts`) |

This is the only Pulse component that uses a one-shot `getDocs` rather than `onSnapshot`. The hook uses a `cancelled` guard flag instead of a real unsubscribe, which is the correct pattern for a one-shot fetch — but it means clinical notes will not update if a new note is written to Firestore while the panel is open.

### Patient detail page (`/patients/[id]/page.tsx`)

| Field | Origin | Fetch type |
|---|---|---|
| All patient fields | `useDemoPatients()` — returns `DEMO_PATIENTS` array from `useDemoData.ts` (line 110) | Hardcoded demo data only |
| Timeline comms events | `getDemoCommsLog()` — hardcoded demo data (line 37) | Hardcoded demo data only |
| `clinicians` | `useClinicians()` — onSnapshot (production hook) | onSnapshot |

The patient detail page (`/patients/[id]/page.tsx`) is **entirely demo-only**. It calls `useDemoPatients()` directly rather than fetching from Firestore. There is no real patient data path, no `clinicId` scoping, and no route guard. A real user navigating to `/patients/someRealPatientId` would get a "Patient not found" error.

---

## 2. Automation and messaging pipeline

### Sequence triggers

| Trigger | Origin | Execution path | Provider | Outcome storage | Lifecycle states |
|---|---|---|---|---|---|
| Pipeline cron/manual run | GET/POST `/api/pipeline/run` (Vercel cron or manual) | `runPipeline()` calls `triggerCommsSequences()` in `trigger-sequences.ts` | n8n webhook (`N8N_WEBHOOK_BASE_URL/{sequenceType}`) | `clinics/{clinicId}/comms_log/{id}` written by trigger-sequences.ts (line 271-284) then enriched by n8n callback | `pending` (implicit: `outcome: "no_action"` written at send time) |
| Manual "Re-engage" button (`PatientBoard.tsx` line 217) | User click → `onSendReminder(p.id)` prop callback | Calls `/api/comms/send` | Twilio (SMS) or Resend (email) | `clinics/{clinicId}/comms_log/{id}` (added, line 143 `comms/send/route.ts`) | `no_action` at creation, then `delivered`/`send_failed` via Twilio webhook |
| Manual "Send intervention" button (`SessionThresholdStrip.tsx` line 51) | User click → `onSendEarlyIntervention(p.id)` prop callback | Same as above — `onSendReminder` at page level | Twilio or Resend | Same as above | Same as above |

### n8n callback flow (`/api/n8n/callback`)

n8n fires a POST to `/api/n8n/callback` with `{ clinicId, patientId, sequenceType, logId, executionId, outcome, openedAt?, clickedAt? }`. The handler enriches the `comms_log` doc identified by `logId` with `n8nExecutionId`, `outcome`, `openedAt`, `clickedAt`, and `updatedAt` (lines 113-120 `n8n/callback/route.ts`).

### Provider delivery webhooks

- Resend: `POST /api/webhooks/resend?clinicId=X` — matches `comms_log` by `resendId`, writes `openedAt`, `clickedAt`, `outcome` (delivered/send_failed)
- Twilio: `POST /api/webhooks/twilio?clinicId=X` — matches `comms_log` by `twilioSid`, writes `outcome` (delivered/send_failed)

### NPS inbound reply flow

n8n sends `{ type: "inbound_reply", clinicId, fromPhone, replyText }` to `/api/n8n/callback`. The route matches the patient by phone, finds the most recent `comms_log` SMS entry, parses the NPS score (0-10), and writes to `clinics/{clinicId}/reviews` and updates the `comms_log` entry with `npsScore`, `npsCategory`, `inboundReply`, `inboundAt`.

---

## 3. Template storage

All SMS message templates are **hardcoded in `dashboard/src/types/comms.ts`** in the `SMS_TEMPLATES` constant (lines 218-386). This file contains 60+ individual template strings across standard/supportive/clinical tone variants for all sequence types.

The `resolveTemplate()` function in `comms.ts` (lines 392-408) selects the correct tone variant at runtime, falling back through `{key}_{tone}` → `{key}_standard` → `{key}` → generic fallback.

There is no Firestore collection for message templates. Templates cannot be edited by clinic owners without a code deployment. There is no template versioning or approval flow. The `SequenceCard.tsx` component displays `step.templateKey` (line 134) — a string like `"rebooking_step1"` — as a raw identifier rather than the resolved template text.

Email templates (invite, urgent-alert, state-of-clinic, clinician-digest) are also hardcoded — in separate TypeScript files under `dashboard/src/lib/intelligence/emails/`.

---

## 4. Event consumption

Pulse does not consume events directly from a structured event stream. The relevant behaviour:

- `useInsightEvents` subscribes to `clinics/{clinicId}/insight_events` via `onSnapshot` (lines 125-139 `useInsightEvents.ts`). This reads Intelligence-written events.
- `PatientBoard` uses `useInsightEvents` to show `PATIENT_DROPOUT_RISK` badges on patient rows (lines 81-90 `PatientBoard.tsx`). The badge checks `evt.pulseActionId` to indicate whether a Pulse comms action was taken (line 208).
- The automation engine (`trigger-sequences.ts`) is **not triggered by events**. It runs on the pipeline schedule and evaluates patient state directly from Firestore patient documents. There is no Firestore trigger or Cloud Function that listens to `insight_events` and fires a Pulse sequence.
- There is no `consumedBy` idempotency field on `insight_events` documents. The `pulseActionId` field on an `InsightEvent` (seen in seed data line 98 `seed-test-insights.ts`) holds the `comms_log` ID of the resulting action, but this is written by the Intelligence module at event creation time as a pointer — it is not written back by Pulse when an action is taken.
- There is no mechanism by which a `PATIENT_DROPOUT_RISK` event from Intelligence directly triggers a comms sequence. The connection is informational only: Pulse sequences are triggered by patient lifecycle state and appointment data computed by the pipeline, not by Intelligence events.

---

## 5. `onSnapshot` vs one-shot fetches

| Hook / component | Fetch type | Has cleanup? | Stale risk? |
|---|---|---|---|
| `usePatients` | `onSnapshot` via `subscribePatients` | Yes (unsubscribe returned line 62) | Low |
| `useInsightEvents` | `onSnapshot` via `subscribeInsightEvents` | Yes (unsub returned line 139) | Low |
| `useSequences` | `onSnapshot` on `sequence_definitions` collection | Yes (unsub returned line 109) | Low |
| `useCommsLog` | `onSnapshot` via `subscribeCommsLog` | Yes (unsub returned) | Low |
| `useLiveActivity` | Derived from above hooks — no independent fetch | N/A | Inherited |
| `useInsightEngineUnlock` | `onSnapshot` on single milestone doc | Yes (unsub returned line 66) | Low |
| `useClinicalNotes` | `getDocs` (one-shot) | Yes (cancelled flag, not a real unsubscribe) | High — notes written after panel opens are not shown |
| `useTodaysFocus` | Derived from `usePatients` + `useWeeklyStats` — no independent fetch | N/A | Inherited |
| `useDemoData` / `useDemoComms` | Hardcoded in-memory — no Firestore | N/A | N/A |
| Patient detail page | `useDemoPatients()` — hardcoded only | N/A | Total — no live data |
| `PatientEditModal` | Local `useState` shadow of patient prop | N/A | High — Firestore updates during open modal are lost |

---

## 6. Does any operation write `syncState`/lifecycle state back to Firestore?

| Operation | Writes to Firestore | What it writes | Full lifecycle? |
|---|---|---|---|
| `trigger-sequences.ts` fires a sequence step | Yes | `comms_log/{id}` with `{ patientId, sequenceType, channel, sentAt, outcome: "no_action", n8nExecutionId: null, stepNumber, patientLifecycleStateAtSend, createdAt, createdBy }` | Partial — initial write only; lifecycle updated by n8n callback and provider webhooks |
| `trigger-sequences.ts` after successful n8n call | Yes | `patients/{patientId}.lastSequenceSentAt` (line 286-289 `trigger-sequences.ts`) | Partial — one field only |
| n8n callback (outbound) | Yes | `comms_log/{id}` enriched with `{ n8nExecutionId, outcome, openedAt?, clickedAt?, updatedAt }` | Partial — no `delivered` state from this callback |
| Resend webhook | Yes | `comms_log/{id}.outcome` = `delivered`/`send_failed`, and `openedAt`/`clickedAt` | Partial — no `pending` state explicitly written |
| Twilio webhook | Yes | `comms_log/{id}.outcome` = `delivered`/`send_failed` | Partial — no `pending` state explicitly written |
| n8n inbound reply | Yes | `comms_log/{id}` with `inboundReply`, `inboundAt`, `npsScore?`, `npsCategory?`, `outcome: "responded"` and `reviews/{id}` | Partial — no final `engaged`/`unsubscribed` state written |
| `PatientEditModal` save | Yes | `patients/{patientId}` updated fields + `updatedAt` (via `updatePatient`) | None — no `syncState`, no write provenance |
| `useSequences.toggleSequence` | Yes | `sequence_definitions/{id}.active` | None — no `syncState` |
| `computePatientFields` (pipeline stage 5) | Yes | `patients/{id}` with `{ sessionCount, lastSessionDate, nextSessionDate, discharged, churnRisk, courseLength, lifecycleState, riskScore, riskFactors, sessionThresholdAlert, lifecycleUpdatedAt, updatedAt }` | Partial — no `syncState { lastComputedAt, status, lastError }` written |

No operation anywhere in Pulse writes a `syncState` document (with `lastComputedAt`, `status`, `lastError` fields) as specified by the target architecture. The closest approximation is `lifecycleUpdatedAt` on the patient document (written by `compute-patients.ts` line 173), but this is a single timestamp on the patient record rather than a dedicated `syncState` document, and there is no `status` or `lastError` field alongside it.

The comms lifecycle states in practice are:
- `"no_action"` — written at send time
- `"delivered"` — written by provider webhook
- `"send_failed"` — written by provider webhook
- `"booked"` — written by n8n callback (mapped via `mapOutcome`)
- `"unsubscribed"` — written by n8n callback
- `"responded"` — written by inbound reply handler

Missing states: `"pending"` (before n8n confirms), `"engaged"` (as distinct from `"booked"`). The initial write uses `"no_action"` as a proxy for pending, which conflates "awaiting callback" with "received but patient took no action".

---

## 7. Hardcoded defaults, demo data, and shadow state

### Hardcoded values

- **Session threshold (sessions 1-3)**: The `SEGMENT_ORDER` in `PatientBoard.tsx` (line 32-35) and `SEGMENTS` in `CustomisePanel.tsx` (line 17-25) hardcode `"ONBOARDING"` as the segment label for sessions 1-3. The label "Session 1-3 Early Intervention" in `SessionThresholdStrip.tsx` (line 27) is hardcoded.
- **CHURN_RISK_DAYS = 14** and **DISCHARGE_INACTIVE_DAYS = 30** are hardcoded in `compute-patients.ts` (lines 8-9). These are not clinic-configurable.
- **DEFAULT_COURSE_LENGTH** is read from Firestore pipeline config but falls back to a hardcoded constant imported from `./types` (line 37 `compute-patients.ts`).
- **Risk factor weights** (30/25/20/15/10) are hardcoded in `RiskFactorPanel.tsx` (lines 10-15). These are display-only and match the computation weights in `compute-risk-score.ts` (not audited but referenced).
- **All SMS templates** are hardcoded in `types/comms.ts` (lines 218-386) — 60+ template strings.
- **DEFAULT_SEQUENCE_DEFINITIONS** (line 107 `comms.ts`) are hardcoded with step counts, delay days, attribution windows, cooldown days, and priorities. These are seeded to Firestore on first pipeline run and can be updated there, but the seed values themselves are code constants.
- **Patient count limit of 500** is hardcoded in `subscribePatients` (line 154 `queries.ts`) and `comms_log` limit of 100 (line 272 `queries.ts`).
- **Insights limit of 50** is hardcoded in `subscribeInsightEvents` (line 388 `queries.ts`).
- **Demo dates** (`WEEK_STARTS` in `useDemoData.ts` lines 88-95) are hardcoded to 2026-01, making the demo mode temporally fixed.

### Demo mode bleed risk

The demo mode check in `usePatients` (line 15), `useInsightEvents` (line 106), and `useCommsLog` (line 26) all use `user?.uid === "demo"` as the gate. If this evaluates falsely (e.g. the demo user's UID changes), live hooks run instead of demo hooks. There is a structural bleed risk in `useCommsLog` (lines 60-69): when `isDemo` is true, the hook returns `getDemoCommsLog()` directly from a non-hook call inside the hook body, bypassing the state set by the `useEffect`. This means the demo return happens on every render, while the `useEffect` has already set `commsLog` state to `[]` (line 39). The demo data is returned correctly, but the code path is fragile — `isDemo` evaluated at render time rather than exclusively inside `useEffect`.

The patient detail page (`/patients/[id]/page.tsx`) calls `useDemoPatients()` unconditionally with no demo gate. Any real user navigating to that page sees demo data or a 404.

### Local shadow state

- `PatientEditModal` — `name`, `email`, `phone`, `sessionCount`, `courseLength`, `clinicianId`, `lastSessionDate`, `nextSessionDate` are all local `useState` (lines 22-29). These diverge from Firestore the moment the patient document updates. There is no mechanism to detect or warn about this.
- `useSequences.toggleSequence` applies an optimistic update (line 115-118 `useSequences.ts`) that mutates local state before the Firestore write. If the write fails, it reverts (line 127-130). The `onSnapshot` listener will also reflect the server state — but there is a brief window where local state disagrees with Firestore.
- `PatientBoard` — `collapsed`, `expanded`, `activeDropdown`, `editingPatient` are all local UI state. These cannot diverge from Firestore meaningfully (they're UI state, not data state).

---

## 8. Module boundary check

### Does Pulse write to Intelligence-owned paths?

No. Pulse (via `trigger-sequences.ts` and API routes) writes exclusively to:
- `clinics/{clinicId}/comms_log`
- `clinics/{clinicId}/patients` (field `lastSequenceSentAt`)
- `clinics/{clinicId}/reviews` (via inbound NPS reply)
- `clinics/{clinicId}/sequence_definitions` (read + seed, no ongoing write)

It does not write to `/kpis`, `/computeState`, `/metrics_weekly`, or `/insight_events`.

### Does Pulse read from Intelligence-owned paths without the event stream?

Yes, partially. `useInsightEvents` subscribes to `clinics/{clinicId}/insight_events` which is the Intelligence-owned event collection. This is consumed directly via `onSnapshot` in `useInsightEvents.ts` (line 126) rather than through any typed event stream abstraction. The `PatientBoard` uses this hook to render dropout risk badges. This is a direct cross-module Firestore read with no intermediary.

The patient lifecycle state and risk score (computed by the pipeline stage `compute-patients.ts`) are read by both Pulse and Intelligence from the `patients` collection — the `patients` collection is effectively shared infrastructure, not exclusively owned by either module.

### Does Pulse have direct code imports from Intelligence?

No direct imports from Intelligence module code. The `useInsightEvents` hook in `hooks/` is consumed by `PatientBoard.tsx` (line 16 import, line 50 usage), but `useInsightEvents` is a shared hook that subscribes to a Firestore path — it is not an import from the Intelligence module's business logic.

---

## 9. Current Pulse architecture vs target

### What Pulse currently does end-to-end

1. **Patient data**: Fetched via `onSnapshot` on `clinics/{clinicId}/patients`. Real-time. Correct pattern.
2. **Sequence definitions**: Fetched via `onSnapshot` on `clinics/{clinicId}/sequence_definitions`. Seeded from hardcoded defaults on first run. Real-time after seeding. Correct pattern.
3. **Comms log**: Fetched via `onSnapshot` on `clinics/{clinicId}/comms_log`. Real-time. Correct pattern.
4. **Message dispatch**: `trigger-sequences.ts` runs on the pipeline schedule. It evaluates patient state directly from Firestore, resolves templates from in-memory hardcoded constants, fires n8n webhooks, and writes `comms_log` entries. There is no dedicated Cloud Function or Firestore trigger.
5. **Delivery tracking**: Resend and Twilio delivery webhooks write back to `comms_log`. NPS inbound reply enriches `comms_log` and writes to `reviews`.
6. **Outcome storage**: Partial lifecycle written. `"pending"` state does not exist — `"no_action"` is used as a proxy. `"engaged"` state does not exist.
7. **Templates**: All hardcoded in TypeScript source. Not Firestore-backed, not editable without deployment.
8. **syncState**: Not implemented anywhere. No `syncState { lastComputedAt, status, lastError }` on any computed artefact.

### Target architecture state

```
/clinics/{clinicId}/
  campaigns/{campaignId}    (name, triggerEventType, templateId, active, schedule)
  templates/{templateId}    (channel, subject, body, variables[], approvedBy, version)
  messages/{messageId}      (patientId, campaignId, status, sentAt, respondedAt, provider)
  pulseState                (lastRunAt, queuedCount, failedCount, lastError)
```

**Does this structure exist?** No.

- `campaigns` collection: does not exist. The equivalent is `sequence_definitions` which covers the sequence/step structure but lacks `triggerEventType` and `schedule` fields.
- `templates` collection: does not exist. Templates are hardcoded in `types/comms.ts`.
- `messages` collection: does not exist by that name. The equivalent is `comms_log` which covers individual message sends but uses different field names (`sequenceType` instead of `campaignId`, no `respondedAt`, no `provider` field — instead has separate `twilioSid`/`resendId` fields).
- `pulseState` document: does not exist. There is no document tracking `lastRunAt`, `queuedCount`, `failedCount`, or `lastError` for the Pulse automation engine. The pipeline has its own result object returned from `runPipeline()` but this is not persisted to Firestore.

---

## 10. Summary of key issues for Phase 2

In priority order:

**1. Patient detail page is demo-only with no live data path**
The `/patients/[id]/page.tsx` calls `useDemoPatients()` unconditionally (line 110). Any real patient navigated to this URL sees demo data or a 404. There is no Firestore fetch, no `clinicId` scoping, no auth guard. This is a silent data correctness failure in production.
Files: `dashboard/src/app/patients/[id]/page.tsx`

**2. All message templates are hardcoded in source — not Firestore-backed**
`SMS_TEMPLATES` in `types/comms.ts` (lines 218-386) contains 60+ template strings. Email templates are in individual TypeScript files under `intelligence/emails/`. No clinic can customise messaging without a code deployment. This directly violates the target architecture requirement for `templates/{templateId}` in Firestore with `approvedBy` and `version` fields.
Files: `dashboard/src/types/comms.ts` (lines 218-386), `dashboard/src/lib/intelligence/emails/`

**3. No `syncState`/`pulseState` document written anywhere**
The pipeline runs `triggerCommsSequences()` and returns a result object but never persists it. There is no `clinics/{clinicId}/pulseState` (or equivalent) tracking `lastRunAt`, `queuedCount`, `failedCount`, `lastError`. Operators have no visibility into whether Pulse is running or failing.
Files: `dashboard/src/lib/comms/trigger-sequences.ts` (no write at lines 305-306), `dashboard/src/app/api/pipeline/run/route.ts`

**4. Comms lifecycle is incomplete — `"pending"` and `"engaged"` states absent**
Messages are written with `outcome: "no_action"` at send time (line 277 `trigger-sequences.ts`), conflating "awaiting delivery confirmation" with "patient took no action". The target requires `pending → sent → delivered → engaged/unsubscribed`. There is no `"pending"` state, no `"sent"` state, and `"engaged"` does not exist as a distinct outcome from `"booked"`.
Files: `dashboard/src/lib/comms/trigger-sequences.ts` (lines 271-284), `dashboard/src/app/api/n8n/callback/route.ts`, `dashboard/src/app/api/webhooks/resend/route.ts`, `dashboard/src/app/api/webhooks/twilio/route.ts`

**5. PatientEditModal creates a shadow copy that diverges from Firestore**
All editable fields are copied to local `useState` at modal open time (lines 22-29 `PatientEditModal.tsx`). If a PMS sync or another user updates the patient while the modal is open, the modal shows stale data and will overwrite the newer values on save. The modal header acknowledges this ("Manual override — bypasses PMS sync") but does not guard against overwriting fresher server data.
Files: `dashboard/src/components/pulse/PatientEditModal.tsx` (lines 22-29, 31-53)

**6. Intelligence events not consumed as triggers — Pulse automation is decoupled from the event stream**
The current automation is purely schedule-driven: the pipeline evaluates patient state on a cron and fires sequences. Intelligence events (e.g. `PATIENT_DROPOUT_RISK`) are displayed as badges in the UI but do not trigger Pulse sequences. The target architecture assumes Pulse campaigns have `triggerEventType` — this coupling does not exist. A `PATIENT_DROPOUT_RISK` event does not cause Pulse to fire; both systems independently reach the same conclusion by reading patient data.
Files: `dashboard/src/lib/comms/trigger-sequences.ts` (no event consumption), `dashboard/src/hooks/useInsightEvents.ts` (read-only consumer)

**7. `useClinicalNotes` uses `getDocs` (one-shot) not `onSnapshot`**
Clinical notes load once when the patient row is first expanded and do not update if new notes arrive (line 39 `useClinicalNotes.ts`). This is a stale risk for any patient whose notes are updated mid-session. The hook also has no error state exposed to the component — errors silently set `notes` to `[]` (line 46).
Files: `dashboard/src/hooks/useClinicalNotes.ts` (lines 39-51)

**8. `comms_log` has no `campaigns`/`templates` foreign keys**
The `comms_log` collection stores `sequenceType` (a string enum) rather than a reference to a `campaignId` or `templateId`. When templates are migrated to Firestore, there will be no way to join a historical message send to the template version that generated it without a schema migration.
Files: `dashboard/src/lib/comms/trigger-sequences.ts` (line 272-283 schema), `dashboard/src/app/api/comms/send/route.ts` (line 133-141 schema)

**9. Demo mode bleed risk in `useCommsLog`**
`useCommsLog` returns demo data via a direct function call in the render path (`getDemoCommsLog()` at line 61) rather than from state set inside `useEffect`. The `useEffect` sets `commsLog` state to `[]` in demo mode (line 39). If `isDemo` changes between renders, the hook may briefly return `[]` instead of demo data, or live Firestore data while `isDemo` is stale. The demo path should be entirely inside `useEffect`.
Files: `dashboard/src/hooks/useCommsLog.ts` (lines 60-69)

**10. No `campaigns` Firestore collection — sequence definitions are a partial substitute**
`sequence_definitions` covers step definitions and exit conditions but lacks `triggerEventType` (required to connect Intelligence events to Pulse actions) and `schedule` (required for time-based campaign rules). Migrating to the target `campaigns` schema will require a data migration of existing `sequence_definitions` documents and a new `templates` collection.
Files: `dashboard/src/types/comms.ts` (lines 107-208), `dashboard/src/hooks/useSequences.ts`
