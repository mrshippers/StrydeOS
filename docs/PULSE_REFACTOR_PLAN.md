# PULSE_REFACTOR_PLAN.md

SPARC Phase P (Pseudocode) + Phase A (Architecture) for the Pulse sync refactor.

Related: `docs/PULSE_AUDIT.md` (signed-off Phase 1 audit).

---

## Scope of this PR

Surgical changes to the Pulse module only. No new visual surface. No renames. No migrations of existing collections.

In scope:
1. `'pending'` lifecycle state on `CommsOutcome`.
2. `pulseState` doc written on every `trigger-sequences` run.
3. Intelligence event → Pulse consumption with `consumedBy` idempotency and `triggerEventType` matching.
4. `useClinicalNotes` migrated from `getDocs` to `onSnapshot`.
5. `useCommsLog` demo bleed fix — demo data set inside `useEffect`.
6. `comms_log` additive fields: `templateKey` (required going forward), `campaignId?`, `templateVersion?`.

Explicitly deferred to future PRs:
- `campaigns` / `templates` / `messages` collection rename from SPARC spec — requires a migration and breaks `sequence_definitions` / `comms_log` consumers. Out of scope for this PR.
- Template migration to Firestore — large surface, needs template editor UX.
- PatientEditModal shadow state fix — needs UX decision on merge conflicts.
- Patient detail page live data path — blocked by auth/routing hard stop.
- `comms_log` full schema migration to `messages` — blocked by template migration.

---

## Phase P — Pseudocode

### 1. `processEvent(clinicId, eventId)` — consume Intelligence events

This is implemented by extending the existing `consumeInsightEvents(db, clinicId, events)` in `src/lib/pulse/insight-event-consumer.ts` (the SPARC spec called for a Firestore trigger on `/events/*`; this codebase does not use Cloud Function triggers — the consumer is invoked inline from `/api/intelligence/detect`). Both the existing `insight_events` path and the new `events` path are read; for this PR only `insight_events` is active since Intelligence has not yet written to `/events/*`. The idempotency field works on both collections.

```
processEvent(clinicId, eventId, eventData):
  if eventData.consumedBy includes 'pulse':
    return SKIP_ALREADY_CONSUMED

  // Atomic idempotency marker — written regardless of match so re-runs are no-ops
  atomicUpdate(eventPath, { consumedBy: arrayUnion('pulse') })

  if eventData.actionTarget != 'patient':
    return SKIP_NOT_PATIENT_ACTION

  // Match 1: explicit triggerEventType on a sequence definition (new path)
  matchedSeq = sequence_definitions.find(s => s.triggerEventType == eventData.type && s.active)

  // Match 2: legacy EVENT_TO_SEQUENCE map (existing path, unchanged)
  if !matchedSeq:
    legacyType = EVENT_TO_SEQUENCE[eventData.type]
    matchedSeq = sequence_definitions.find(s => s.sequenceType == legacyType && s.active)

  if !matchedSeq:
    return SKIP_NO_SEQUENCE

  if !patientExistsWithContact(eventData.patientId):
    return SKIP_NO_CONTACT

  if hasPriorUnsubscribe(clinicId, eventData.patientId):
    return SKIP_UNSUBSCRIBED

  // Enqueue a comms_log entry in the NEW 'pending' state
  logEntry = {
    patientId, sequenceType: matchedSeq.sequenceType,
    channel, sentAt: now, outcome: 'pending',
    stepNumber: 1, templateKey: deriveTemplateKey(matchedSeq, 1),
    insightEventId: eventId, triggeredByIntelligence: true,
    insightEventType: eventData.type,
  }
  logId = commsLog.add(logEntry)

  // Write reference back to the event (best-effort)
  eventPath.update({ pulseActionId: logId })

  return ENQUEUED
```

### 2. `sendPulseMessage(messageId)` — out of scope for this PR

