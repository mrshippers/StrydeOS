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
}

// ─── Clinic ──────────────────────────────────────────────────────────────────

export interface FeatureFlags {
  intelligence: boolean;
  continuity: boolean;
  receptionist: boolean;
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
  courseCompletionTarget: number;
}

export interface BrandConfig {
  logo?: string;
  primaryColor?: string;
  clinicUrl?: string;
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

export type PmsProvider = "writeupp" | "cliniko" | "tm3" | "jane" | "powerdiary" | "pabau" | "halaxy";
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
}

export interface AuditLogEntry {
  userId: string;
  userEmail: string;
  action: "read" | "write" | "delete" | "export" | "login" | "config_change";
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
  sessionPricePence?: number;
  parkingInfo?: string;
  website?: string;
  status: ClinicStatus;
  pmsType: PmsProvider | null;
  /** Client-visible last PMS sync time (API key stored server-side only in integrations_config). */
  pmsLastSyncAt?: string | null;
  hepType?: HepProvider | null;
  /** Client-visible HEP connection status (API key stored server-side only in integrations_config). */
  hepConnectedAt?: string | null;
  featureFlags: FeatureFlags;
  targets: ClinicTargets;
  brandConfig: BrandConfig;
  onboarding: OnboardingState;
  onboardingV2?: OnboardingV2;
  billing?: BillingState;
  compliance?: ComplianceConfig;
  trialStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Clinician ───────────────────────────────────────────────────────────────

export interface Clinician {
  id: string;
  name: string;
  role: string;
  pmsExternalId?: string;
  physitrackId?: string;
  active: boolean;
  avatar?: string;
  createdAt?: string;
  createdBy?: string;
}

// ─── Patient ─────────────────────────────────────────────────────────────────

export type PreAuthStatus = "pending" | "confirmed" | "rejected" | "not_required";

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
  courseLength: number;
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
  courseCompletionRate: number;
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
}

// ─── Comms ───────────────────────────────────────────────────────────────────

export type CommsChannel = "email" | "sms" | "whatsapp";
export type CommsOutcome = "booked" | "no_action" | "unsubscribed" | "responded";
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
  sequenceType: SequenceType;
  channel: CommsChannel;
  sentAt: string;
  openedAt?: string;
  clickedAt?: string;
  outcome: CommsOutcome;
  n8nExecutionId?: string;
  // Step tracking (multi-touch cadence)
  stepNumber?: number;                           // which step in the 6-touch cadence (1–6)
  attributionWindowDays?: number;                // from sequence_definition at send time
  patientLifecycleStateAtSend?: LifecycleState;  // patient state when this message was sent
  // Attribution
  attributedRevenuePence?: number;               // populated when outcome = 'booked'
  attributedAppointmentId?: string;
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
