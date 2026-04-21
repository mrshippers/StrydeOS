// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "admin" | "clinician" | "superadmin";
export type UserStatus = "invited" | "onboarding" | "registered";

export interface UserDocument {
  clinicId: string;
  clinicianId?: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  status: UserStatus;
  firstLogin: boolean;
  tourCompleted: boolean;
  /** Multi-site: additional clinic IDs this user can access (server-set only). */
  allowedClinicIds?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface AuthUser {
  uid: string;
  email: string;
  clinicId: string;
  clinicianId?: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  firstLogin: boolean;
  tourCompleted: boolean;
  status: UserStatus;
  mfaEnrolled: boolean;
  clinicProfile: ClinicProfile | null;
  /** Multi-site: all clinic IDs this user can access (includes primary clinicId). */
  allowedClinicIds: string[];
  /** Multi-site: clinic ID + name pairs for the picker dropdown. */
  allowedClinics: { id: string; name: string }[];
  /** Multi-site: the currently active clinic (may differ from primary clinicId). */
  activeClinicId: string;
  /** Multi-site: true when user has access to 2+ clinics. */
  isMultiSite: boolean;
}

// ─── Clinic ──────────────────────────────────────────────────────────────────

export interface FeatureFlags {
  intelligence: boolean;
  continuity: boolean;
  receptionist: boolean;
  /** Opt-in: enable outcome measures recording + correlation in Intelligence. */
  outcomeTracking?: boolean;