The SPARC spec called for a callable that loads a pending `comms_log`, dispatches to provider, and writes outcome + provider IDs. The existing architecture splits this across:
- `/api/comms/send` — synchronous owner/admin send (Twilio or Resend direct).
- `trigger-sequences.ts` → n8n webhook — batch send via automation.
- Provider webhooks (`/api/webhooks/resend`, `/api/webhooks/twilio`) — async outcome transitions.

This PR preserves all three paths and instead upgrades the lifecycle from implicit to explicit: the initial write is `'pending'`, provider webhooks transition it to `'delivered'` or `'send_failed'`. No new dispatcher is introduced.

### 3. `pulseState` doc write

```
triggerCommsSequences(db, clinicId):
  runId = uuid()
  runStartAt = now()
  pulseStateRef = clinics/{clinicId}/pulseState        // singular, fixed doc id
  pulseStateRef.set({
    lastRunAt: runStartAt, runId, status: 'running',
    queuedCount: null, failedCount: null, lastError: null,
  }, merge: true)

  try:
    ... existing logic ...
    fired, skipped, errors = ...

    pulseStateRef.set({
      lastRunAt: now(), runId, status: errors.empty ? 'ok' : 'partial',
      queuedCount: fired, failedCount: errors.length,
      lastError: errors.last ?? null,
    }, merge: true)

    return { fired, skipped, errors }
  catch err:
    pulseStateRef.set({
      lastRunAt: now(), runId, status: 'error',
      queuedCount: 0, failedCount: 1,
      lastError: err.message,
    }, merge: true)
    throw
```

`pulseState` is a SINGLETON doc per clinic (`pulseState` with fixed doc id), NOT a collection. One document tracks the most recent run. History is the business of `integration_health` logs, not this doc.

---

## Phase A — Architecture

### Schema additions

All changes are ADDITIVE. Existing docs and code paths are unchanged.

#### `sequence_definitions/{id}` — add optional field

```ts
interface SequenceDefinition {
  // ... existing fields unchanged ...

  /**
   * NEW: When set, this sequence is eligible to be triggered by an Intelligence
   * event of this type via the event consumer. Schedule-driven triggers continue
   * to work independently. Absent = sequence is schedule-only.
   */
  triggerEventType?: InsightEventType;
}
```

Default seed docs unchanged — they opt into the legacy `EVENT_TO_SEQUENCE` map via `sequenceType`. New clinics can set `triggerEventType` explicitly; `triggerEventType` wins over the legacy map when both are present.

#### `CommsOutcome` — add `'pending'`

```ts
// BEFORE
export type CommsOutcome = "booked" | "no_action" | "unsubscribed" | "responded" | "send_failed";

// AFTER
export type CommsOutcome =
  | "pending"        // NEW: enqueued, provider has not yet confirmed delivery
  | "booked"
  | "no_action"      // unchanged semantics: sent, patient took no action
  | "unsubscribed"
  | "responded"
  | "send_failed";
```

Lifecycle transitions:
- `trigger-sequences` writes `'pending'` at enqueue time (was: `'no_action'`).
- `insight-event-consumer` writes `'pending'` at enqueue time (was: `'no_action'`).
- `/api/comms/send` writes `'pending'` on successful provider dispatch, `'send_failed'` on immediate failure (was: `'no_action'` / `'send_failed'`).
- Twilio webhook transitions `'pending' → 'delivered'` or `'pending' → 'send_failed'`.
- Resend webhook transitions `'pending' → 'delivered'` or `'pending' → 'send_failed'`.
- n8n callback transitions `'pending' → 'booked'` / `'unsubscribed'` / `'no_action'` based on patient action. `'no_action'` in this context means "message reached the patient, no response".
- Inbound reply handler transitions to `'responded'`.

`'no_action'` retains its existing meaning for any log entries already in the database. The read-side (`useCommsLog`) is unaffected.

#### `insight_events/{id}` and future `events/{id}` — add idempotency marker

