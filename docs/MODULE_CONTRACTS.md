# Module Contracts — Audit & Source of Truth

**Status:** Audit completed 2026-05-06. Contracts file landed at
`dashboard/src/lib/contracts/index.ts`.
**Branch:** `claude/strydeOS-module-contracts-hIX6R`
**Boundary CI gate:** `dashboard/scripts/check-module-boundaries.sh` (already in `npm run check:boundaries`)

---

## TL;DR

StrydeOS already enforces an Intelligence ⇄ Pulse boundary at CI level. The
existing types (`InsightEvent`, `CommsLogEntry`, `SequenceDefinition`,
`PMSAdapter`) are well-shaped. The gaps are around **Ava** (Python ⇄ TS
contract drift), **n8n callback** (inline-typed), **provider delivery
webhooks** (Twilio/Resend, not centralised), and the **lack of a single
ownership map** for collections.

The new `contracts/index.ts` is a type-only barrel that:

1. Re-exports the canonical types already in `@/types/*` and
   `@/lib/integrations/*`.
2. Promotes inline types out of route handlers (ElevenLabs webhook, n8n
   callback, Twilio/Resend, Pulse state singleton).
3. Mirrors the Python `ava_graph` Pydantic models on the TS side so any
   drift surfaces at typecheck time.
4. Defines the canonical `AvaInsightEvent*` shapes for Ava → Pulse handoff
   so the existing `insight-event-consumer` can pick up Ava-emitted events
   without changes when that surface is wired.
5. Codifies the Firestore collection ownership map that previously only
   lived in `check-module-boundaries.sh` + `CLAUDE.md`.

No runtime behavior changed. No existing route handler was modified.

---

## 1. Module surfaces — current state

### 1.1 Ava (voice)

| Surface | Direction | Where | Typed? |
|---|---|---|---|
| ElevenLabs `conversation.*` webhook | inbound | `dashboard/src/app/api/webhooks/elevenlabs/route.ts:10` | Inline only |
| `call_started` / `patient_confirmed` HTTP webhooks | inbound (Python) | `ava_graph/api/routes.py:18-37` | Pydantic only |
| Tool execute proxy (TS → Python) | outbound | `dashboard/src/lib/ava/engine-proxy.ts:8` ↔ `ava_graph/api/routes.py:322` | Two parallel definitions, no shared schema |
| `call_log` Firestore write | outbound | `dashboard/src/app/api/webhooks/elevenlabs/route.ts:80` | Inline only |
| Booking ack / callback SMS | outbound | `dashboard/src/lib/ava/notify-callback.ts` | Local interface |
| LangGraph `AvaState` checkpoint | internal | `ava_graph/graph/state.py:4` | TypedDict only |

### 1.2 Intelligence (KPI detection)

| Surface | Direction | Where | Typed? |
|---|---|---|---|
| PMS webhooks (WriteUpp, etc.) | inbound | `dashboard/src/app/api/webhooks/writeupp/route.ts` | Loose `Record<string, unknown>` body |
| `metrics_weekly` read | inbound (pipeline-written) | `dashboard/src/lib/intelligence/detect-insight-events.ts` | Yes (`WeeklyStats`) |
| `insight_events` write | outbound | `dashboard/src/lib/intelligence/detect-insight-events.ts:391` | Yes (`InsightEvent`) |
| Owner email digest | outbound | `dashboard/src/lib/intelligence/notify-owner.ts` | Yes |
| `/api/intelligence/detect` | outbound (HTTP) | `dashboard/src/app/api/intelligence/detect/route.ts` | Loose response shape |

### 1.3 Pulse (continuity)

| Surface | Direction | Where | Typed? |
|---|---|---|---|
| `insight_events` consume | inbound | `dashboard/src/lib/pulse/insight-event-consumer.ts` | Yes (`InsightEvent`, `PATIENT_ACTION_EVENTS`) |
| n8n outbound dispatch | outbound | `dashboard/src/lib/comms/trigger-sequences.ts` | Yes (`N8nSequencePayload`) |
| `/api/n8n/callback` (outbound result) | inbound | `dashboard/src/app/api/n8n/callback/route.ts:51` | Inline destructure only |
| `/api/n8n/callback` (inbound reply) | inbound | `dashboard/src/app/api/n8n/callback/route.ts:145` | Inline destructure only |
| Twilio `MessageStatus` callback | inbound | `dashboard/src/app/api/webhooks/twilio/route.ts` | Inline `Record<string,string>` |
| Resend webhook | inbound | `dashboard/src/app/api/webhooks/resend/route.ts` | Inline only |
| `comms_log` write | outbound (Firestore) | many | Yes (`CommsLogEntry`) |
| `pulseState` write | outbound (Firestore) | `dashboard/src/lib/comms/trigger-sequences.ts:43` | Yes (`PulseStateSnapshot`) — local |
| NPS reply → `reviews` write | outbound (Firestore) | `dashboard/src/app/api/n8n/callback/route.ts:261` | Inline only |

---

## 2. Firestore collection ownership

Codified in `COLLECTION_OWNERSHIP` in `dashboard/src/lib/contracts/index.ts`.
Mirrors the gate in `dashboard/scripts/check-module-boundaries.sh`.

