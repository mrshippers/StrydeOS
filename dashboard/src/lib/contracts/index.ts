/**
 * StrydeOS Module Contracts — single source of truth for module-to-module
 * communication.
 *
 * Three product modules:
 *   - Ava           (voice — ElevenLabs + Twilio + Python LangGraph engine)
 *   - Intelligence  (clinical KPI detection, owner-facing insight events)
 *   - Pulse         (patient continuity / retention via n8n + Twilio + Resend)
 *
 * Modules MUST communicate only through the types and bus contracts defined
 * or re-exported here. Direct cross-module imports of internal types are
 * forbidden by `scripts/check-module-boundaries.sh` (CI-enforced).
 *
 * This module is type-only aside from constant maps. It does not change
 * runtime behavior — it formalizes the shapes that already cross module
 * boundaries today and codifies the gaps that future implementations
 * should target.
 *
 * Layout:
 *   §0  Schema version + compatibility rules
 *   §1  Module identifiers
 *   §1b Branded ID types (cross-module type safety)
 *   §2  Firestore collection ownership
 *   §2b StrydeEvent envelope, TraceContext, Actor, time semantics
 *   §3  Intelligence ⇄ Pulse event bus      (`/clinics/{id}/insight_events`)
 *   §4  Pulse outbound + n8n callback        (Pulse → n8n → patient)
 *   §5  Provider delivery webhooks           (Twilio, Resend)
 *   §6  Ava engine bridge                    (Dashboard ⇄ ava_graph FastAPI)
 *   §7  Ava ElevenLabs webhook + call log
 *   §8  Ava → Pulse handoff (canonical shape)
 *   §8b Ava → Intelligence fact stream (call summaries for KPIs)
 *   §9  PMS + HEP adapter contracts
 *   §10 PII classification
 *   §11 Module health + failure / DLQ contracts
 *   §12 Cross-cutting helpers
 *
 * Compatibility rules (forwards/backwards safe schema evolution):
 *   - Fields MAY be added to interfaces. Optional fields are always safe.
 *   - Fields MUST NOT be renamed. Add a new field, deprecate via JSDoc, then
 *     remove in the next major bump of CONTRACTS_SCHEMA_VERSION.
 *   - Enum / string-union members MAY be added. Removal is a major bump.
 *   - Required fields MUST NOT be added without a major bump.
 *   - Behavioural changes (different semantics for the same field) MUST bump
 *     CONTRACTS_SCHEMA_VERSION and update the migration note in
 *     `docs/MODULE_CONTRACTS.md`.
 */

// ─── §0 Schema version + compatibility rules ─────────────────────────────────

/**
 * Major version of the cross-module contracts. Bump on any breaking change
 * (renames, removals, semantic shifts). Stamped on every `StrydeEvent`
 * envelope so consumers can refuse incompatible producers.
 *
 * Version history:
 *   1 — initial extraction (insight_events, comms callbacks, Ava bridge,
 *       branded IDs, trace context, PII tagging, health surface).
 */
export const CONTRACTS_SCHEMA_VERSION = 1 as const;
export type ContractsSchemaVersion = typeof CONTRACTS_SCHEMA_VERSION;

// ─── §1 Module identifiers ───────────────────────────────────────────────────

export const MODULES = ["ava", "intelligence", "pulse"] as const;
export type ModuleName = (typeof MODULES)[number];

/** Producer of a row in `/insight_events` or `/comms_log`. Used for attribution. */
export type Producer = ModuleName | "pipeline" | "n8n" | "manual" | "onboarding";

// ─── §1b Branded ID types ────────────────────────────────────────────────────
//
// Nominal types over `string` that prevent accidentally swapping IDs at call
// sites. Adoption is opt-in: existing `string` fields stay assignable from
// branded types and vice versa via the `as*` helpers. New cross-module
// signatures should prefer branded types for safety.
//
// Example: `function fn(c: ClinicianId, p: PatientId)` — calling with the
// arguments swapped is a compile error.

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type ClinicId       = Brand<string, "ClinicId">;
export type PatientId      = Brand<string, "PatientId">;
export type ClinicianId    = Brand<string, "ClinicianId">;
export type AppointmentId  = Brand<string, "AppointmentId">;
export type ConversationId = Brand<string, "ConversationId">;  // ElevenLabs call ID
export type EventId        = Brand<string, "EventId">;          // /insight_events doc id
export type CommsLogId     = Brand<string, "CommsLogId">;       // /comms_log doc id
export type TraceId        = Brand<string, "TraceId">;          // distributed trace
export type IdempotencyKey = Brand<string, "IdempotencyKey">;

