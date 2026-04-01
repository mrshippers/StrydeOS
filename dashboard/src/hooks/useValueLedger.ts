"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "./useAuth";
import {
  subscribeValueEvents,
  subscribeValueSummary,
  subscribeDeepMetrics,
} from "@/lib/queries";
import type {
  ValueEvent,
  ValueSummary,
  DeepMetrics,
  ValueModule,
} from "@/types/value-ledger";

// ─── Return Shape ────────────────────────────────────────────────────────────

export interface ValueLedgerData {
  // Current month summary
  summary: ValueSummary | null;

  // Recent value events (last 100)
  events: ValueEvent[];

  // Deep metrics (latest week, clinic-wide or per-clinician)
  deepMetrics: DeepMetrics | null;
  deepMetricsTrend: DeepMetrics[]; // Last 16 weeks for sparklines

  // Derived convenience values
  totalValueThisMonth: number;     // Pence
  roiMultiple: number;             // e.g. 3.2 = 3.2× subscription cost
  netValueThisMonth: number;       // Pence (total - subscription)
  moduleBreakdown: {
    module: ValueModule;
    label: string;
    totalPence: number;
    eventCount: number;
    color: string;
  }[];

  // Top attribution events (for the feed)
  topEvents: ValueEvent[];         // Sorted by valuePence desc, limit 10

  loading: boolean;
  error: string | null;
}

// ─── Module display config ───────────────────────────────────────────────────

const MODULE_CONFIG: Record<ValueModule, { label: string; color: string }> = {
  ava: { label: "Ava", color: "#1C54F2" },
  pulse: { label: "Pulse", color: "#0891B2" },
  intelligence: { label: "Intelligence", color: "#8B5CF6" },
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useValueLedger(selectedClinician: string): ValueLedgerData {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;

  const [events, setEvents] = useState<ValueEvent[]>([]);
  const [summary, setSummary] = useState<ValueSummary | null>(null);
  const [deepMetricsAll, setDeepMetricsAll] = useState<DeepMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Current month period key
  const periodKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  // Subscribe to value events
  useEffect(() => {
    const unsub = subscribeValueEvents(
      clinicId,
      setEvents,
      (err) => setError(err.message)
    );
    return unsub;
  }, [clinicId]);

  // Subscribe to current month summary
  useEffect(() => {
    const unsub = subscribeValueSummary(
      clinicId,
      periodKey,
      (data) => {
        setSummary(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsub;
  }, [clinicId, periodKey]);

  // Subscribe to deep metrics
  useEffect(() => {
    const clinicianId = selectedClinician || "all";
    const unsub = subscribeDeepMetrics(
      clinicId,
      clinicianId,
      setDeepMetricsAll,
      (err) => setError(err.message)
    );
    return unsub;
  }, [clinicId, selectedClinician]);

  // Derive values
  const derived = useMemo(() => {
    const totalValueThisMonth = summary?.totalValuePence ?? 0;
    const roiMultiple = summary?.roiMultiple ?? 0;
    const netValueThisMonth = summary?.netValuePence ?? 0;

    const moduleBreakdown: ValueLedgerData["moduleBreakdown"] = (
      ["ava", "pulse", "intelligence"] as ValueModule[]
    ).map((module) => {
      const moduleSummary = summary?.[module];
      return {
        module,
        label: MODULE_CONFIG[module].label,
        totalPence: moduleSummary?.totalValuePence ?? 0,
        eventCount: moduleSummary?.eventCount ?? 0,
        color: MODULE_CONFIG[module].color,
      };
    });

    // Top events by value
    const topEvents = [...events]
      .sort((a, b) => b.valuePence - a.valuePence)
      .slice(0, 10);

    // Latest deep metrics + trend
    const deepMetrics = deepMetricsAll.length > 0 ? deepMetricsAll[0] : null;
    const deepMetricsTrend = [...deepMetricsAll].sort(
      (a, b) => a.weekStart.localeCompare(b.weekStart)
    );

    return {
      totalValueThisMonth,
      roiMultiple,
      netValueThisMonth,
      moduleBreakdown,
      topEvents,
      deepMetrics,
      deepMetricsTrend,
    };
  }, [summary, events, deepMetricsAll]);

  return {
    summary,
    events,
    deepMetrics: derived.deepMetrics,
    deepMetricsTrend: derived.deepMetricsTrend,
    totalValueThisMonth: derived.totalValueThisMonth,
    roiMultiple: derived.roiMultiple,
    netValueThisMonth: derived.netValueThisMonth,
    moduleBreakdown: derived.moduleBreakdown,
    topEvents: derived.topEvents,
    loading,
    error,
  };
}
