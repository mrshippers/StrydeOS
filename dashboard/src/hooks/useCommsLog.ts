"use client";

import { useState, useEffect } from "react";
import { subscribeCommsLog } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import type { CommsLogEntry, SequenceType } from "@/types";
import type { CommsStats } from "@/types/comms";
import { getDemoCommsLog, getDemoCommsStats } from "@/hooks/useDemoComms";

export interface UseCommsLogResult {
  commsLog:                    CommsLogEntry[];
  commsStats:                  CommsStats;
  statsBySequence:             Record<string, { sent: number; opened: number; clicked: number; rebooked: number; attributedRevenuePence: number }>;
  totalAttributedRevenuePence: number;
  attributedThisMonthPence:    number;
  loading:                     boolean;
  isDemo:                      boolean;
  error:                       string | null;
}

export function useCommsLog(): UseCommsLogResult {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";

  // Clinicians only see comms for their own patients — no cross-contamination.
  const scopedClinicianId =
    user?.role === "clinician" ? (user.clinicianId ?? null) : null;

  const [commsLog, setCommsLog] = useState<CommsLogEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Demo mode — set demo data via state so the render return is always
    // derived from a single source (commsLog state). Previously the render
    // body branched on isDemo and returned getDemoCommsLog() directly while
    // the effect set state to [], which created a fragile dual path.
    if (isDemo) {
      setCommsLog(getDemoCommsLog());
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
      },
      scopedClinicianId
    );
    return unsub;
  }, [clinicId, isDemo, scopedClinicianId]);

  // Stats: demo mode uses the hardcoded demo stats (stable numbers for the
  // sales demo); live mode computes from the current commsLog state.
  const commsStats = isDemo ? getDemoCommsStats() : deriveStats(commsLog);

  return {
    commsLog,
    commsStats,
    ...deriveSequenceStats(commsLog),
    loading,
    isDemo,
    error: isDemo ? null : error,
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

function deriveSequenceStats(log: CommsLogEntry[]): {
  statsBySequence:             Record<string, { sent: number; opened: number; clicked: number; rebooked: number; attributedRevenuePence: number }>;
  totalAttributedRevenuePence: number;
  attributedThisMonthPence:    number;
} {
  const statsBySequence: Record<string, { sent: number; opened: number; clicked: number; rebooked: number; attributedRevenuePence: number }> = {};

  const now = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth();
  let totalAttributedRevenuePence = 0;
  let attributedThisMonthPence    = 0;

  for (const entry of log) {
    const key = entry.sequenceType as SequenceType;
    if (!statsBySequence[key]) {
      statsBySequence[key] = { sent: 0, opened: 0, clicked: 0, rebooked: 0, attributedRevenuePence: 0 };
    }
    const group = statsBySequence[key];
    group.sent   += 1;
    if (entry.openedAt)            group.opened  += 1;
    if (entry.clickedAt)           group.clicked += 1;
    if (entry.outcome === "booked") group.rebooked += 1;

    const revenue = entry.attributedRevenuePence ?? 0;
    group.attributedRevenuePence += revenue;
    totalAttributedRevenuePence  += revenue;

    if (revenue > 0) {
      const sentDate = new Date(entry.sentAt);
      if (sentDate.getFullYear() === thisYear && sentDate.getMonth() === thisMonth) {
        attributedThisMonthPence += revenue;
      }
    }
  }

  return { statsBySequence, totalAttributedRevenuePence, attributedThisMonthPence };
}