// Constructor helpers — explicit casts so the cast site is greppable.
export const asClinicId       = (s: string): ClinicId       => s as ClinicId;
export const asPatientId      = (s: string): PatientId      => s as PatientId;
export const asClinicianId    = (s: string): ClinicianId    => s as ClinicianId;
export const asAppointmentId  = (s: string): AppointmentId  => s as AppointmentId;
export const asConversationId = (s: string): ConversationId => s as ConversationId;
export const asEventId        = (s: string): EventId        => s as EventId;
export const asCommsLogId     = (s: string): CommsLogId     => s as CommsLogId;
export const asTraceId        = (s: string): TraceId        => s as TraceId;
export const asIdempotencyKey = (s: string): IdempotencyKey => s as IdempotencyKey;

// ─── §2 Firestore collection ownership ───────────────────────────────────────

/**
 * Authoritative ownership map for all Firestore collections under
 * `/clinics/{clinicId}/...`. Mirrors `scripts/check-module-boundaries.sh`.
 *
 *   - `writers` — modules permitted to write the collection
 *   - `readers` — modules permitted to read the collection
 *
 * Cross-boundary reads are allowed where listed; cross-boundary writes are
 * not. Adding a new collection requires updating this map AND the boundary
 * script in the same commit.
 */
export const COLLECTION_OWNERSHIP = {
  // Intelligence-owned writes
  insight_events:       { writers: ["intelligence"], readers: ["intelligence", "pulse", "ui"] },
  metrics_weekly:       { writers: ["pipeline"],     readers: ["intelligence", "ui"] },
  computeState:         { writers: ["intelligence"], readers: ["intelligence", "ui"] },
  kpis:                 { writers: ["intelligence"], readers: ["intelligence", "ui"] },

  // Pulse-owned writes
  comms_log:            { writers: ["pulse", "n8n"], readers: ["pulse", "intelligence", "ui"] },
  pulseState:           { writers: ["pulse"],         readers: ["pulse", "ui"] },
  sequence_definitions: { writers: ["pulse"],         readers: ["pulse"] },

  // Ava-owned writes
  call_log:             { writers: ["ava"],           readers: ["ava", "ui"] },
  call_facts:           { writers: ["ava"],           readers: ["intelligence", "ui"] },

  // Failed-event DLQ (any module may write a FailedEvent for a row it owns)
  _failed_events:       { writers: ["pulse", "intelligence", "ava"], readers: ["intelligence", "ui"] },

  // Shared / pipeline-written
  appointments:         { writers: ["pipeline"],      readers: ["intelligence", "pulse", "ava", "ui"] },
  patients:             { writers: ["pipeline", "pulse"], readers: ["intelligence", "pulse", "ava", "ui"] },
  clinicians:           { writers: ["pipeline"],      readers: ["intelligence", "pulse", "ava", "ui"] },
  reviews:              { writers: ["pulse", "manual"], readers: ["intelligence", "ui"] },
  outcome_scores:       { writers: ["pipeline"],      readers: ["intelligence", "ui"] },

  // Internal infrastructure
  _webhook_dedup:       { writers: ["pipeline"],      readers: ["pipeline"] },
  _schema_version:      { writers: ["pipeline"],      readers: ["pipeline"] },
} as const satisfies Record<string, { writers: readonly string[]; readers: readonly string[] }>;

export type CollectionName = keyof typeof COLLECTION_OWNERSHIP;

// ─── §2b StrydeEvent envelope, TraceContext, Actor, time semantics ──────────
//
// Generic envelope for any event published on the cross-module bus. Existing
// `InsightEvent` predates this and stays unchanged for backwards compat;
// new event types defined for cross-module use SHOULD use this envelope so
// versioning, tracing, and idempotency are uniform.

