import type { InsightEvent, InsightSeverity } from "@/types/insight-events";

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  positive: 2,
};

/**
 * Rank insight events by: severity → revenueImpact → recency.
 * Returns a new sorted array (does not mutate input).
 */
export function rankEvents(events: InsightEvent[]): InsightEvent[] {
  return [...events].sort((a, b) => {
    // 1. severity: critical > warning > positive
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;

    // 2. revenueImpact: highest £ first (undefined treated as 0)
    const revA = a.revenueImpact ?? 0;
    const revB = b.revenueImpact ?? 0;
    if (revA !== revB) return revB - revA;

    // 3. createdAt: newest first (tiebreaker)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