  // ─── Clinician Engagement Layer ───────────────────────────
  /** Fix 1: Today's Focus nudges on clinician dashboard. Default true. */
  clinicianNudges?: boolean;
  /** Fix 2: Weekly digest email to each clinician. Default true. */
  clinicianDigest?: boolean;
  /** Fix 3: Auto-sync outcome scores from HEP provider (Physitrack). Default true when hepType is set. */
  hepOutcomeSync?: boolean;
  /** Fix 5: Show UK benchmark ranges on StatCards and TargetsCard. Default true. */
  showBenchmarks?: boolean;
  /** Fix 7: Simplified nav for clinician role (hide Ava, Clinicians table). Default true. */
  clinicianNavSimplified?: boolean;
  /** Fix 8: Mobile-optimised clinician experience. Default true. */
  clinicianMobileOptimised?: boolean;
}

export type StripeSubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "trialing"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export type BillingTier = "solo" | "studio" | "clinic";

export interface BillingState {
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: StripeSubscriptionStatus | null;
  currentPeriodEnd: string | null;
  tier?: BillingTier | null;
  extraSeats?: number;
}

export interface ClinicTargets {
  followUpRate: number;
  hepRate: number;
  utilisationRate: number;
  dnaRate: number;
  treatmentCompletionTarget: number;
  /** Available appointment slots per clinician per week (default: 40 = 8/day × 5 days). */
  weeklyCapacitySlots?: number;
}

export interface BrandConfig {
  logo?: string;
  primaryColor?: string;
  clinicUrl?: string;
}

export interface NpsConfig {
  /** Whether the review_prompt SMS sequence fires automatically post-appointment. */
  enabled: boolean;
  /** Days after appointment before NPS SMS is sent (step 1). */
  npsDelayDays: number;
  /** Days after appointment before Google Review nudge is sent to promoters (step 2). */
  reviewNudgeDelayDays: number;
  /** Minimum days between NPS surveys for the same patient. */
  cooldownDays: number;
  /** Clinic's Google Business Profile URL — required for promoter → review nudge. */
  googleReviewUrl: string | null;
}

export interface OnboardingState {
  pmsConnected: boolean;
  cliniciansConfirmed: boolean;
  targetsSet: boolean;
}

// ─── Onboarding V2 State Machine ─────────────────────────────────────────────

export type OnboardingStage =
  | "signup_complete"
  | "onboarding_started"
  | "integration_self_serve"
  | "integration_blocked"
  | "fallback_live"
  | "api_connected"
  | "first_value_reached"
  | "activation_complete";

export type OnboardingBlocker =
  | "missing_api_credentials"
  | "provider_not_supported"
  | "auth_failure"
  | "data_quality";

export type OnboardingPath = "self_serve" | "assisted";

export interface OnboardingV2 {
  stage: OnboardingStage;
  path: OnboardingPath;
  blockers: OnboardingBlocker[];
  firstValueAt: string | null;
  activationAt: string | null;
  lastEventAt: string;
}

export type PmsProvider = "writeupp" | "cliniko" | "tm3" | "jane" | "powerdiary" | "pabau" | "halaxy" | "pps";
export type HepProvider = "physitrack" | "rehab_my_patient" | "wibbi";
export type ClinicStatus = "onboarding" | "live" | "paused" | "churned";

// ─── Compliance ──────────────────────────────────────────────────────────────

export type Jurisdiction = "uk" | "us" | "au" | "ca";

export interface ComplianceConfig {
  jurisdiction: Jurisdiction;
  consentModel: "gdpr_lawful_basis" | "hipaa_notice" | "pipeda_express" | "app_explicit";
  mfaRequired: boolean;
  baaRequired: boolean;
  baaSignedAt: string | null;
  dataRegion: string;
  privacyPolicyVersion: string | null;
  consentRecordedAt: string | null;
  dpaAcceptedAt?: string | null;
  commsConsentAt?: string | null;
}

export interface AuditLogEntry {
  userId: string;
  userEmail: string;
  action: "read" | "write" | "update" | "delete" | "export" | "login" | "config_change";
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  timestamp: string;
}

export interface SarRequest {
  id: string;
  type: "access" | "correction" | "deletion";
  status: "pending" | "in_progress" | "completed" | "rejected";
  requestedBy: string;
  patientId?: string;
  description: string;
  responseDeadline: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicProfile {
  id: string;
  name: string;
  timezone: string;
  ownerEmail: string;
  address?: string;
  phone?: string;
  receptionPhone?: string;
  sessionPricePence?: number;
  parkingInfo?: string;
  website?: string;
  status: ClinicStatus;
  pmsType: PmsProvider | null;
  /** Client-visible last PMS sync time (API key stored server-side only in integrations_config). */
  pmsLastSyncAt?: string | null;
  /**
   * "sample" when the clinic was populated via a seed script (patients /
   * appointments / metrics are synthetic or from a stale CSV export).
   * "live" once real PMS data has replaced the seed.
   *
   * Absent = legacy (assume "live"). New seed scripts MUST set "sample".
   */
  dataMode?: "sample" | "live";
  /** ISO timestamp — set by scripts/purge-spires-seed-data.ts. */
  lastSeedPurgeAt?: string | null;
  hepType?: HepProvider | null;
  /** Client-visible HEP connection status (API key stored server-side only in integrations_config). */
  hepConnectedAt?: string | null;
  /**
   * Email addresses allowed to post inbound CSV imports for this clinic
   * (via /api/pms/import-csv/inbound). Lowercased match against the bare
   * email address extracted from the Mailgun `from` field. When undefined or
   * empty, the route falls back to legacy behaviour (allow-all + warning).
   */
  allowedInboundSenders?: string[];
  featureFlags: FeatureFlags;
  targets: ClinicTargets;
  brandConfig: BrandConfig;
  npsConfig?: NpsConfig;
  onboarding: OnboardingState;
  onboardingV2?: OnboardingV2;
  billing?: BillingState;
  compliance?: ComplianceConfig;
  trialStartedAt: string | null;
  trialModule?: string | null;
  trialTier?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Clinician ───────────────────────────────────────────────────────────────

export interface Clinician {
  id: string;
  name: string;
  role: string;
  email?: string;
  authRole?: "clinician" | "admin";
  status?: "invited" | "active";
  authUid?: string;
  pmsExternalId?: string;
  physitrackId?: string;
  active: boolean;
  avatar?: string;
  /** Clinician can opt out of the weekly digest email. Default false. */
  digestOptOut?: boolean;
  /**
   * Heidi Health opt-in (per-clinician).
   * When true the clinician's sessions are included in the Heidi sync pipeline.
   * Requires heidiEmail to be set — Heidi JWTs are issued per-user via email.
   */
  heidiEnabled?: boolean;
  /** Heidi account email for this clinician. Required when heidiEnabled is true. */
  heidiEmail?: string | null;
  createdAt?: string;
  createdBy?: string;
}

// ─── Patient ─────────────────────────────────────────────────────────────────

export type PreAuthStatus = "pending" | "confirmed" | "rejected" | "not_required";

export interface PreAuth {
  id: string;
  patientId: string;
  insurerName: string;
  preAuthCode: string;
  sessionsAuthorised: number;
  sessionsUsed: number;
  expiryDate?: string;
  excessAmountPence?: number;
  excessCollected?: boolean;
  status: PreAuthStatus;
  confirmedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientContact {
  email?: string;
  phone?: string;
}

export interface ReferralSource {
  type: string;
  name: string;
  externalId?: string;
}

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

export interface Patient {
  id: string;
  name: string;
  dob?: string;
  contact: PatientContact;
  clinicianId: string;
  insuranceFlag: boolean;
  insurerName?: string;
  preAuthStatus: PreAuthStatus;
  pmsExternalId?: string;
  physitrackPatientId?: string;
  heidiPatientId?: string;
  referralSource?: ReferralSource;
  lastSessionDate?: string;
  nextSessionDate?: string;
  sessionCount: number;
  treatmentLength: number;
  discharged: boolean;
  churnRisk: boolean;
  hepProgramId?: string;
  createdAt: string;
  updatedAt: string;
  // Retention engine fields (additive — churnRisk/discharged unchanged)
  lifecycleState?: LifecycleState;
  riskScore?: number;               // 0–100 weighted composite
  riskFactors?: RiskFactors;
  sessionThresholdAlert?: boolean;  // true when lifecycleState = 'ONBOARDING'
  lifecycleUpdatedAt?: string;      // ISO string
  // Heidi enrichment (additive — populated when Heidi integration is enabled)
  complexitySignals?: ComplexitySignals;
  complexityUpdatedAt?: string;
}

// ─── Appointment ─────────────────────────────────────────────────────────────

export type AppointmentStatus = "scheduled" | "completed" | "dna" | "cancelled" | "late_cancel";
export type AppointmentType = "initial_assessment" | "follow_up" | "review" | "discharge";
export type AppointmentSource = "pms_sync" | "strydeos_receptionist" | "manual";

export interface Appointment {
  id: string;
  patientId: string;
  clinicianId: string;
  dateTime: string;
  endTime: string;
  status: AppointmentStatus;
  appointmentType: AppointmentType;
  isInitialAssessment: boolean;
  hepAssigned: boolean;
  hepProgramId?: string;
  conditionTag?: string; // populated by PMS sync (e.g. "Low Back Pain")
  revenueAmountPence: number;
  followUpBooked: boolean;
  source: AppointmentSource;
  pmsExternalId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Outcome Measures ────────────────────────────────────────────────────────

export type OutcomeMeasureType =
  | "nprs"
  | "psfs"
  | "quickdash"
  | "odi"
  | "ndi"
  | "oxford_knee"
  | "oxford_hip"
  | "koos"
  | "hoos"
  | "visa_a"
  | "visa_p";

export interface OutcomeScore {
  id: string;
  patientId: string;
  clinicianId: string;
  appointmentId?: string;
  measureType: OutcomeMeasureType;
  score: number;
  subscores?: Record<string, number>;
  recordedAt: string;
  recordedBy: string;
}

// ─── Weekly Metrics ──────────────────────────────────────────────────────────

export interface WeeklyStats {
  id: string;
  clinicianId: string;
  clinicianName: string;
  weekStart: string;
  followUpRate: number;
  followUpTarget: number;
  hepComplianceRate: number;
  hepRate: number;
  hepTarget: number;
  utilisationRate: number;
  dnaRate: number;
  treatmentCompletionRate: number;
  revenuePerSessionPence: number;
  appointmentsTotal: number;
  initialAssessments: number;
  followUps: number;
  npsScore?: number;
  reviewCount?: number;
  avgRating?: number;
  reviewVelocity?: number;
  dnaByDayOfWeek?: Record<string, number>;
  dnaByTimeSlot?: Record<string, number>;
  computedAt?: string;
  statisticallyRepresentative?: boolean;
  caveatNote?: string;
  /** Revenue breakdown by appointment type (IA, follow-up, review, discharge) in pence */
  revenueByAppointmentType?: Record<string, number>;
  /** Revenue from insured patients in pence */
  insuranceRevenuePence?: number;
  /** Revenue from self-pay patients in pence */
  selfPayRevenuePence?: number;
}

// ─── Comms ───────────────────────────────────────────────────────────────────

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

export type NpsCategory = "promoter" | "passive" | "detractor";

// ─── Reviews ─────────────────────────────────────────────────────────────────

export type ReviewPlatform = "google" | "trustpilot" | "nps_sms";

export interface Review {
  id: string;
  platform: ReviewPlatform;
  rating: number;
  reviewText?: string;
  date: string;
  /** Treating clinician resolved from patient record (NPS SMS). */
  clinicianId?: string;
  /** Clinician name-matched from review text (Google/Trustpilot). */
  clinicianMentioned?: string;
  patientId?: string;
  verified: boolean;
}

// ─── Call Log (Receptionist) ─────────────────────────────────────────────────

export type CallOutcome = "booked" | "cancelled" | "missed" | "info" | "transferred";

export interface CallLog {
  id: string;
  timestamp: string;
  duration: number;
  outcome: CallOutcome;
  clinicianId?: string;
  patientId?: string;
  callerPhone?: string;
  recordingUrl?: string;
  voiceCallId?: string;
}

// ─── UI Component Types ──────────────────────────────────────────────────────

export type AlertSeverity = "warn" | "danger";
export type MetricStatus = "ok" | "warn" | "danger" | "neutral";
export type TrendDirection = "up" | "down" | "flat" | "warn";

export interface StatCardAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  target?: number;
  benchmark?: string;
  trend?: TrendDirection;
  trendPercent?: number;
  status: MetricStatus;
  insight?: string;
  color?: string;
  progress?: number;
  onClick?: () => void;
  action?: StatCardAction;
  sparklineData?: number[];
}

export interface AlertFlagProps {
  metric: string;
  current: number;
  target: number;
  severity: AlertSeverity;
}

export interface TrendLine {
  key: string;
  color: string;
  label: string;
}

// ─── Heidi Integration ────────────────────────────────────────────────────────

export type EnrichmentSource = "heidi";

export type TreatmentComplexity = "low" | "moderate" | "high";
export type DischargeLikelihood = "low" | "moderate" | "high";

export interface ComplexitySignals {
  painScore?: number;                      // 0–10 (NPRS/VAS)
  treatmentComplexity: TreatmentComplexity;
  dischargeLikelihood: DischargeLikelihood;
  multipleRegions: boolean;
  chronicIndicators: boolean;
  psychosocialFlags: boolean;
}

export interface ClinicalCode {
  code: string;
  system: "ICD-10" | "ICD-10-CM" | "SNOMED" | "SNOMED-CT" | "CPT-2025" | "OPCS-410" | "ACHI-13";
  description: string;
  relevanceScore: number;
}

export interface ClinicalNote {
  id: string;
  patientId: string;
  clinicianId?: string;
  source: EnrichmentSource;
  heidiSessionId: string;
  receivedAt: string;
  sessionDate: string;
  noteContent: string;
  noteContentType: "MARKDOWN" | "HTML";
  clinicalCodes: ClinicalCode[];
  complexitySignals: ComplexitySignals;
  raw: Record<string, unknown>;
}

/** Stored at clinics/{clinicId}/integrations_config/heidi */
export interface HeidiIntegrationConfig {
  enabled: boolean;
  apiKey: string;
  region: "uk" | "au" | "us" | "eu";
  configuredAt: string;
  lastSyncAt: string | null;
  status: "connected" | "disconnected" | "error";
  /** Mapping of StrydeOS clinicianId → Heidi user email for JWT generation. */
  clinicianEmailMap?: Record<string, string>;
}

// ─── Heidi API response shapes ──────────────────────────────────────────────

export interface HeidiJwtResponse {
  token: string;
  expiration_time: string;
}

export interface HeidiSession {
  id: string;
  status: "EMPTY" | "DRAFT" | "REVIEWED" | "APPROVED" | "SENT";
  patient_profile_id?: string;
  created_at: string;
  updated_at: string;
}

export interface HeidiDocument {
  id: string;
  session_id: string;
  name: string;
  template_id?: string;
  content_type: "MARKDOWN" | "HTML";
  content: string;
  voice_style: "BRIEF" | "GOLDILOCKS" | "DETAILED" | "MY_VOICE" | "SUPER_DETAILED";
  generation_type?: string;
}

export interface HeidiClinicalCode {
  primary_code: {
    code: string;
    code_system: string;
    display: string;
  };
  similar_codes?: Array<{
    code: string;
    code_system: string;
    display: string;
    confidence: number;
  }>;
  relevance_score: number;
  location_in_note?: string;
}

export interface HeidiPatientProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  dob?: string;
  gender?: "male" | "female" | "other" | "unknown";
  ehr_provider?: string;
  ehr_patient_id?: string;
}

export interface HeidiAskResponse {
  answer: string;
}