/**
 * Identifies who or what caused an event to be emitted. Critical for audit
 * trails — every InsightEvent / CommsLog should attribute to an Actor in the
 * future.
 */
export type Actor =
  | { kind: "system"; module: ModuleName | "pipeline" | "n8n" }
  | { kind: "user"; uid: string; role: "superadmin" | "owner" | "admin" | "clinician" }
  | { kind: "patient"; patientId: PatientId }
  | { kind: "external"; provider: "elevenlabs" | "twilio" | "resend" | "writeupp" | "cliniko" | "physitrack" | string };

/**
 * Distributed-trace context propagated end-to-end across modules. When a
 * call → insight_event → comms_log chain happens, all three rows share the
 * same `traceId` so the chain can be reconstructed in a single Firestore
 * query. `parentSpanId` lets each module record its span.
 *
 * Honours W3C Trace Context (https://www.w3.org/TR/trace-context/) so it can
 * be piped into OpenTelemetry without translation.
 */
export interface TraceContext {
  traceId: TraceId;
  spanId?: string;
  parentSpanId?: string;
  /** Where this trace originated. */
  rootProducer: Producer;
  /** ISO 8601. When the root cause occurred (e.g. call started, appt booked). */
  rootOccurredAt: string;
}

/**
 * Time semantics. Different timestamps mean different things and conflating
 * them produces bad metrics:
 *
 *   - occurredAt   — when the underlying clinical/business fact happened
 *                     (call ended, appointment booked, NPS reply received)
 *   - detectedAt   — when Intelligence's detector noticed it (may lag by
 *                     hours/days for batch detection)
 *   - processedAt  — when a consumer (Pulse, comms) acted on it
 *   - createdAt    — when the Firestore doc was written
 *
 * Always store `occurredAt`; `detectedAt`/`processedAt` only when the
 * difference is actionable.
 */
export interface EventTimestamps {
  occurredAt: string;
  detectedAt?: string;
  processedAt?: string;
  createdAt: string;
}

/**
 * Generic event envelope for cross-module events. New event types should use
 * this. Existing types (InsightEvent, CommsLogEntry) keep their current
 * shape; if/when they migrate they become `StrydeEvent<InsightPayload>`.
 *
 * @template P — the payload type (the actual fact / action the event carries)
 */
export interface StrydeEvent<P> {
  /** Unique event ID — also the Firestore doc id. */
  id: EventId;
  /** Event type (string-union scoped to the producing module). */
  type: string;
  /** Stamped from CONTRACTS_SCHEMA_VERSION at write time. */
  schemaVersion: ContractsSchemaVersion;
  /** Multi-tenant scope. */
  clinicId: ClinicId;
  /** Module that produced the event. */
  source: Producer;
  /** Who/what triggered the event. */
  actor: Actor;
  /** Distributed-trace propagation. */
  trace: TraceContext;
  /**
   * Idempotency key for at-least-once delivery — consumers SHOULD dedupe on
   * this. Equal idempotencyKey + clinicId means "same event, retry."
   */
  idempotencyKey: IdempotencyKey;
  /** Time semantics — see EventTimestamps. */
  times: EventTimestamps;
  /** The actual payload. Type-checked via the generic `P`. */
  payload: P;
  /**
   * Consumers that have processed this event. `arrayUnion`-stamped for
   * idempotency against re-runs and concurrent consumers.
   */
  consumedBy?: ModuleName[];
  /** Free-form metadata; consumers MUST treat unknown keys as opaque. */
  metadata?: Record<string, unknown>;
}

// ─── §3 Intelligence → Pulse event bus ───────────────────────────────────────
//
// Bus location: `/clinics/{clinicId}/insight_events`.
// Producer: Intelligence (`detect-insight-events.ts`).
// Consumer: Pulse (`insight-event-consumer.ts`).
// Idempotency: `consumedBy: string[]` stamped via arrayUnion('pulse').

