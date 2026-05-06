import type { ComplianceConfig } from "./compliance";

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
  bookingUrl?: string | null;
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
