"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  subscribeEventsActionedByPulse,
  type PulseActionedEvent,
} from "@/lib/queries";

/** Fallback £ recovered per action when an event has no `revenueImpact` set. */
const FALLBACK_RECOVERY_PER_EVENT = 65;

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
  /** Recovered revenue in £ (whole pounds, rounded). */
  recoveredPounds: number;
  /** Daily counts, 7-element array oldest→newest for the sparkline. */
  dailyCounts: number[];
  /** Breakdown of actions by type group. */
  breakdown: { rebooks: number; retention: number; others: number };
  /** Most-recent action, if any — for the "Last action: …" tail. */
  latest: PulseActionedEvent | null;
  loading: boolean;
}

export function useEventsActionedByPulse(): UseEventsActionedByPulseResult {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";

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

    const recoveredPounds = Math.round(
      events.reduce(
        (sum, e) =>
          sum + (e.revenueImpact > 0 ? e.revenueImpact : FALLBACK_RECOVERY_PER_EVENT),
        0
      )
    );

    // Daily counts: 7 buckets oldest→newest, today is last.
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
      dailyCounts,
      breakdown: { rebooks, retention, others },
      latest,
      loading: !ready,
    };
  }, [events, ready]);
}