| Collection | Writers | Readers |
|---|---|---|
| `insight_events` | intelligence | intelligence, pulse, ui |
| `metrics_weekly` | pipeline | intelligence, ui |
| `kpis`, `computeState` | intelligence | intelligence, ui |
| `comms_log` | pulse, n8n | pulse, intelligence, ui |
| `pulseState` | pulse | pulse, ui |
| `sequence_definitions` | pulse | pulse |
| `call_log` | ava | ava, ui |
| `appointments` | pipeline | all consumers |
| `patients` | pipeline, pulse | all consumers |
| `clinicians` | pipeline | all consumers |
| `reviews` | pulse, manual | intelligence, ui |
| `outcome_scores` | pipeline | intelligence, ui |

**Hard rules** (from `check-module-boundaries.sh`):

- Intelligence MUST NOT reference `comms_log` or `/messages`.
- Pulse MUST NOT reference `kpis` or `computeState`.
- All cross-module communication flows via `/clinics/{id}/insight_events`.

---

## 3. Identified gaps and how the contracts file closes them

| # | Gap | Closure |
|---|---|---|
| 1 | `ElevenLabsWebhookPayload` typed inline in route handler | Promoted to `contracts/index.ts §7` as `ElevenLabsWebhookPayload` + `ElevenLabsEventType` |
| 2 | n8n callback body parsed via inline cast | Discriminated union `N8nCallbackPayload` (§4) + `isN8nInboundReply` narrowing helper |
| 3 | Twilio webhook body untyped | `TwilioStatusCallback` (§5) |
| 4 | Resend webhook body untyped | `ResendDeliveryEvent` + `ResendEventType` (§5) |
| 5 | Engine bridge has parallel TS/Python types | `AvaEngineRequest` / `AvaEngineResponse` (§6) — sync requirement called out in JSDoc |
| 6 | Ava Pydantic webhook models not reflected in TS | `AvaCallStartedRequest`, `AvaPatientConfirmedRequest`, `AvaWebhookResponse` (§7) |
| 7 | `call_log` Firestore shape only existed as inline literal | `AvaCallLogEntry` (§7) — superset of public `CallLog` |
| 8 | `PulseStateSnapshot` only lived inside `trigger-sequences.ts` | Promoted to `contracts §4` |
| 9 | No canonical Ava → Pulse handoff event | `AvaInsightEventType` + `AvaInsightEventMetadata` (§8). Today the runtime path is direct SMS; the contract is documented so the migration to the events bus is straightforward |
| 10 | Collection ownership only in shell script + prose | `COLLECTION_OWNERSHIP` constant + `isOwnedBy()` helper (§2) |

**Not closed (out of scope for this pass):**

- WriteUpp / Cliniko webhook envelopes are still loose. Each PMS's webhook
  schema differs and is best owned next to the specific adapter
  (`dashboard/src/lib/integrations/pms/{provider}`). Recommend adding
  per-provider `WebhookEvent` types in those folders rather than in the
  global contracts file.
- LangGraph checkpoint shape beyond `AvaState` (intermediate node state) —
  internal to Ava, not a cross-module concern.

---

## 3.b Architectural improvements (benchmark-SaaS gap fixes)

A second pass benchmarked the contracts against Stripe / Segment / Twilio
event-system patterns and added the following — none of these break
existing types; all are additive and opt-in:

| Pattern | Where in `contracts/index.ts` | Why |
|---|---|---|
| **Schema versioning** | `§0 CONTRACTS_SCHEMA_VERSION` + compatibility rules in header | Producers stamp `schemaVersion` on every `StrydeEvent` so consumers can refuse incompatible writes without runtime guessing |
| **Branded ID types** | `§1b ClinicId / PatientId / ClinicianId / ConversationId / EventId / CommsLogId / TraceId / IdempotencyKey` | Prevents accidentally swapping `clinicianId` and `patientId` at compile time. Old `string` code stays compatible via opt-in `as*` constructors |
| **Generic event envelope** | `§2b StrydeEvent<P>` | Separates "where it lives" (envelope) from "what happened" (payload). Existing `InsightEvent` keeps its shape; new event types use the envelope |
| **Distributed trace context** | `§2b TraceContext`, `makeRootTrace()` | A single `traceId` lets a call → insight_event → comms_log chain be reconstructed in one Firestore query — currently impossible. W3C Trace Context-compatible |
| **Time semantics** | `§2b EventTimestamps` (`occurredAt` vs `detectedAt` vs `processedAt`) | Conflating these breaks KPIs (detection lag pollutes "real" event time) |
| **Actor / audit trail** | `§2b Actor` discriminated union | Every cross-module event names who/what triggered it: system / user / patient / external |
| **Ava → Intelligence fact stream** | `§8b AvaCallFactPayload`, `AvaCallFactEvent` | Currently Intelligence is blind to Ava activity. Defines the contract for KPIs like voice-channel booking conversion, after-hours capture rate, first-call-resolution rate |
| **PII / PHI classification** | `§10 PIIClass`, `PII_FIELD_MAP` | UK clinical data — log scrubbers, error reporters, analytics exports MUST know which fields are PHI/PII. Tagged at type-definition time |
| **Module health surface** | `§11 ModuleHealth`, `HealthStatus` | Replaces ad-hoc per-module shapes (`PulseStateSnapshot` etc.) with a single shape for `/healthz` + admin integration-health |
| **Failed event / DLQ contract** | `§11 FailedEvent<P>`, `RetryPolicy`, `DEFAULT_RETRY_POLICY` | Events that exhaust retries get a typed record at `/clinics/{id}/_failed_events` for replay tooling |
| **Idempotency key helper** | `§12 makeIdempotencyKey()` | Deterministic at-least-once dedupe at the Firestore write layer |

