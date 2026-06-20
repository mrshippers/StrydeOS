/**
 * Hard limits for POST /api/pipeline/backfill (P0-15).
 *
 * Defined here (not in route.ts) because Next.js route files may only export
 * HTTP handler names and specific Next.js fields - not arbitrary constants.
 */

/** Maximum clinics processed in parallel in the all-clinics branch. */
export const BACKFILL_CONCURRENCY = 3;

/**
 * Hard ceiling on the total number of pipeline runs (LLM + write calls)
 * per single backfill invocation, regardless of how many clinics are live.
 * Prevents runaway cost from unexpected tenant growth between deployments.
 */
export const BACKFILL_MAX_CLINICS = 50;
