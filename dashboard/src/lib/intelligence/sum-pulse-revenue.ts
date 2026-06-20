/**
 * Pure revenue-summing helper for the Pulse Impact tile (P0-3).
 *
 * Replaces the prior count * 65 hardcoded calculation. Sums real per-event
 * revenueImpact values, falls back to the clinic's configured session price
 * when an event has no real value, and returns an honest label so the tile
 * can display "measured" vs "estimated" to the owner.
 */

export type PulseRevenueLabel = "measured" | "estimated" | "count-only";

export interface PulseRevenueSummary {
  /** Total recovered revenue in whole pounds, rounded. */
  pounds: number;
  /**
   * "measured"  - all events had a real revenueImpact
   * "estimated" - at least one event fell back to the clinic session price
   * "count-only"- no real values and no clinic session price; never show
   *               a fabricated currency figure
   */
  label: PulseRevenueLabel;
}

/**
 * Sum recovered revenue across Pulse-actioned events.
 *
 * @param events          Array of events; only `revenueImpact` is read.
 * @param avgSessionPounds Clinic-configured average session value in pounds
 *                         (from `sessionPricePence / 100`). Pass `null` or `0`
 *                         when not available -- result will be "count-only".
 */
export function sumPulseRevenue(
  events: ReadonlyArray<{ revenueImpact: number }>,
  avgSessionPounds: number | null
): PulseRevenueSummary {
  if (events.length === 0) {
    return { pounds: 0, label: "measured" };
  }

  let usedFallback = false;
  let noFallbackAvailable = false;
  let total = 0;

  for (const e of events) {
    if (e.revenueImpact > 0) {
      total += e.revenueImpact;
    } else if (avgSessionPounds != null && avgSessionPounds > 0) {
      total += avgSessionPounds;
      usedFallback = true;
    } else {
      // No real value, no fallback -- cannot show a currency figure.
      noFallbackAvailable = true;
    }
  }

  // "count-only" only when there is NO real revenue basis at all (total is 0
  // because no event had revenueImpact AND no avgSessionPounds fallback).
  if (total === 0 && noFallbackAvailable) {
    return { pounds: 0, label: "count-only" };
  }

  // If any event was skipped (no real value, no fallback), the figure is partial
  // -- treat the same as having used a fallback: label as "estimated".
  const label: PulseRevenueLabel =
    usedFallback || noFallbackAvailable ? "estimated" : "measured";
  return { pounds: Math.round(total), label };
}