### Why these specifically

I rejected several patterns that mature SaaS uses but would be premature
here:

- **Outbox table** — Firestore eventual consistency is sufficient for the
  StrydeOS volume; an outbox would add complexity for no real win until
  there's a separate streaming consumer.
- **Schema registry / runtime validation** — Zod at every boundary is
  overkill at this stage. TypeScript types + `isStrydeEvent` smoke check is
  the right tradeoff.
- **Event sourcing** — out of scope; we still want the current
  read-optimised Firestore docs.

### Compatibility rules (codified in header)

- Optional fields MAY be added freely.
- Field renames require a `CONTRACTS_SCHEMA_VERSION` major bump.
- Enum / string-union members MAY be added; removal needs a major bump.
- Adding a required field needs a major bump.
- Behavioural changes to existing fields need a major bump and a migration
  note in this doc.

---

## 4. Cross-language sync requirement

`contracts §6` and `§7` define types that have a Python mirror in
`ava_graph/api/routes.py`. **Both must move together.** Suggested
follow-ups:

1. Add a `pytest` snapshot test that imports the Pydantic models and
   asserts field names match a JSON snapshot exported from the TS side.
2. Or, generate Pydantic models from the TS types via `quicktype` or
   similar in CI.

Either approach is a small ticket but out of scope here.

---

## 5. How to use the contracts file

```ts
// Pulse consumer — reading the bus
import type { InsightEvent, N8nCallbackPayload } from "@/lib/contracts";
import { isN8nInboundReply } from "@/lib/contracts";

function handleCallback(body: N8nCallbackPayload) {
  if (isN8nInboundReply(body)) {
    // body is N8nInboundReply
  } else {
    // body is N8nOutboundCallback
  }
}
```

```ts
// Ava engine proxy — typed both sides
import type { AvaEngineRequest, AvaEngineResponse } from "@/lib/contracts";

const payload: AvaEngineRequest = { /* ... */ };
const result: AvaEngineResponse | null = await proxyToEngine(url, payload);
```

```ts
// Module-boundary check at compile time
import { isOwnedBy } from "@/lib/contracts";

if (!isOwnedBy("comms_log", "pulse")) throw new Error("ownership map drift");
```

Direct imports from `@/types/*` continue to work for code already inside a
module (e.g. `@/lib/pulse/*` may import `@/types/insight-events` directly).
**Cross-module code MUST import from `@/lib/contracts`** so the
boundary script and ownership map stay authoritative.

---

## 6. Follow-up tickets (recommended, not in this PR)

1. Migrate `/api/n8n/callback` to use `N8nCallbackPayload` + `isN8nInboundReply`
   instead of inline destructuring (small, mechanical).
2. Migrate `/api/webhooks/elevenlabs` to import `ElevenLabsWebhookPayload`
   and `AvaCallLogEntry` from contracts.
3. Migrate `/api/webhooks/twilio` and `/api/webhooks/resend` to import the
   typed payloads.
4. Generate Python Pydantic mirrors of `AvaEngineRequest` / `AvaEngineResponse`
   in CI (or vice-versa).
5. Wire `AvaInsightEventType` events into `/insight_events` so Pulse can
   run real cadences against Ava follow-up flags rather than the
   single-shot SMS in `notify-callback.ts`.
6. Per-PMS webhook envelope types (`WriteUppWebhookEvent`,
   `ClinikoWebhookEvent`, etc.) in their respective adapter folders.
7. **Adopt branded IDs** in cross-module function signatures (start with
   `consumeInsightEvents`, `triggerCommsSequences`, the n8n callback
   handlers). New code only — no codemod required.
8. **Wire `TraceContext` through `withRequestLog`** so every cross-module
   write picks up the trace id from the inbound webhook automatically.
9. **Implement the Ava call-fact stream** (§8b) — write `AvaCallFactEvent`
   rows from the ElevenLabs webhook handler so Intelligence can compute
   voice-channel KPIs (booking conversion, after-hours capture, FCR).
10. **CI gate for `PII_FIELD_MAP` completeness** — any new field on the
    referenced interfaces without a `PII_FIELD_MAP` entry fails CI.
11. **Migrate `PulseStateSnapshot` consumers to `ModuleHealth`** and add
    `IntelligenceHealth` + `AvaHealth` writers so `/healthz` is unified.

Each is a small, independent change. None is required for the contracts
file itself to be useful — they are progressive cleanups that adopt the
contracts.
