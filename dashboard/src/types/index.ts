// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "admin" | "clinician" | "superadmin";

export interface AuthUser {
  uid: string;
  email: string;
  clinicId: string;
  clinicianId?: string;
  role: UserRole;
  clinicProfile: ClinicProfile | null;
}

// ─── Clinic ──────────────────────────────────────────────────────────────────

export interface FeatureFlags {
  intelligence: boolean;
  continuity: boolean;
  receptionist: boolean;
}

export interface ClinicTargets {
  followUpRate: number;
  physitrackRate: number;
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

export type PmsProvider = "writeupp" | "cliniko" | "tm3" | "jane" | "powerdiary" | "pabau" | "halaxy";
export type ClinicStatus = "onboarding" | "live" | "paused" | "churned";

export interface ClinicProfile {
  id: string;
  name: string;
  timezone: string;
  ownerEmail: string;
  status: ClinicStatus;
  pmsType: PmsProvider | null;
  /** Client-visible last PMS sync time (API key stored server-side only in integrations_config). */
  pmsLastSyncAt?: string | null;
  featureFlags: FeatureFlags;
  targets: ClinicTargets;
  brandConfig: BrandConfig;
  onboarding: OnboardingState;
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
  physitrackRate: number;
  physitrackTarget: number;
  utilisationRate: number;
  dnaRate: number;
  courseCompletionRate: number;
  revenuePerSessionPence: number;
  appointmentsTotal: number;
  initialAssessments: number;
  followUps: number;
  npsScore?: number;
  reviewCount?: number;
  reviewVelocity?: number;
  dnaByDayOfWeek?: Record<string, number>;
  dnaByTimeSlot?: Record<string, number>;
  computedAt?: string;
}

// ─── Comms ───────────────────────────────────────────────────────────────────

export type CommsChannel = "email" | "sms" | "whatsapp";
export type CommsOutcome = "booked" | "no_action" | "unsubscribed";
export type SequenceType =
  | "hep_reminder"
  | "rebooking_prompt"
  | "pre_auth_collection"
  | "review_prompt"
  | "reactivation_90d"
  | "reactivation_180d";

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
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export type ReviewPlatform = "google" | "trustpilot";

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
  retellCallId?: string;
}

// ─── UI Component Types ──────────────────────────────────────────────────────

export type AlertSeverity = "warn" | "danger";
export type MetricStatus = "ok" | "warn" | "danger" | "neutral";
export type TrendDirection = "up" | "down" | "flat" | "warn";

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  target?: number;
  benchmark?: string;
  trend?: TrendDirection;
  status: MetricStatus;
  insight?: string;
  color?: string;
  onClick?: () => void;
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