export type {
  InsightEvent,
  InsightEventType,
  InsightSeverity,
  InsightConfig,
  InsightEngineMilestone,
} from "@/types/insight-events";
export {
  OWNER_EVENTS,
  PATIENT_ACTION_EVENTS,
  EVENT_TO_SEQUENCE,
  DEFAULT_INSIGHT_CONFIG,
} from "@/types/insight-events";

// ─── §4 Pulse outbound + n8n callback ────────────────────────────────────────

export type {
  CommsLogEntry,
  CommsOutcome,
  CommsChannel,
  SequenceType,
  NpsCategory,
} from "@/types/comms-base";
export type {
  N8nSequencePayload,
  N8nWebhookPayload,
  SequenceDefinition,
  SequenceStep,
  ToneModifier,
  ExitCondition,
} from "@/types/comms";

/**
 * Pulse → n8n outbound dispatch happens via `N8nSequencePayload` (above).
 * n8n → dashboard responses arrive at `/api/n8n/callback` and were typed
 * inline before this contract layer existed. The discriminated union below
 * is the canonical shape for that endpoint.
 */

export type N8nOutcomeRaw =
  | "booked"
  | "rebooked"
  | "unsubscribed"
  | "optout"
  | "stop"
  | "no_action"
  | (string & {}); // keep open for forward-compat from n8n

export interface N8nOutboundCallback {
  /** Default (absent) discriminator — outbound execution callback. */
  type?: "outbound";
  clinicId: string;
  patientId: string;
  sequenceType: import("@/types").SequenceType;
  channel: import("@/types").CommsChannel;
  /** comms_log doc id created at send time by trigger-sequences. */
  logId: string;
  executionId: string;
  outcome: N8nOutcomeRaw;
  openedAt?: string;
  clickedAt?: string;
}

export interface N8nInboundReply {
  type: "inbound_reply";
  clinicId: string;
  fromPhone: string;
  replyText: string;
  /** ISO 8601 timestamp from n8n. Server falls back to now() if absent. */
  receivedAt: string;
}

export type N8nCallbackPayload = N8nOutboundCallback | N8nInboundReply;

/**
 * Singleton run-status doc at `/clinics/{id}/pulseState/pulseState`.
 * Written by `trigger-sequences.ts` at run start and end.
 */
export interface PulseStateSnapshot {
  lastRunAt: string;
  runId: string;
  status: "running" | "ok" | "partial" | "error";
  queuedCount: number | null;
  failedCount: number | null;
  lastError: string | null;
}

// ─── §5 Provider delivery webhooks ───────────────────────────────────────────

/**
 * Twilio MessageStatus values from the delivery callback.
 * `sent`, `queued`, `sending` are in-flight; the rest are terminal.
 */
export type TwilioMessageStatus =
  | "delivered"
  | "undelivered"
  | "failed"
  | "sent"
  | "queued"
  | "sending";

/**
 * Subset of `CommsOutcome` that a Twilio status callback resolves to.
 * Other Twilio statuses are in-flight (`null` mapping) and don't update
 * `comms_log`.
 */
export type TwilioResolvedOutcome = "delivered" | "send_failed";

/**
 * Twilio MessageStatus callback. Body is x-www-form-urlencoded; only the
 * fields we consume are listed. Signature verified via
 * `twilio.validateRequest`.
 */
export interface TwilioStatusCallback {
  MessageSid: string;
  MessageStatus: TwilioMessageStatus;
  /** Forward-compat: Twilio sends ~30 fields; we ignore the rest. */
  [otherField: string]: string | undefined;
}

/**
 * Resend webhook event. Discriminated by `type` so each variant carries the
 * fields actually populated by the corresponding Resend event. Signature
 * verified via Resend webhook secret in `/api/webhooks/resend`.
 */
export type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked";

interface ResendEventBase {
  created_at: string;
}
interface ResendEmailIdData {
  /** Resend email_id; matched against `comms_log.resendId`. */
  email_id: string;
}
export type ResendDeliveryEvent =
  | (ResendEventBase & { type: "email.sent";       data: ResendEmailIdData })
  | (ResendEventBase & { type: "email.delivered";  data: ResendEmailIdData })
  | (ResendEventBase & { type: "email.bounced";    data: ResendEmailIdData & { bounce_type?: string } })
  | (ResendEventBase & { type: "email.complained"; data: ResendEmailIdData })
  | (ResendEventBase & { type: "email.opened";     data: ResendEmailIdData & { opened_at?: string } })
  | (ResendEventBase & { type: "email.clicked";    data: ResendEmailIdData & { clicked_at?: string; link?: string } });

