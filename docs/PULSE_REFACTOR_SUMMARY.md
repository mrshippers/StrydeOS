# PULSE_REFACTOR_SUMMARY.md

SPARC refactor of the Pulse module. Audit: `docs/PULSE_AUDIT.md`. Plan: `docs/PULSE_REFACTOR_PLAN.md`.

## What shipped

1. **`'pending'` + `'delivered'` added to `CommsOutcome`.** `trigger-sequences.ts`, `insight-event-consumer.ts`, and `/api/comms/send` now write `outcome: 'pending'` at send time (was `'no_action'`). `'no_action'` retains its meaning for n8n explicit-no-response callbacks; `'delivered'` formalises what webhooks were already writing as a loose string.
2. **`pulseState` singleton doc** written at `/clinics/{clinicId}/pulseState/pulseState` on every `triggerCommsSequences` run (start: `status='running'`, end: `'ok'|'partial'|'error'`) with `{ lastRunAt, runId, queuedCount, failedCount, lastError }`. Pipeline response includes it inline.
3. **Event consumer idempotency.** `consumeInsightEvents` now short-circuits on `consumedBy.includes('pulse')` and atomically `arrayUnion('pulse')` after processing regardless of match, so re-runs are no-ops.
4. **`triggerEventType` field on `sequence_definitions`** (additive, optional). Takes precedence over the legacy `EVENT_TO_SEQUENCE` map. Unlocks per-clinic configurability without touching the existing path.
5. **`useClinicalNotes`: `getDocs` → `onSnapshot`** with proper unsubscribe on unmount / `patientId` change. Notes written mid-session surface immediately.
6. **`useCommsLog` demo-bleed fix.** Demo data now set via `setCommsLog(...)` inside `useEffect`. Render body reads a single state source — no parallel render-path fork.
7. **`comms_log` additive fields.** `templateKey` (required on new writes), `campaignId?`, `templateVersion?`. Sets up future template migration without requiring it now.

## What was deferred

Per scope decision in `PULSE_REFACTOR_PLAN.md`:
- Patient detail page live data path (blocked: auth/routing hard stop).
- Template migration to Firestore (separate large PR with template editor UX).
- PatientEditModal shadow-state fix (needs UX decision on merge conflicts).
- `comms_log` full schema migration to `messages` (blocked by template migration).
- `campaigns` / `templates` / `messages` collection rename (blocked by template migration + data migration).

## Test evidence

`npm test -- --run src/lib/pulse src/lib/comms src/app/api/webhooks src/app/api/n8n src/app/api/comms` → **96/96 passing**. Includes 4 new tests for `insight-event-consumer` (idempotency + triggerEventType precedence + pending outcome + templateKey) and 2 new tests for `trigger-sequences` (`pulseState` singleton write at run start/end + error-path pulseState write).

`npm run lint` → 0 errors, pre-existing warnings only (none in files I modified).

`npm run build` → pre-existing type error in `src/app/api/admin/provision-clinic/route.ts:151` (`treatmentCompletionTarget` field missing from `ClinicTargets`). Not in my scope, not touched in this PR.

## Files changed

Modified:
- `dashboard/src/types/index.ts` — `CommsOutcome`, `CommsLogEntry` additive fields
- `dashboard/src/types/comms.ts` — `SequenceDefinition.triggerEventType`
- `dashboard/src/types/insight-events.ts` — `InsightEvent.consumedBy`
- `dashboard/src/lib/comms/trigger-sequences.ts` — pending outcome, pulseState writes, templateKey
- `dashboard/src/lib/comms/__tests__/trigger-sequences.test.ts` — updated assertions, 2 new tests
- `dashboard/src/lib/pulse/insight-event-consumer.ts` — idempotent consumption, pending outcome, triggerEventType matching
- `dashboard/src/lib/pipeline/run-pipeline.ts` — surface pulseState in trigger-comms stage
- `dashboard/src/lib/pipeline/types.ts` — `StageResult.pulseState` additive field
- `dashboard/src/app/api/n8n/callback/route.ts` — clarifying comment on lifecycle transitions
- `dashboard/src/app/api/comms/send/route.ts` — pending outcome, templateKey
- `dashboard/src/hooks/useClinicalNotes.ts` — `getDocs` → `onSnapshot`
- `dashboard/src/hooks/useCommsLog.ts` — demo path moved into useEffect

Added:
- `dashboard/src/lib/pulse/__tests__/insight-event-consumer.test.ts`
- `docs/PULSE_AUDIT.md`
- `docs/PULSE_REFACTOR_PLAN.md`
- `docs/PULSE_REFACTOR_SUMMARY.md`
