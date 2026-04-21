/**
 * Operator-facing audit trail for the Intelligence pipeline.
 *
 * Writes to `clinics/{clinicId}/computeState` (singleton document).
 * Consumed by the dashboard for the "last synced / health" bar and by operators
 * debugging pipeline issues.
 *
 * Addresses INTELLIGENCE_AUDIT.md issue 1 (no syncState).
 */

import type { Firestore } from "firebase-admin/firestore";
import type {
  ComputeStateDoc,
  DataQualityIssue,
  KpiId,
  SchedulerHealth,
} from "@/types/kpi";

const COMPUTE_STATE_PATH = (clinicId: string) => `clinics/${clinicId}/computeState/current`;

export interface ComputeStateUpdate {
  status: SchedulerHealth;
  completedAt?: string;
  lastError?: string | null;
  dataQualityIssues?: DataQualityIssue[];
  lastComputedKpis?: KpiId[];
  durationMs?: number;
  source?: ComputeStateDoc["lastRunSource"];
}

/**
 * Write the pipeline's compute state to Firestore with `merge: true` so partial
 * updates don't clobber fields written by earlier stages.
 */
export async function writeComputeState(
  db: Firestore,
  clinicId: string,
  update: ComputeStateUpdate
): Promise<void> {
  const patch: Partial<ComputeStateDoc> = {
    schedulerHealth: update.status,
  };
  if (update.completedAt) {
    patch.lastFullRecomputeAt = update.completedAt;
  }
  if (update.lastError !== undefined) {
    patch.lastError = update.lastError;
  }
  if (update.dataQualityIssues !== undefined) {
    patch.dataQualityIssues = update.dataQualityIssues;
  }
  if (update.lastComputedKpis !== undefined) {
    patch.lastComputedKpis = update.lastComputedKpis;
  }
  if (update.durationMs !== undefined) {
    patch.lastRunDurationMs = update.durationMs;
  }
  if (update.source !== undefined) {
    patch.lastRunSource = update.source;
  }
  await db.doc(COMPUTE_STATE_PATH(clinicId)).set(patch, { merge: true });
}

/**
 * Append data-quality issues to the existing array, preserving any issues
 * written by earlier stages in the same run. Deduplicates by `code + kpiId`.
 */
export async function appendDataQualityIssues(
  db: Firestore,
  clinicId: string,
  issues: DataQualityIssue[]
): Promise<void> {
  if (issues.length === 0) return;
  const ref = db.doc(COMPUTE_STATE_PATH(clinicId));
  const snap = await ref.get();
  const existing = (snap.data()?.dataQualityIssues as DataQualityIssue[] | undefined) ?? [];
  const seen = new Set(existing.map((i) => `${i.code}|${i.kpiId ?? ""}`));
  const merged = [...existing];
  for (const issue of issues) {
    const key = `${issue.code}|${issue.kpiId ?? ""}`;
    if (!seen.has(key)) {
      merged.push(issue);
      seen.add(key);
    }
  }
  await ref.set({ dataQualityIssues: merged }, { merge: true });
}