// ─── §6 Ava engine bridge (Dashboard ⇄ ava_graph FastAPI) ────────────────────
//
// The TypeScript dashboard proxies ElevenLabs tool calls to the Python
// `ava_graph` FastAPI service. The Python side defines mirror Pydantic
// models in `ava_graph/api/routes.py` (ToolExecuteRequest /
// ToolExecuteResponse). Any change here MUST be mirrored there in the
// same commit.

export type AvaPmsType = "writeupp" | "cliniko" | "jane" | "tm3";
export type AvaToolName = "check_availability" | "book_appointment";

export interface AvaEngineRequest {
  tool_name: AvaToolName;
  /** Tool-specific parameters; see ava_graph tools for per-tool shape. */
  tool_input: Record<string, unknown>;
  clinic_id: string;
  pms_type: AvaPmsType;
  /** Per-clinic PMS credential, injected from Firestore at call time. */
  api_key: string;
  /** Empty string falls back to provider default base URL. */
  base_url?: string;
}

export interface AvaEngineResponse {
  /** Human-readable result string for ElevenLabs to speak. */
  result: string;
  /** Present only for book_appointment. */
  booking_id?: string;
  /** Present only for check_availability. ISO 8601 datetime strings. */
  slots?: string[];
}

// ─── §7 Ava ElevenLabs webhook + call log ────────────────────────────────────

export type ElevenLabsEventType =
  | "conversation.started"
  | "conversation.ended"
  | "call.transcript.update"
  | "agent.message"
  | "user.message";

/**
 * Inbound payload at `/api/webhooks/elevenlabs`. Signature verified via
 * `verifyElevenLabsSignature`. Was previously typed inline in the route
 * handler; promoted here for cross-module use.
 */
export interface ElevenLabsWebhookPayload {
  event: ElevenLabsEventType;
  conversation_id: string;
  agent_id?: string;
  user_id?: string;
  status?: string;
  call_duration?: number;
  transcript?: string;
  summary?: string;
  reason_for_call?: string;
  caller_phone?: string;
  /** Unix epoch seconds from ElevenLabs. Multiplied by 1000 on write. */
  timestamp?: number;
  custom_metadata?: Record<string, unknown>;
}

/** Final outcome derived after LangGraph intent classification. */
export type AvaCallOutcome =
  | "resolved"
  | "booked"
  | "escalated"
  | "follow_up_required"
  | "transferred"
  | "voicemail";

/** Action returned by the LangGraph state machine in `@/lib/ava/graph`. */
export type AvaGraphAction =
  | "continue"
  | "book_appointment"
  | "escalate_999"
  | "callback_request"
  | "transfer_call"
  | "relay_message"
  | "end_call";

/**
 * Document shape at `/clinics/{clinicId}/call_log/{conversationId}`.
 * Written by `/api/webhooks/elevenlabs`. The minimal `CallLog` in
 * `@/types/call-log.ts` is for UI consumption; this is the full
 * server-side shape including LangGraph metadata.
 */
export interface AvaCallLogEntry {
  agentId: string;
  conversationId: string;
  event: ElevenLabsEventType;
  status: string;
  callerPhone: string | null;
  transcript: string | null;
  callSummary: string | null;
  reasonForCall: string | null;
  durationSeconds: number | null;
  /** Unix epoch milliseconds. */
  startTimestamp: number;
  outcome?: AvaCallOutcome;
  graphAction?: AvaGraphAction;
  graphIntent?: string | null;
  graphMetadata?: Record<string, unknown> | null;
  updatedAt: string;
}

export type {
  CallLog,
  CallOutcome,
} from "@/types/call-log";

// Webhook shapes mirrored on the Python side (ava_graph/api/routes.py).
// Keep these in sync with the Pydantic models there.

