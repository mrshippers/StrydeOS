# Stage 0 — Cross-Module Architecture Map

## Module Overview

Three locked modules. No fourth.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         StrydeOS Platform                           │
│                                                                     │
│  ┌─────────────┐    InsightEvent     ┌─────────────────────────┐   │
│  │             │ ──────────────────► │                         │   │
│  │ Intelligence│                     │         Pulse           │   │
│  │  (Purple)   │ ◄── KPI dashbd ──   │         (Teal)          │   │
│  │             │                     │                         │   │
│  └──────┬──────┘                     └─────────────────────────┘   │
│         │ reads                               ▲                    │
│         │ appointments, clinicians,           │ consumes           │
│         │ metrics_weekly, insight_events      │ patient-action     │
│         │                                     │ InsightEvents      │
│  ┌──────▼──────────────────────────────────────────────────┐       │
│  │                    Firestore (europe-west2)              │       │
│  │                                                         │       │
│  │  clinics/{id}/                                         │       │
│  │    ├── appointments          ← PMS sync + Ava writes   │       │
│  │    ├── clinicians            ← PMS sync                │       │
│  │    ├── call_log              ← Ava EL webhook           │       │
│  │    ├── call_facts            ← Ava EL webhook           │       │
│  │    ├── insight_events        ← Intelligence + Ava write │       │
│  │    ├── patients              ← PMS sync + Ava creates   │       │
│  │    ├── comms_log             ← Pulse writes             │       │
│  │    ├── sequence_definitions  ← Admin configures         │       │
│  │    └── integrations_config   ← Admin configures         │       │
│  │  metrics_weekly/{id}         ← Pipeline compute         │       │
│  └─────────────────────────────────────────────────────────┘       │
│         ▲                                                           │
│         │ writes call_log, call_facts, insight_events, appointments │
│  ┌──────┴──────┐                                                    │
│  │    Ava      │ ◄── Twilio inbound ── Patient phone call           │
│  │   (Blue)    │                                                    │
│  │             │ ──► ElevenLabs ConvAI ── Voice conversation        │
│  └─────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## InsightEvent Contract

**Source of truth:** `dashboard/src/types/insight-events.ts`

### Ava-emitted event types
| Type | Severity | actionTarget | Pulse sequence |
|------|----------|-------------|----------------|
| `AVA_CALLBACK_REQUESTED` | warning | patient | `early_intervention` |
| `AVA_CALL_BOOKED` | positive | owner | — |
| `AVA_CALL_ESCALATED` | critical | owner | — |

### Writer
`dashboard/src/app/api/webhooks/elevenlabs/route.ts` — on `conversation.ended`, writes to `clinics/{id}/insight_events/{deterministicId}` using `set/merge`. Deterministic ID: `ava-{conversationId}-{eventType}`.

### Consumers
- **Pulse:** `src/lib/pulse/insight-event-consumer.ts::consumeInsightEvents` — filters `PATIENT_ACTION_EVENTS`, matches sequence, writes `comms_log`, marks `consumedBy: ['pulse']` via `arrayUnion`
- **Intelligence UI:** reads `insight_events` collection for owner-facing signal display
- **Neither consumer writes back** to `insight_events` except for `pulseActionId` and `consumedBy` fields (backwards-compatible additions)

### Schema stability rule
Do not add required fields to `InsightEvent`. All new fields must be optional. `consumedBy` and `pulseActionId` were added as optional — correct pattern.

---

## Cloud Function Triggers

### `syncClinicToAva` (callable)
- **File:** `dashboard/functions/src/sync-clinic-to-ava.ts`
- **Trigger:** client call via `httpsCallable` (owner/admin/superadmin only)
- **What it does:** reads `clinics/{id}`, builds system prompt, clears old ElevenLabs KB docs, uploads per-category chunks, patches agent system prompt, writes `ava.syncState.*` transactionally
- **Loop guard:** writes `ava.syncState.pendingToken` before sync, reads it back after 5s debounce to coalesce rapid writes
- **Infinite-trigger guard:** `isOnlySyncStateWrite` skips re-trigger when only `ava.syncState.*` or `updatedAt` changed

