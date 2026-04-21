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
export const BACKFILL_WEEKS = 26; // ~6 months — PBB: "You cannot navigate using data that is 12 months old"
export const INCREMENTAL_WEEKS = 4; // ~28 days
