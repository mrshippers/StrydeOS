/**
 * Pure aggregation helper for the Intelligence "Revenue by Condition" chart.
 *
 * Extracted from `useIntelligenceData` so it can be unit-tested without
 * pulling the React hook (and its JSX-containing `useAuth` dependency)
 * through the vitest import graph.
 */

import type { Appointment } from "@/types";
import type { RevenueByCondition } from "@/hooks/useDemoIntelligence";

/**
 * Aggregate completed-appointment revenue grouped by `conditionTag`.
 *
 * Rules:
 * - Only `status === "completed"` appointments count (DNA / cancelled /
 *   scheduled never contribute revenue).
 * - Appointments missing a `conditionTag` (or with a whitespace-only tag)
 *   are skipped — they would otherwise collapse into a meaningless bucket.
 * - Appointments with `revenueAmountPence <= 0` are skipped.
 * - Results are sorted by `totalRevenuePence` descending so the chart's
 *   max-scaling logic (which reads `result[0].totalRevenuePence`) works
 *   without the caller re-sorting.
 */
export function deriveRevenueByCondition(appointments: Appointment[]): RevenueByCondition[] {
  const map = new Map<string, { totalRevenuePence: number; sessions: number }>();

  for (const appt of appointments) {
    const tag = appt.conditionTag?.trim();
    if (!tag) continue;
    if (appt.status !== "completed") continue;
    const revenue = appt.revenueAmountPence ?? 0;
    if (revenue <= 0) continue;

    const existing = map.get(tag);
    if (existing) {
      existing.totalRevenuePence += revenue;
      existing.sessions += 1;
    } else {
      map.set(tag, { totalRevenuePence: revenue, sessions: 1 });
    }
  }

  return Array.from(map.entries())
    .map(([condition, { totalRevenuePence, sessions }]) => ({
      condition,
      totalRevenuePence,
      sessions,
      avgSessionsPence: sessions > 0 ? Math.round(totalRevenuePence / sessions) : 0,
    }))
    .sort((a, b) => b.totalRevenuePence - a.totalRevenuePence);
}
