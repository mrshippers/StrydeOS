// ─── Insight Event Types ─────────────────────────────────────────────────────
// Shared contract between Intelligence (writes) and Pulse (reads).
// Single source of truth — imported by both modules.

// ── Event Types ───────────────────────────────────────────

export type InsightEventType =
  // Owner-facing (Intelligence displays, owner acts)
  | "CLINICIAN_FOLLOWUP_DROP"   // Follow-up rate dropped >10% week-on-week
  | "HIGH_DNA_STREAK"           // 3+ DNAs in rolling 14 days for a clinician
  | "HEP_COMPLIANCE_LOW"        // Clinic-wide HEP compliance below 50%
  | "UTILISATION_BELOW_TARGET"  // Clinician utilisation <75% for 2+ consecutive weeks
  | "REVENUE_LEAK_DETECTED"     // Calculated £ lost from mid-programme dropouts
  | "COURSE_COMPLETION_WIN"     // Positive: clinician hit >90% completion

  // Patient-actionable (Intelligence detects, Pulse acts)
  | "PATIENT_DROPOUT_RISK"      // Mid-programme patient, no rebooking >X days
  | "NPS_DETRACTOR_ALERT"       // NPS response ≤6 — needs human follow-up + possible Pulse nudge

  // Revenue intelligence — PBB: "You can't fix what you don't measure"
  | "FOLLOWUP_REVENUE_DROP"     // Follow-up revenue dropped >20% week-on-week (patients not returning)

  // Clinical outcomes (opt-in — requires featureFlags.outcomeTracking)
  | "OUTCOME_IMPROVEMENT"       // Patient crossed MCID threshold — clinically meaningful improvement

  // System health
  | "DATA_STALENESS_ALERT";     // No CSV import received in 7+ days (CSV-bridge clinics)

// ── Which module acts on which event ──────────────────────

export const OWNER_EVENTS: InsightEventType[] = [
  "CLINICIAN_FOLLOWUP_DROP",
  "HIGH_DNA_STREAK",
  "HEP_COMPLIANCE_LOW",
  "UTILISATION_BELOW_TARGET",
  "REVENUE_LEAK_DETECTED",
  "COURSE_COMPLETION_WIN",
  "DATA_STALENESS_ALERT",
];

export const PATIENT_ACTION_EVENTS: InsightEventType[] = [
  "PATIENT_DROPOUT_RISK",
  "NPS_DETRACTOR_ALERT",
];

// ── Pulse sequence mapping ────────────────────────────────

export const EVENT_TO_SEQUENCE: Partial<Record<InsightEventType, string>> = {
  PATIENT_DROPOUT_RISK: "rebooking_prompt",
  NPS_DETRACTOR_ALERT: "discharge_review",
};

// ── Event severity ────────────────────────────────────────

export type InsightSeverity = "critical" | "warning" | "positive";

// ── Event Shape ───────────────────────────────────────────

export interface InsightEvent {
  id: string;
  type: InsightEventType;
  clinicId: string;
  clinicianId?: string;
  clinicianName?: string;
  patientId?: string;
  patientName?: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  revenueImpact?: number;            // Estimated £ (conservative, rounded DOWN)
  suggestedAction: string;
  actionTarget: "owner" | "patient";
  createdAt: string;                  // ISO string (Firestore Timestamp on server)
  readAt?: string | null;
  dismissedAt?: string | null;
  pulseActionId?: string | null;
  resolvedAt?: string | null;
  resolution?: string | null;
  lastNotifiedAt?: string | null;     // Deduplication: don't re-notify within 7 days
  ownerNarrative?: string | null;     // LLM-generated business-framed narrative for owners
  clinicianNarrative?: string | null; // LLM-generated clinically-framed narrative for clinicians
  narrativeGeneratedAt?: string | null;

  // ─── Observational patterns (Tier 1 — facts, not causal claims) ───
  /** Factual observation from clinician's own data, e.g. "Your Thursday DNA rate is 18% vs 4% Tuesday" */
  observationalNote?: string | null;
  /** Number of data points backing the observation */
  sampleSize?: number | null;
  /** Lookback window for the observation, e.g. "Last 90 days" */
  timeframe?: string | null;

  metadata: Record<string, unknown>;
}

// ── Threshold Config (per-clinic) ─────────────────────────

export interface InsightConfig {
  dropoutRiskDays: number;            // default: 7
  followUpDropThreshold: number;      // default: 0.10 (10% week-on-week drop)
  dnaStreakThreshold: number;         // default: 3
  hepComplianceFloor: number;        // default: 0.50
  utilisationFloor: number;          // default: 0.75
  courseCompletionCelebrate: number;  // default: 0.90
  revenuePerSession: number;         // default: 65 (£) — clinic configurable
  maxProgrammeLength: number;        // default: 6 (cap for revenue calc)
  enabled: boolean;                  // default: true
}

// ── Insight Engine Milestone (first-run unlock) ───────────

export interface InsightEngineMilestone {
  unlockedAt: string;
  triggeringEventId: string;
  triggeringEventType: InsightEventType;
  patientsNudged: number;
  patientsRebooked: number;
  revenueRecovered: number;         // £ value of rebooked sessions (conservative)
  revenueAtRisk: number;            // £ value originally flagged by Intelligence
  clinicianName?: string | null;
  displayedAt?: string | null;      // Set when owner sees the popup
  dismissedAt?: string | null;      // Set when owner closes it
}

export const DEFAULT_INSIGHT_CONFIG: InsightConfig = {
  dropoutRiskDays: 7,
  followUpDropThreshold: 0.10,
  dnaStreakThreshold: 3,
  hepComplianceFloor: 0.50,
  utilisationFloor: 0.75,
  courseCompletionCelebrate: 0.90,
  revenuePerSession: 65,
  maxProgrammeLength: 6,
  enabled: true,
};
