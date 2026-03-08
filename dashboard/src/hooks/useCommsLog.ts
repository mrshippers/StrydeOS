"use client";

import { useState, useEffect } from "react";
import { subscribeCommsLog } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import type { CommsLogEntry } from "@/types";
import type { CommsStats } from "@/types/comms";
import { getDemoCommsLog, getDemoCommsStats } from "@/hooks/useDemoComms";

export interface UseCommsLogResult {
  commsLog:   CommsLogEntry[];
  commsStats: CommsStats;
  loading:    boolean;
  isDemo:     boolean;
  error:      string | null;
}

export function useCommsLog(): UseCommsLogResult {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";

  const [commsLog, setCommsLog] = useState<CommsLogEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (isDemo) {
      setCommsLog([]);
      setLoading(false);
      return () => {};
    }

    const unsub = subscribeCommsLog(
      clinicId,
      (data) => {
        setCommsLog(data);
        setLoading(false);
      },
      (err) => {
        console.error("[useCommsLog]", err);
        setError("Failed to load comms log.");
        setLoading(false);
      }
    );
    return unsub;
  }, [clinicId, isDemo]);

  if (isDemo) {
    return {
      commsLog:   getDemoCommsLog(),
      commsStats: getDemoCommsStats(),
      loading,
      isDemo:     true,
      error:      null,
    };
  }

  return {
    commsLog,
    commsStats: deriveStats(commsLog),
    loading,
    isDemo:     false,
    error,
  };
}

function deriveStats(log: CommsLogEntry[]): CommsStats {
  const total = log.length;
  if (total === 0) return { totalSent: 0, openRate: 0, clickRate: 0, conversionToRebook: 0 };

  const opened   = log.filter((e) => e.openedAt).length;
  const clicked  = log.filter((e) => e.clickedAt).length;
  const rebooked = log.filter((e) => e.outcome === "booked").length;

  return {
    totalSent:            total,
    openRate:             opened   / total,
    clickRate:            clicked  / total,
    conversionToRebook:   rebooked / total,
  };
}
