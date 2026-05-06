import type { LifecycleState } from "./patient";

export type CommsChannel = "email" | "sms" | "whatsapp";

/**
 * Comms message lifecycle state.
 *
 * - `pending` — enqueued, provider has not yet confirmed delivery. Initial state
 *   for new sends via trigger-sequences, insight-event-consumer, and /api/comms/send.
 * - `no_action` — sent and delivered; patient took no action. Retained semantics
 *   for historical docs and for n8n callbacks that explicitly report no-response.
 * - `booked` — patient booked an appointment (n8n callback).
 * - `unsubscribed` — patient opted out (n8n callback or STOP reply).
 * - `responded` — patient sent an inbound reply (includes NPS responses).
 * - `send_failed` — provider reported delivery failure (Twilio / Resend webhook).
 *
 * State transitions (initial → terminal):
 *   pending → delivered-implicit (via `no_action` on callback) | booked | responded
 *   pending → send_failed  (Twilio undelivered/failed, Resend bounced/complained)
 *   pending → unsubscribed (STOP reply)
 */
export type CommsOutcome =
  | "pending"
  | "delivered"
  | "booked"
  | "no_action"
  | "unsubscribed"
  | "responded"
  | "send_failed";

export type SequenceType =
  | "hep_reminder"
  | "rebooking_prompt"
  | "pre_auth_collection"
  | "review_prompt"
  | "reactivation_90d"
  | "reactivation_180d"
  | "early_intervention";

export type NpsCategory = "promoter" | "passive" | "detractor";

export interface CommsLogEntry {
  id: string;
  patientId: string;
  /** Denormalised from patient.clinicianId at send time for query scoping. */
  clinicianId?: string;
  sequenceType: SequenceType;
  channel: CommsChannel;
  sentAt: string;
  openedAt?: string;
  clickedAt?: string;
  outcome: CommsOutcome;
  n8nExecutionId?: string;
  // Step tracking (multi-touch cadence)
  stepNumber?: number;                           // which step in the 6-touch cadence (1–6)
  /**
   * Resolved template key for this send (e.g. "rebooking_step1").
   * Optional for backward compatibility with legacy comms_log docs;
   * required on all new writes for future template-migration support.
   */
  templateKey?: string;
  /** Future: reference to a Firestore-backed campaign document. null = schedule-driven. */
  campaignId?: string | null;
  /** Future: template schema version at send time. Absent = hardcoded in-source. */
  templateVersion?: number;
  /** Reference to the Intelligence insight_event that triggered this send, if any. */
  insightEventId?: string;
  /** True when this comms was triggered via insight-event-consumer (not the scheduled trigger). */
  triggeredByIntelligence?: boolean;
  /** The Intelligence event type that caused this send (for audit and analytics). */
  insightEventType?: string;
  attributionWindowDays?: number;                // from sequence_definition at send time
  patientLifecycleStateAtSend?: LifecycleState;  // patient state when this message was sent
  // Attribution
  attributedRevenuePence?: number;               // populated when outcome = 'booked'
  attributedAppointmentId?: string;
  // Delivery tracking IDs (populated at send time for webhook correlation)
  twilioSid?: string;   // Twilio MessageSid — matched by /api/webhooks/twilio
  resendId?: string;    // Resend email_id — matched by /api/webhooks/resend
  // Inbound reply
  inboundReply?: string | null;
  inboundAt?: string | null;
  // NPS (populated when reply to review_prompt is a valid 0–10 score)
  npsScore?: number | null;
  npsCategory?: NpsCategory | null;
}
