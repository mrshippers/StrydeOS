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
 *   §1  Module identifiers
 *   §2  Firestore collection ownership
 *   §3  Intelligence ⇄ Pulse event bus      (`/clinics/{id}/events`)
 *   §4  Pulse outbound + n8n callback        (Pulse → n8n → patient)
 *   §5  Provider delivery webhooks           (Twilio, Resend)
 *   §6  Ava engine bridge                     (Dashboard ⇄ ava_graph FastAPI)
 *   §7  Ava ElevenLabs webhook + call log
 *   §8  Ava → Pulse handoff (canonical shape)
 *   §9  PMS + HEP adapter contracts
 *   §10 Cross-cutting helpers
 */

// ─── §1 Module identifiers ───────────────────────────────────────────────────

export const MODULES = ["ava", "intelligence", "pulse"] as const;
export type ModuleName = (typeof MODULES)[number];

/** Producer of a row in `/events` or `/comms_log`. Used for attribution. */
export type Producer = ModuleName | "pipeline" | "n8n" | "manual" | "onboarding";

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
 * Twilio MessageStatus callback. Body is x-www-form-urlencoded; only the
 * fields we consume are listed. Signature verified via
 * `twilio.validateRequest`.
 */
export interface TwilioStatusCallback {
  MessageSid: string;
  MessageStatus:
    | "delivered"
    | "undelivered"
    | "failed"
    | "sent"
    | "queued"
    | "sending";
  /** Forward-compat: Twilio sends ~30 fields; we ignore the rest. */
  [otherField: string]: string | undefined;
}

/**
 * Resend webhook event. Outer wrapper plus typed `data` payload for the
 * subset of events Pulse subscribes to. Signature verified via
 * Resend webhook secret in `/api/webhooks/resend`.
 */
export type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked";

export interface ResendDeliveryEvent {
  type: ResendEventType;
  created_at: string;
  data: {
    /** Resend email_id; matched against `comms_log.resendId`. */
    email_id: string;
    [k: string]: unknown;
  };
}

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
  callbackType?: string;
  reason?: string | null;
  callDurationSeconds?: number | null;
}

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

// ─── §10 Cross-cutting helpers ───────────────────────────────────────────────

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
