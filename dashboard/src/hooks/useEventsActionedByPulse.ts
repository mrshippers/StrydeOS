"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  subscribeEventsActionedByPulse,
  type PulseActionedEvent,
} from "@/lib/queries";
import { sumPulseRevenue, type PulseRevenueLabel } from "@/lib/intelligence/sum-pulse-revenue";

const REBOOK_TYPES = new Set([
  "PATIENT_DROPOUT_RISK",
  "AVA_CALLBACK_REQUESTED",
]);
const RETENTION_TYPES = new Set([
  "NPS_DETRACTOR_ALERT",
  "REVENUE_LEAK_DETECTED",
  "FOLLOWUP_REVENUE_DROP",
]);

export interface UseEventsActionedByPulseResult {
  /** Total count of Pulse-actioned events in the last 7 days. */
  count: number;
  /** Recovered revenue in whole pounds (0 when label is "count-only"). */
  recoveredPounds: number;
  /**
   * "measured"  - all events had a real revenueImpact
   * "estimated" - at least one event used the clinic session price as fallback
   * "count-only"- no real values and no clinic session price configured
   */
  revenueLabel: PulseRevenueLabel;
  /** Daily counts, 7-element array oldest to newest for the sparkline. */
  dailyCounts: number[];
  /** Breakdown of actions by type group. */
  breakdown: { rebooks: number; retention: number; others: number };
  /** Most-recent action, if any - for the "Last action: ..." tail. */
  latest: PulseActionedEvent | null;
  loading: boolean;
}

export function useEventsActionedByPulse(): UseEventsActionedByPulseResult {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";

  // Clinic-configured session price in pounds, used as fallback when an event
  // has no revenueImpact. Null when not configured -- tile shows count only.
  const avgSessionPounds =
    user?.clinicProfile?.sessionPricePence != null &&
    user.clinicProfile.sessionPricePence > 0
      ? Math.round(user.clinicProfile.sessionPricePence / 100)
      : null;

  const [events, setEvents] = useState<PulseActionedEvent[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isDemo || !clinicId) {
      setEvents([]);
      setReady(true);
      return;
    }

    setReady(false);
    const unsub = subscribeEventsActionedByPulse(
      clinicId,
      (next) => {
        setEvents(next);
        setReady(true);
      },
      () => {
        setEvents([]);
        setReady(true);
      }
    );

    return () => unsub();
  }, [clinicId, isDemo]);

  return useMemo(() => {
    const count = events.length;

    const { pounds: recoveredPounds, label: revenueLabel } = sumPulseRevenue(
      events,
      avgSessionPounds
    );

    // Daily counts: 7 buckets oldest to newest, today is last.
    const dailyCounts = new Array<number>(7).fill(0);
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    for (const e of events) {
      const t = new Date(e.createdAt).getTime();
      if (!Number.isFinite(t)) continue;
      const daysAgo = Math.floor((todayMidnight.getTime() - t) / 86_400_000);
      const idx = 6 - daysAgo;
      if (idx >= 0 && idx < 7) dailyCounts[idx]++;
    }

    let rebooks = 0;
    let retention = 0;
    let others = 0;
    for (const e of events) {
      if (REBOOK_TYPES.has(e.type)) rebooks++;
      else if (RETENTION_TYPES.has(e.type)) retention++;
      else others++;
    }

    const latest = events[0] ?? null;

    return {
      count,
      recoveredPounds,
      revenueLabel,
      dailyCounts,
      breakdown: { rebooks, retention, others },
      latest,
      loading: !ready,
    };
  }, [events, ready, avgSessionPounds]);
}
