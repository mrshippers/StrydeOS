/**
 * Barrel re-export for the types module.
 *
 * Public API for all domain types. Existing consumers import from `@/types`
 * and pick what they need. Internal modules (ava/pulse/intelligence/comms)
 * may import directly from a specific file (`@/types/patient`) if they want
 * to make their dependency surface explicit, but it is not required.
 *
 * To add a new type: put it in the appropriate domain file (or create one),
 * then add a re-export line below.
 */

export type { UserRole, UserStatus, UserDocument, AuthUser } from "./auth";

export type {
  FeatureFlags,
  StripeSubscriptionStatus,
  BillingTier,
  BillingState,
  ClinicTargets,
  BrandConfig,
  NpsConfig,
  OnboardingState,
  OnboardingStage,
  OnboardingBlocker,
  OnboardingPath,
  OnboardingV2,
  PmsProvider,
  HepProvider,
  ClinicStatus,
  ClinicProfile,
} from "./clinic";

export type {
  Jurisdiction,
  ComplianceConfig,
  AuditLogEntry,
  SarRequest,
} from "./compliance";

export type { Clinician } from "./clinician";

export type {
  PreAuthStatus,
  PreAuth,
  PatientContact,
  ReferralSource,
  LifecycleState,
  RiskFactors,
  Patient,
} from "./patient";

export type {
  AppointmentStatus,
  AppointmentType,
  AppointmentSource,
  Appointment,
} from "./appointment";

export type { OutcomeMeasureType, OutcomeScore } from "./outcomes";

export type { WeeklyStats } from "./metrics";

export type {
  CommsChannel,
  CommsOutcome,
  SequenceType,
  NpsCategory,
  CommsLogEntry,
} from "./comms-base";

export type { ReviewPlatform, Review } from "./reviews";

export type { CallOutcome, CallLog } from "./call-log";

export type {
  AlertSeverity,
  MetricStatus,
  TrendDirection,
  StatCardAction,
  StatCardProps,
  AlertFlagProps,
  TrendLine,
} from "./ui";

export type {
  EnrichmentSource,
  TreatmentComplexity,
  DischargeLikelihood,
  ComplexitySignals,
  ClinicalCode,
  ClinicalNote,
  HeidiIntegrationConfig,
  HeidiJwtResponse,
  HeidiSession,
  HeidiDocument,
  HeidiClinicalCode,
  HeidiPatientProfile,
  HeidiAskResponse,
} from "./heidi";
