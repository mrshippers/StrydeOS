"use client";

import { useEffect, useState, useMemo } from "react";
import { subscribeAppointments } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import { brand } from "@/lib/brand";
import type { InsurancePathway } from "@/types";

export interface PayerSlice {
  pathway: InsurancePathway;
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface PayerBreakdownData {
  slices: PayerSlice[];
  total: number;
  loading: boolean;
  error: string | null;
}

const PATHWAY_META: Record<InsurancePathway, { label: string; color: string }> = {
  bupa:      { label: "Bupa",      color: brand.teal },
  axa:       { label: "AXA",       color: brand.blue },
  vitality:  { label: "Vitality",  color: brand.blueGlow },
  aviva:     { label: "Aviva",     color: brand.purple },
  "self-pay":{ label: "Self-pay",  color: brand.purpleGlow },
  nhs:       { label: "NHS",       color: brand.mutedStrong },
  unknown:   { label: "Unknown",   color: brand.border },
};

export function usePayerBreakdown(clinicianId: string = "all"): PayerBreakdownData {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;

  const [appointments, setAppointments] = useState<{ insuranceRoute?: { pathway: InsurancePathway } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const effectiveClinician = clinicianId === "all" ? null : clinicianId;

    const unsub = subscribeAppointments(
      clinicId,
      effectiveClinician,
      ninetyDaysAgo,
      (data) => {
        setAppointments(data.filter((a) => a.insuranceRoute?.pathway));
        setLoading(false);
      },
      (err) => {
        setError("Failed to load payer data.");
        setLoading(false);
      }
    );

    return unsub;
  }, [clinicId, clinicianId]);

  const result = useMemo<PayerBreakdownData>(() => {
    if (loading) return { slices: [], total: 0, loading: true, error: null };
    if (error) return { slices: [], total: 0, loading: false, error };

    const counts = new Map<InsurancePathway, number>();
    for (const appt of appointments) {
      const p = appt.insuranceRoute?.pathway;
      if (!p) continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }

    const total = Array.from(counts.values()).reduce((s, n) => s + n, 0);
    if (total === 0) return { slices: [], total: 0, loading: false, error: null };

    const slices: PayerSlice[] = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([pathway, count]) => {
        const meta = PATHWAY_META[pathway] ?? { label: pathway, color: brand.border };
        return {
          pathway,
          label: meta.label,
          count,
          pct: Math.round((count / total) * 100),
          color: meta.color,
        };
      });

    return { slices, total, loading: false, error: null };
  }, [appointments, loading, error]);

  return result;
}
