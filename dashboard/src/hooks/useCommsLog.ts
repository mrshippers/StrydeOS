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
}

export function useCommsLog(): UseCommsLogResult {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;

  const [commsLog, setCommsLog] = useState<CommsLogEntry[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeCommsLog(
      clinicId,
      (data) => {
        setCommsLog(data);
        setLoading(false);
      },
      (err) => {
        console.error("[useCommsLog]", err);
        setLoading(false);
      }
    );
    return unsub;
  }, [clinicId]);

  const hasRealData = !loading && commsLog.length > 0;

  // Fall back to demo data until real comms exist
  const resolvedLog   = hasRealData ? commsLog   : getDemoCommsLog();
  const resolvedStats = hasRealData ? deriveStats(commsLog) : getDemoCommsStats();

  return {
    commsLog:   resolvedLog,
    commsStats: resolvedStats,
    loading,
    isDemo:     !hasRealData,
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