### `onClinicWrite` (Firestore trigger)
- **File:** `dashboard/functions/src/sync-clinic-to-ava.ts`
- **Trigger:** any write to `clinics/{clinicId}` document
- **Skip conditions:**
  1. `after` is undefined (delete)
  2. `isOnlySyncStateWrite(before, after)` is true
  3. `ava.agent_id` not set (Ava not yet configured)
- **Debounce:** 5s setTimeout + fence token to coalesce rapid writes

---

## Data Flow: Inbound Call (End-to-End)

```
1. Patient dials clinic Twilio number
2. Twilio → POST /api/ava/inbound-call?clinicId=xxx
   - Twilio signature validated (HMAC)
   - Reads clinics/{id}.ava.agent_id from Firestore
   - Returns TwiML: <Dial><Sip>{agentId}@sip.rtc.elevenlabs.io</Sip></Dial>
3. ElevenLabs ConvAI handles voice conversation
   - Tool calls → POST /api/ava/tools (Bearer token auth)
     - check_availability: queries PMS adapter
     - book_appointment: creates in PMS + mirrors to Firestore
     - update_booking: cancels/reschedules via PMS
     - transfer_to_reception: → POST /api/ava/transfer
4. Call ends → ElevenLabs webhook → POST /api/webhooks/elevenlabs
   - HMAC signature validated (elevenlabs-signature header)
   - Writes call_log doc (merge)
   - Runs LangGraph classification (processCallerInput)
   - Writes call_log outcome + graphAction
   - Writes insight_events doc (idempotent, deterministic ID)
   - Writes call_facts doc (idempotent, deterministic ID)
   - Fires SMS notification (fire-and-forget, Twilio)
   - Heartbeats module-health
5. Intelligence reads call_facts for voice KPIs
6. Pulse reads insight_events → triggers early_intervention sequence
```

---

## Cross-Module Touchpoints (Complete List)

| From | To | Mechanism | File |
|------|----|-----------|------|
| Ava webhook | insight_events | Firestore write | `webhooks/elevenlabs/route.ts` |
| Ava webhook | call_log | Firestore set/merge | `webhooks/elevenlabs/route.ts` |
| Ava webhook | call_facts | Firestore set/merge | `webhooks/elevenlabs/route.ts` |
| Ava tools | appointments | Firestore set/merge | `api/ava/tools/route.ts` |
| Ava tools | patients | Firestore set/merge | `api/ava/tools/route.ts` |
| Intelligence | insight_events | Firestore write | `intelligence/detect-insight-events.ts` |
| Intelligence | metrics_weekly | Firestore write | `pipeline/run-pipeline.ts` |
| Pulse | comms_log | Firestore add | `pulse/insight-event-consumer.ts` |
| Pulse | insight_events | Firestore update (pulseActionId, consumedBy) | `pulse/insight-event-consumer.ts` |
| Cloud Function | ava.syncState.* | Firestore update (transactional) | `functions/sync-clinic-to-ava.ts` |
| Cloud Function | ElevenLabs API | PATCH agent, upload KB docs | `functions/sync-clinic-to-ava.ts` |

---

## Confirmed: No Direct Cross-Module Couplings Bypassing InsightEvent

- Intelligence does not import from Ava source files
- Pulse does not import from Ava or Intelligence source files  
- Ava does not read from `metrics_weekly` or `sequence_definitions`
- The only shared contract is `src/types/insight-events.ts` — imported by Intelligence, Pulse, and Ava webhook handler

---

## Firestore Collections Used by Ava

| Collection | Read | Write | Notes |
|-----------|------|-------|-------|
| `clinics/{id}` | ✅ | ✅ (ava.* fields only) | Config, knowledge, syncState |
| `clinics/{id}/appointments` | ✅ | ✅ | Booking mirror from PMS |
| `clinics/{id}/clinicians` | ✅ | — | Clinician name resolution |
| `clinics/{id}/patients` | ✅ | ✅ | Patient lookup + create |
| `clinics/{id}/call_log` | — | ✅ | Per-call record |
| `clinics/{id}/call_facts` | — | ✅ | Intelligence KPI stream |
| `clinics/{id}/insight_events` | — | ✅ | Cross-module bus |
| `clinics/{id}/integrations_config/pms` | ✅ | — | PMS credentials |
| `users/{uid}` | ✅ | — | Auth + role check |
