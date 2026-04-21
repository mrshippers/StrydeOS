/**
 * KPI projection types — read-optimised view over `metrics_weekly` + `reviews`.
 *
 * Written by `computeKPIs()` in `src/lib/intelligence/compute-kpis.ts`.
 * Consumed by `useKpis()` on the client (read-only).
 *
 * The `kpis/*` collection is a LAYER on top of `metrics_weekly` — not a replacement.
 * `metrics_weekly` remains the canonical source for weekly numbers.
 */

/** Locked list of KPI IDs — document IDs under `clinics/{clinicId}/kpis/*`. */
export type KpiId =
  | "follow-up-rate"
  | "hep-compliance"
  | "utilisation"
  | "dna-rate"
  | "revenue-per-session"
  | "nps"
  | "google-review-conversion";

export const KPI_IDS: readonly KpiId[] = [
  "follow-up-rate",
  "hep-compliance",
  "utilisation",
  "dna-rate",
  "revenue-per-session",
  "nps",
  "google-review-conversion",
] as const;

export type KpiStatus = "ok" | "warn" | "danger";

export interface KpiThresholds {
  /** Value at-or-better than this is `ok`. */
  ok: number;
  /** Value at-or-better than this (but worse than `ok`) is `warn`. Below this is `danger`. */
  warn: number;
}

export interface KpiWindow {
  type: "weekly";
  weekStart: string; // YYYY-MM-DD
}

export interface KpiDoc {
  kpiId: KpiId;
  /** Current observed value. Units depend on KPI (ratio, pence, %, etc.). */
  value: number;
  /** Clinic's configured target value. */
  target: number;
  /** Tri-state RAG evaluation at `computedAt`. */
  status: KpiStatus;
  /** Last 7 prior weekly values, most-recent-first. Excludes the current value. */
  trend: number[];
  /** The weekly window this projection covers. */
  window: KpiWindow;
  /** Numeric thresholds used to evaluate `status`. */
  threshold: KpiThresholds;
  /** True if higher values are better for this metric. */
  higherIsBetter: boolean;
  /** ISO timestamp — when the projection was written. */
  computedAt: string;
  /** The `metrics_weekly` doc ID this was projected from. */
  sourceDocId?: string;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export type KpiEventType = "KPI_THRESHOLD_CROSSED";

export interface KpiEvent {
  type: KpiEventType;
  kpiId: KpiId;
  clinicianId?: string;
  severity: "danger" | "warning" | "positive";
  value: number;
  target: number;
  weekStart: string;
  createdAt: string;
  /** Downstream consumers push their ID here to prevent double-processing. */
  consumedBy: string[];
}

// ─── Compute State ───────────────────────────────────────────────────────────

export type SchedulerHealth = "ok" | "degraded" | "failed";

export type DataQualityIssueCode =
  | "SESSION_RATE_MISSING"
  | "NO_METRICS"
  | "KPI_MISSING"
  | "NARRATIVE_SKIPPED";

export interface DataQualityIssue {
  code: DataQualityIssueCode;
  message: string;
  kpiId?: KpiId;
  context?: Record<string, unknown>;
}

export interface ComputeStateDoc {
  /** ISO timestamp of last successful end-to-end pipeline (compute-kpis completion). */
  lastFullRecomputeAt: string | null;
  /** Overall health of the projection layer on the most recent run. */
  schedulerHealth: SchedulerHealth;
  /** Last captured error message from any pipeline stage. */
  lastError: string | null;
  /** Non-fatal data-quality problems flagged during the last run. */
  dataQualityIssues: DataQualityIssue[];
  /** KPI IDs that were successfully written on the last run. */
  lastComputedKpis: KpiId[];
  /** Duration of the most recent compute-kpis stage in milliseconds. */
  lastRunDurationMs: number;
  /** Who triggered the last run. */
  lastRunSource: "pipeline" | "manual" | "cron";
}

/** KPI IDs that come from per-clinic targets rather than hardcoded defaults. */
export const TARGET_KEYS: Partial<Record<KpiId, keyof import("./index").ClinicTargets>> = {
  "follow-up-rate": "followUpRate",
  "hep-compliance": "hepRate",
  utilisation: "utilisationRate",
  "dna-rate": "dnaRate",
};