/** Mirror of Python `CallStartedWebhook`. */
export interface AvaCallStartedRequest {
  call_id: string;
  patient_name: string;
  patient_phone: string;
  /** Defaults to "General" server-side. */
  requested_service?: string;
  /** Defaults to empty string server-side. */
  preferred_time?: string;
}

/** Mirror of Python `PatientConfirmedWebhook`. */
export interface AvaPatientConfirmedRequest {
  session_id: string;
  confirmed: boolean;
}

/** Standard envelope returned by every Ava webhook. */
export interface AvaWebhookResponse {
  /** ElevenLabs-spoken response. */
  response: string;
  end_conversation: boolean;
  session_id: string;
  status: "awaiting_confirmation" | "confirmed" | string;
  response_message: string;
  /** Present only on terminal `confirmed` responses. */
  booking_id?: string;
}

// ─── §8 Ava → Pulse handoff (canonical shape) ────────────────────────────────
//
// As of 2026-05, Ava's follow-up handoff is implemented as a direct SMS via
// `notify-callback.ts` (fire-and-forget). The canonical contract for moving
// this onto the `/insight_events` bus — so Pulse can run real cadences
// against the same call outcomes — is defined here. Producers should write
// these into `/clinics/{clinicId}/insight_events` with `actionTarget: 'patient'`
// when wiring this surface, so the existing Pulse consumer picks them up
// without changes.

export type AvaInsightEventType =
  /** Caller asked for a callback / follow-up. */
  | "AVA_CALLBACK_REQUESTED"
  /** Caller booked via Ava — confirmation nudge candidate. */
  | "AVA_CALL_BOOKED"
  /** Triage flagged urgent (999 / safeguarding). Owner-actionable. */
  | "AVA_CALL_ESCALATED";

export interface AvaInsightEventMetadata {
  conversationId: string;
  callerPhone: string | null;
  /** LangGraph-classified callback bucket; null when unspecified. */
  callbackType: string | null;
  /** Free-text reason from graphMetadata or payload.reason_for_call. */
  reason: string | null;
  /** Call duration in seconds from ElevenLabs; null when not reported. */
  callDurationSeconds: number | null;
}

// ─── §8b Ava → Intelligence fact stream ──────────────────────────────────────
//
// Currently Intelligence has zero visibility into Ava activity. To compute
// KPIs like "voice-channel booking conversion", "first-call resolution rate",
// "after-hours capture rate", or "Ava-vs-receptionist mix", Intelligence
// needs structured facts from each call — not just the loose `call_log`
// document Ava writes today.
//
// The fact stream below is the canonical shape for Ava → Intelligence. It
// SHOULD be written to `/clinics/{clinicId}/call_facts` (a new
// Intelligence-readable, Ava-written collection) when this surface is wired.
// Until then, Intelligence falls back to deriving facts from `call_log`.

export type AvaCallFactType =
  /** Call ended; full context available for KPI ingestion. */
  | "AVA_CALL_ENDED"
  /** Booking attempt completed (success or failure). */
  | "AVA_BOOKING_ATTEMPTED"
  /** Caller hung up or was disconnected before resolution. */
  | "AVA_CALL_ABANDONED";

export interface AvaCallFactPayload {
  conversationId: ConversationId;
  callerPhone: string | null;
  /** When the call started (UTC). */
  startedAt: string;
  /** When the call ended (UTC). */
  endedAt: string;
  durationSeconds: number;
  /** Final outcome after LangGraph classification. */
  outcome: AvaCallOutcome;
  /** True if Ava successfully booked an appointment via the PMS. */
  booked: boolean;
  /** Set when booked; references the PMS appointment id. */
  appointmentExternalId?: string;
  /**
   * Whether the caller was matched to an existing patient record.
   * Optional: producers that don't run a phone-lookup leave this absent
   * and Intelligence skips the corresponding KPI.
   */
  patientMatched?: boolean;
  /** Set when patientMatched. */
  patientId?: PatientId;
  /** PMS the call routed to. */
  pmsType: AvaPmsType;
  /**
   * Whether the call was outside the clinic's configured business hours
   * (Intelligence uses this for the "after-hours capture rate" KPI).
   * Optional — requires clinic businessHours to be configured.
   */
  outOfHours?: boolean;
  /**
   * Number of slot proposals before resolution / abandonment. Proxy for
   * caller friction. Optional — requires LangGraph state hand-off.
   */
  proposalCount?: number;
  /** Whether the call was transferred to a human. */
  transferred: boolean;
  /** Triage flag (urgent / safeguarding / 999). */
  escalated: boolean;
}

