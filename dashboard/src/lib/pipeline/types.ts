import type { AppointmentType } from "@/types";

export interface PipelineConfig {
  lastFullRunAt?: string;
  lastFullRunStatus?: "success" | "error";
  backfillCompleted?: boolean;
  backfillCompletedAt?: string;
  appointmentTypeMap?: Record<string, AppointmentType>;
  defaultTreatmentLength?: number;
}

export interface StageResult {
  stage: string;
  ok: boolean;
  count: number;
  errors: string[];
  durationMs: number;
  /**
   * Optional stage-specific snapshot. Populated by the trigger-comms stage
   * with the pulseState summary (runId, queuedCount, failedCount, lastError).
   * Other stages leave this unset.
   */
  pulseState?: unknown | null;
}

export interface PipelineResult {
  clinicId: string;
  ok: boolean;
  startedAt: string;
  completedAt: string;
  stages: StageResult[];
}

export const DEFAULT_APPOINTMENT_TYPE_MAP: Record<string, AppointmentType> = {
  "Initial Assessment": "initial_assessment",
  "Initial Consultation": "initial_assessment",
  "New Patient": "initial_assessment",
  "Follow Up": "follow_up",
  "Follow-Up": "follow_up",
  "Subsequent": "follow_up",
  "Treatment": "follow_up",
  "Review": "review",
  "Progress Review": "review",
  "Discharge": "discharge",
  "Final Session": "discharge",
};

export const INTEGRATIONS_CONFIG = "integrations_config";
export const PMS_DOC_ID = "pms";
export const HEP_DOC_ID = "hep";
export const PIPELINE_DOC_ID = "pipeline";
export const REVIEWS_DOC_ID = "google_reviews";

export const DEFAULT_TREATMENT_LENGTH = 6;
export const BACKFILL_WEEKS = 26; // ~6 months — manual repair backfill default
export const INCREMENTAL_WEEKS = 4; // ~28 days
// First-ever sync for a self-onboarding clinic pulls a DEEP window so each
// patient's sessionCount reflects their true visit history, not a truncated
// slice. A shallow first sync is what made the follow-up rate read 0.27 instead
// of ~3.4 — sessionCount needs real history even though the dashboard only
// *navigates* recent data. 52 weeks matches the 12-month navigational horizon
// and was validated against Spires' full Cliniko history.
export const ONBOARDING_BACKFILL_WEEKS = 52; // ~12 months — first-sync only
// Cliniko request pacing DURING a backfill (gentler than steady state so a large
// patient import does not 429 — see setClinikoPacing). The full first-sync import
// can be thousands of getPatient calls; ~100 req/min leaves headroom under the
// account limit for live Ava/insurance traffic, and extra retries ride out
// collisions. One-time onboarding cost; incremental syncs keep the fast default.
export const BACKFILL_CLINIKO_MIN_INTERVAL_MS = 600; // ~100 req/min
export const BACKFILL_CLINIKO_MAX_RETRIES = 8;
