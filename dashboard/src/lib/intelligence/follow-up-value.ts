/**
 * Follow-up booking value computation (P0-9).
 *
 * Canonical unit contract:
 *   - followUpRate (WeeklyStats.followUpRate) = sessions / unique patients = a RATIO
 *   - followUps   (WeeklyStats.followUps)     = count of follow-up appointments booked
 *
 * ROI attribution must use the count of additional follow-ups booked, NOT a ratio delta.
 * Multiplying a ratio delta by patient volume as if it were a probability is dimensionally
 * wrong and inflates revenue projections.
 *
 * Correct formula:
 *   returningPatients = avg(recent weeks: followUps) - avg(baseline weeks: followUps)
 *   weeklyValuePence  = returningPatients * sessionRatePence
 */

// ─── Branded type ─────────────────────────────────────────────────────────────
//
// FollowUpBookingCount is an opaque integer count of follow-up appointments.
// It cannot be accidentally substituted with a ratio (sessions-per-patient).
// All callers must pass through toFollowUpBookingCount() which rounds and
// makes the unit explicit.

declare const __followUpBookingCountBrand: unique symbol;
export type FollowUpBookingCount = number & { readonly [__followUpBookingCountBrand]: true };

/**
 * Convert a raw number (e.g. a float average delta) into a FollowUpBookingCount.
 * Rounds to the nearest integer so ratio deltas (e.g. 0.5 sessions-per-patient)
 * cannot silently flow in as a valid patient count.
 */
export function toFollowUpBookingCount(n: number): FollowUpBookingCount {
  return Math.round(n) as FollowUpBookingCount;
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Compute the attributable weekly value of a follow-up booking improvement.
 *
 * @param returningPatients - Additional follow-ups booked per week (a COUNT, not a ratio).
 *   Must be a FollowUpBookingCount to prevent ratio-values from flowing in.
 * @param sessionRatePence  - Clinic session price in pence. Pass `null` when missing;
 *   the function returns `null` (skip) rather than fabricating a rate.
 * @returns Weekly revenue gain in pence, or null if the computation should be skipped.
 */
export function computeFollowUpValuePence(
  returningPatients: FollowUpBookingCount,
  sessionRatePence: number | null
): number | null {
  if (sessionRatePence === null) return null;
  if (returningPatients <= 0) return null;
  return returningPatients * sessionRatePence;
}