/** Concrete call-fact event using the StrydeEvent envelope. */
export type AvaCallFactEvent = StrydeEvent<AvaCallFactPayload> & {
  type: AvaCallFactType;
};

// ─── §9 PMS + HEP adapter contracts ──────────────────────────────────────────

export type {
  PMSAdapter,
  PMSAppointment,
  PMSPatient,
  PMSClinician,
  PMSIntegrationConfig,
  PMSStatusMap,
  CreateAppointmentParams,
  CreatePatientParams,
  InsuranceInfo,
} from "@/types/pms";
export {
  WRITEUPP_STATUS_MAP,
  CLINIKO_STATUS_MAP,
  HALAXY_STATUS_MAP,
  ZANDA_STATUS_MAP,
  PPS_STATUS_MAP,
} from "@/types/pms";

export type {
  HEPAdapter,
  HEPProgramme,
  HEPPromResult,
  HEPAdherenceResult,
  HEPPatientRef,
  HEPIntegrationConfig,
} from "@/lib/integrations/hep/types";

// ─── §10 PII classification ──────────────────────────────────────────────────
//
// StrydeOS handles UK clinical data — patient names, phone numbers, call
// transcripts, NPS replies. Fields that carry these MUST be flagged so
// downstream systems (logs, analytics exports, error reporters) can redact.
// This is enforced by convention at type-definition time, not at runtime.

/**
 * PII / PHI sensitivity class. Tag fields in JSDoc on shared types using
 * `@pii <class>` so a future codemod can produce a redaction map.
 *
 *   - `phi`     — Protected Health Information (clinical notes, transcripts)
 *   - `pii`     — Direct identifiers (name, email, phone, DOB)
 *   - `pii-ref` — Internal IDs that link to PII (patientId, conversationId)
 *   - `public`  — Non-sensitive (clinic name, sequence type, outcome enums)
 */
export type PIIClass = "phi" | "pii" | "pii-ref" | "public";

/**
 * Field-level PII map for the cross-module event types. Used by log
 * scrubbers and analytics pipelines to mask sensitive fields when
 * forwarding to third parties (Sentry, Segment, etc.).
 *
 * MUST be kept in sync with the corresponding interfaces. Adding a sensitive
 * field without an entry here is a CI failure (planned — see follow-up #4
 * in docs/MODULE_CONTRACTS.md).
 */
export const PII_FIELD_MAP = {
  InsightEvent: {
    patientName:        "pii",
    clinicianName:      "pii",
    description:        "phi",
    observationalNote:  "phi",
    ownerNarrative:     "phi",
    clinicianNarrative: "phi",
    patientId:          "pii-ref",
    clinicianId:        "pii-ref",
    metadata:           "phi", // pessimistic — may carry transcripts
  },
  CommsLogEntry: {
    inboundReply: "phi",
    npsScore:     "phi",
    twilioSid:    "pii-ref",
    resendId:     "pii-ref",
    patientId:    "pii-ref",
  },
  AvaCallLogEntry: {
    callerPhone:    "pii",
    transcript:     "phi",
    callSummary:    "phi",
    reasonForCall:  "phi",
    graphMetadata:  "phi",
  },
  AvaCallFactPayload: {
    callerPhone: "pii",
    patientId:   "pii-ref",
  },
} as const satisfies Record<string, Record<string, PIIClass>>;

// ─── §11 Module health + failure / DLQ contracts ─────────────────────────────
//
// Unified health contract so `/healthz`, the admin integration-health page,
// and Sentry breadcrumbs all read the same shape per module. Replaces the
// per-module ad-hoc shape (e.g. `PulseStateSnapshot`).

export type HealthStatus = "ok" | "degraded" | "error" | "disabled";

