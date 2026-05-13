import type { Patient, LifecycleState } from "@/types/patient";

export interface CohortSummary {
  cohort: LifecycleState;
  count: number;
  avgRiskScore: number;
}

/**
 * Groups a flat patient list by lifecycleState and computes per-cohort metrics.
 *
 * Pure function — no Firestore, no async, no side effects.
 *
 * @param patients - Array of patients, may contain any mix of lifecycle states.
 * @returns One CohortSummary per distinct lifecycleState present in the data,
 *          sorted by count descending. Cohorts with zero patients are omitted.
 *          A patient without riskScore is counted as 0 for the average.
 */
export function buildCohortSummary(patients: Patient[]): CohortSummary[] {
  const buckets = new Map<LifecycleState, { total: number; scoreSum: number }>();

  for (const patient of patients) {
    const state = patient.lifecycleState;
    if (!state) continue;

    const score = patient.riskScore ?? 0;
    const existing = buckets.get(state);
    if (existing) {
      existing.total += 1;
      existing.scoreSum += score;
    } else {
      buckets.set(state, { total: 1, scoreSum: score });
    }
  }

  const summaries: CohortSummary[] = [];

  for (const [cohort, { total, scoreSum }] of buckets) {
    summaries.push({
      cohort,
      count: total,
      avgRiskScore: total > 0 ? scoreSum / total : 0,
    });
  }

  summaries.sort((a, b) => b.count - a.count);

  return summaries;
}
