"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { subscribeKPIs, subscribeComputeState } from "@/lib/queries";
import type { KpiDoc, ComputeStateDoc } from "@/types/kpi";

export interface UseKpisResult {
  /** Map of KPI ID → projected KPI doc. Empty on first render / when pipeline has not run. */
  kpis: Record<string, KpiDoc>;
  /** Pipeline compute state — exposes health, last error, data-quality issues. */
  computeState: ComputeStateDoc | null;
  loading: boolean;
  error: string | null;
}

/**
 * Subscribe to the `kpis/*` projection + `computeState` document for the
 * current user's clinic. Read-only — no mutation paths.
 *
 * When `kpis` is empty (first run before pipeline ran, or demo user with no
 * clinicId), callers should render the existing dashboard behaviour rather
 * than an empty-state — see `KpiProjectionStrip` for the pattern.
 */
export function useKpis(): UseKpisResult {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";

  const [kpis, setKpis] = useState<Record<string, KpiDoc>>({});
  const [computeState, setComputeState] = useState<ComputeStateDoc | null>(null);
  const [kpisReady, setKpisReady] = useState(false);
  const [stateReady, setStateReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo || !clinicId) {
      setKpis({});
      setComputeState(null);
      setKpisReady(true);
      setStateReady(true);
      return;
    }

    setError(null);

    const unsubKpis = subscribeKPIs(
      clinicId,
      (data) => {
        setKpis(data);
        setKpisReady(true);
      },
      (err) => {
        setError(err.message);
        setKpisReady(true);
      }
    );

    const unsubState = subscribeComputeState(
      clinicId,
      (data) => {
        setComputeState(data);
        setStateReady(true);
      },
      (err) => {
        setError(err.message);
        setStateReady(true);
      }
    );

    return () => {
      unsubKpis();
      unsubState();
    };
  }, [clinicId, isDemo]);

  return {
    kpis,
    computeState,
    loading: !kpisReady || !stateReady,
    error,
  };
}