export interface ModuleHealth {
  module: ModuleName;
  status: HealthStatus;
  /** ISO 8601. */
  lastRunAt: string;
  /** Run identifier — corresponds to TraceContext.traceId of the last run. */
  lastRunId: TraceId;
  /** Counts from the last run. */
  counts: {
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  /** Most recent error message, if any. */
  lastError?: string | null;
  /** Free-form per-module diagnostics. */
  diagnostics?: Record<string, unknown>;
}

/**
 * Failed-event record. When a consumer cannot process a `StrydeEvent` after
 * its retry budget is exhausted, a `FailedEvent` SHOULD be written to
 * `/clinics/{clinicId}/_failed_events`. The original event id is preserved
 * for replay tooling.
 */
export interface FailedEvent<P = unknown> {
  id: EventId;
  /** Original event id (for replay). */
  originalEventId: EventId;
  clinicId: ClinicId;
  failedIn: ModuleName;
  /** Number of attempts before giving up. */
  attempts: number;
  /** First error captured. */
  firstError: string;
  /** Most recent error captured. */
  lastError: string;
  firstFailedAt: string;
  lastFailedAt: string;
  /** Original payload, preserved verbatim for replay. */
  originalPayload: P;
  /** Original trace context — replay reuses traceId for stitched timelines. */
  trace: TraceContext;
}

/** Standard retry policy. Producers MAY override per event type. */
export interface RetryPolicy {
  maxAttempts: number;
  /** Base backoff in ms. Exponential: `backoffMs * 2^(attempt-1)`. */
  backoffMs: number;
  /** Cap on a single backoff window. */
  maxBackoffMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  backoffMs: 1_000,
  maxBackoffMs: 60_000,
};

// ─── §12 Cross-cutting helpers ───────────────────────────────────────────────

/**
 * Compile-time check that a value is the discriminator of a member of
 * `N8nCallbackPayload`. Used by the `/api/n8n/callback` route to narrow
 * the inbound body before dispatch.
 */
export function isN8nInboundReply(
  payload: { type?: string }
): payload is N8nInboundReply {
  return payload.type === "inbound_reply";
}

/**
 * Compile-time check for whether a Firestore collection is module-owned
 * by a given module. Mirrors the runtime gate in
 * `scripts/check-module-boundaries.sh` for use inside TypeScript code.
 */
export function isOwnedBy(
  collection: CollectionName,
  module: ModuleName
): boolean {
  const owners = COLLECTION_OWNERSHIP[collection].writers as readonly string[];
  return owners.includes(module);
}

/**
 * Build a deterministic idempotency key from a stable producer identifier
 * plus a unique source-side reference (e.g. `${"ava"}:${conversationId}`).
 * Producers SHOULD use this so retries from upstream (ElevenLabs, Twilio,
 * n8n) collapse to a single Firestore write.
 */
export function makeIdempotencyKey(
  producer: Producer,
  sourceRef: string
): IdempotencyKey {
  return `${producer}:${sourceRef}` as IdempotencyKey;
}

/**
 * Build a fresh TraceContext at the root of a flow (a new call, a webhook
 * arrival, a scheduled detection run). Downstream consumers should
 * propagate this object verbatim, only updating `parentSpanId`/`spanId`
 * when crossing a module boundary.
 */
export function makeRootTrace(
  rootProducer: Producer,
  rootOccurredAt: string = new Date().toISOString()
): TraceContext {
  // Date-prefixed random — collision-resistant without crypto import. Good
  // enough for trace stitching; not for security-sensitive uniqueness.
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return {
    traceId: id as TraceId,
    rootProducer,
    rootOccurredAt,
  };
}

/**
 * Type guard — verifies the minimal shape of a StrydeEvent envelope.
 * Useful at consumer boundaries to refuse malformed bus rows early.
 */
export function isStrydeEvent<P>(value: unknown): value is StrydeEvent<P> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.type === "string" &&
    typeof v.schemaVersion === "number" &&
    typeof v.clinicId === "string" &&
    typeof v.idempotencyKey === "string" &&
    typeof v.times === "object" &&
    v.times !== null &&
    typeof v.payload !== "undefined"
  );
}