```ts
interface InsightEvent {
  // ... existing fields unchanged ...

  /**
   * NEW: Array of consumer names that have processed this event.
   * Written atomically via arrayUnion for idempotency against re-runs and
   * concurrent consumers. Example: ['pulse']. Absent = not yet consumed.
   */
  consumedBy?: string[];
}
```

Applies to both the existing `insight_events` collection AND the future `events` collection (spec-aligned). The consumer reads both paths; this PR only touches `insight_events` since `events` is not yet populated.

#### `/clinics/{clinicId}/pulseState` — new singleton doc

```ts
interface PulseState {
  /** ISO timestamp of the last run start or completion (whichever is latest). */
  lastRunAt: string;
  /** Unique id for the current/last run. Rotates every run. */
  runId: string;
  /** Lifecycle of the most recent run. */
  status: "running" | "ok" | "partial" | "error";
  /** Messages enqueued in the most recent run. null while running. */
  queuedCount: number | null;
  /** Distinct errors in the most recent run. null while running. */
  failedCount: number | null;
  /** Last error message from the most recent run, or null on success. */
  lastError: string | null;
}
```

Located at `clinics/{clinicId}/pulseState` (fixed document id `pulseState`). Singleton per clinic. Written by `trigger-sequences.ts` at run start and run end; read by admin / ops tooling.

#### `comms_log/{id}` — additive template tracking

```ts
interface CommsLogEntry {
  // ... existing fields unchanged ...

  /**
   * NEW (required on new writes): The resolved template key for this send,
   * e.g. "rebooking_step1". Combined with templateVersion this allows future
   * reconstruction of the exact template sent. Existing docs unaffected.
   */
  templateKey: string;

  /**
   * NEW (optional): If this send was triggered by a Firestore-backed campaign
   * document in a future collection, the campaign id. null for schedule-driven
   * sends from `sequence_definitions`.
   */
  campaignId?: string | null;

  /**
   * NEW (optional): Template schema version at send time. Absent = hardcoded
   * in-source template (current state).
   */
  templateVersion?: number;
}
```

`templateKey` is already implicitly present as `sequenceType + stepNumber` in the existing code — making it explicit costs one extra field and unlocks future template migration without a data backfill.

### Pipeline integration

`/api/pipeline/run` continues to call `runPipeline` which invokes `triggerCommsSequences`. Response payload gains a `pulseState` summary (the in-memory result, not a Firestore re-read) so callers see the run outcome inline.

### Module boundary

- Pulse still reads `insight_events` from Intelligence via `onSnapshot` (display) and admin SDK (consumer).
- Pulse now writes `consumedBy: arrayUnion('pulse')` to `insight_events`. This is an idempotency marker, not a semantic change to the event model; Intelligence is free to read it for observability.
- Pulse does not write to `/kpis`, `/computeState`, or `/metrics_weekly`.

### Test strategy

- `trigger-sequences.test.ts`: update outcome assertion from `'no_action'` → `'pending'`. Add test for `pulseState` write at run start + run end.
- `twilio.test.ts` / `resend.test.ts`: no changes required — the webhook transitions are unchanged (`'delivered'` / `'send_failed'`). The _initial_ state changes but the webhooks don't care about it.
- New test for `insight-event-consumer`: idempotency (`consumedBy` gate), `triggerEventType` match precedence over legacy map, `pending` outcome on enqueue.
- `useClinicalNotes`: no behaviour change from the consumer's perspective — same shape of `{ notes, loading }`. Convert to `onSnapshot` internally.

### Backward compatibility

- Existing `comms_log` docs with `outcome: 'no_action'` remain valid and render correctly.
- Existing `sequence_definitions` docs without `triggerEventType` continue to work via the legacy `EVENT_TO_SEQUENCE` map.
- Existing `insight_events` docs without `consumedBy` are treated as unconsumed on first read (re-runs idempotent via `arrayUnion`).
- No Firestore security rules change required.
- No client UI change required — `RiskScoreBadge`, `SessionThresholdStrip`, `PatientBoard` read patient fields only; `SequenceCard` reads from `sequence_definitions` (new field is optional).
