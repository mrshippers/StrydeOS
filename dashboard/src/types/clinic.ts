import type { ComplianceConfig } from "./compliance";

export interface FeatureFlags {
  intelligence: boolean;
  continuity: boolean;
  receptionist: boolean;
  /** Opt-in: enable outcome measures recording + correlation in Intelligence. */
  outcomeTracking?: boolean;
  /** Opt-in: auto-send the insurance intake form to patients before their appointment (Pulse). Default false. */
  insuranceIntake?: boolean;

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
  /**
   * P0-2: Show the Benchmark Comparison card on the Intelligence page.
   * Default FALSE - card uses static peer baselines with no real multi-clinic
   * aggregation behind them. Opt-in only once live peer data exists.
   */
  peerBenchmarkCard?: boolean;
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
  /**
   * Clinic's target revenue per session in pence.
   * When unset, compute-kpis falls back to the labelled reference target
   * (UK PPB 2026 median, 6800p / £68). The fallback is always surfaced as
   * "reference target", never presented as the clinic's own benchmark.
   */
  revenuePerSessionPence?: number;
  /**
   * Clinic's target NPS score (0-100 scale).
   * When unset, falls back to the labelled reference target.
   */
  npsTarget?: number;
  /**
   * Clinic's target Google review conversion rate (reviews per appointment, 0-1).
   * When unset, falls back to the labelled reference target.
   */
  reviewConversionTarget?: number;
  /**
   * Clinic's target average star rating (1-5 scale).
   * When unset, falls back to the labelled reference target.
   */
  averageStarRatingTarget?: number;
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
  /**
   * White-label outbound comms overrides. When unset, patient-facing texts/emails
   * derive their sender from `name` (see lib/comms/clinic-branding.ts).
   */
  smsSenderId?: string;
  emailFromName?: string;
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
  /**
   * Optional per-clinician scope for the insurance-intake auto-send. When set to
   * one or more PMS practitioner ids, the daily `/api/insurance/poll-and-send`
   * cron only messages THOSE clinicians' patients (used to pilot the flow on a
   * single clinician before clinic-wide rollout). Empty/undefined = every
   * clinician, the historic behaviour. Gated first by `featureFlags.insuranceIntake`.
   */
  insuranceIntakePractitionerIds?: string[];
  featureFlags: FeatureFlags;
  targets: ClinicTargets;
  brandConfig: BrandConfig;
  npsConfig?: NpsConfig;
  onboarding: OnboardingState;
  onboardingV2?: OnboardingV2;
  billing?: BillingState;
  compliance?: ComplianceConfig;
  /**
   * Account-closure / full-erasure markers. Set when a clinic is terminated
   * (e.g. contract ends, GDPR Art. 17 controller-level erasure request). Mirror
   * the per-patient `markedForDeletion` pattern:
   *   - terminationRequestedAt = when termination was requested
   *   - terminationScheduledAt = terminationRequestedAt + 30-day grace period
   * Once `terminationScheduledAt` elapses, the weekly data-health cron erases
   * ALL clinic data (every subcollection + clinic-scoped top-level docs + Auth
   * users) and writes a retained, PII-free tombstone to `_erasure_log`.
   * Absence of these fields means the clinic is never a candidate for erasure.
   */
  terminationRequestedAt?: string | null;
  terminationScheduledAt?: string | null;
  terminationReason?: string | null;
  terminatedBy?: string | null;
  trialStartedAt: string | null;
  trialModule?: string | null;
  trialTier?: string | null;
  createdAt: string;
  updatedAt: string;
}
