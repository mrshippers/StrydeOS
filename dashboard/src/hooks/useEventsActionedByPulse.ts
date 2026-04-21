"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { subscribeEventsActionedByPulse } from "@/lib/queries";

export interface UseEventsActionedByPulseResult {
  /** Count of Intelligence events consumed by Pulse in the last 7 days. */
  count: number;
  loading: boolean;
}

/**
 * Subscribe to `/clinics/{clinicId}/events` filtered to events Pulse has
 * actioned (`consumedBy` contains `'pulse'`) in the last 7 days. Read-only —
 * powers the cross-module "Events actioned by Pulse (7d)" tile on the
 * Intelligence dashboard.
 *
 * Mirrors the pattern of `useKpis()`: demo user / missing clinicId → silent
 * zero state, not an error. No mutation paths.
 */
export function useEventsActionedByPulse(): UseEventsActionedByPulseResult {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";

  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isDemo || !clinicId) {
      setCount(0);
      setReady(true);
      return;
    }

    setReady(false);

    const unsub = subscribeEventsActionedByPulse(
      clinicId,
      (events) => {
        setCount(events.length);
        setReady(true);
      },
      () => {
        // Silent — don't surface Firestore errors on a read-only ancillary tile.
        setCount(0);
        setReady(true);
      }
    );

    return () => unsub();
  }, [clinicId, isDemo]);

  return { count, loading: !ready };
}
