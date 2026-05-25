"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { WeeklyStats } from "@/types";

export interface WeeklyTrendData {
  weeks: WeeklyStats[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches the last `weeksBack` clinic-level weekly stats from
 * `clinics/{clinicId}/metrics_weekly`, ordered oldest-first so
 * sparklines read left (past) → right (present).
 *
 * Note: metrics_weekly docs are per-clinician. This hook aggregates
 * across all clinicians by taking a simple mean per week bucket,
 * giving a clinic-level view suitable for trend strips.
 */
export function useWeeklyTrend(weeksBack = 12): WeeklyTrendData {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";

  const [weeks, setWeeks] = useState<WeeklyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) {
      setWeeks(buildDemoWeeks(weeksBack));
      setLoading(false);
      return;
    }

    if (!db || !clinicId) {
      setWeeks([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetch() {
      try {
        const col = collection(db!, "clinics", clinicId!, "metrics_weekly");
        // Pull more docs than needed so we can aggregate across clinicians.
        // weeksBack * 6 clinicians is a safe upper bound for most practices.
        const q = query(col, orderBy("weekStart", "desc"), limit(weeksBack * 8));
        const snap = await getDocs(q);

        if (cancelled) return;

        if (snap.empty) {
          setWeeks([]);
          setLoading(false);
          return;
        }

        // Group docs by weekStart, average numeric KPIs across clinicians.
        const byWeek: Record<string, WeeklyStats[]> = {};
        snap.docs.forEach((d) => {
          const s = { id: d.id, ...d.data() } as WeeklyStats;
          if (!byWeek[s.weekStart]) byWeek[s.weekStart] = [];
          byWeek[s.weekStart].push(s);
        });

        const aggregated: WeeklyStats[] = Object.entries(byWeek)
          .sort(([a], [b]) => a.localeCompare(b)) // oldest first
          .slice(-weeksBack)
          .map(([weekStart, rows]) => {
            const mean = <K extends keyof WeeklyStats>(key: K): number => {
              const vals = rows
                .map((r) => r[key] as number)
                .filter((v) => typeof v === "number" && !isNaN(v));
              if (vals.length === 0) return 0;
              return vals.reduce((s, v) => s + v, 0) / vals.length;
            };
            return {
              id: weekStart,
              clinicianId: "clinic",
              clinicianName: "Clinic",
              weekStart,
              followUpRate: mean("followUpRate"),
              followUpTarget: mean("followUpTarget"),
              hepComplianceRate: mean("hepComplianceRate"),
              hepRate: mean("hepRate"),
              hepTarget: mean("hepTarget"),
              utilisationRate: mean("utilisationRate"),
              dnaRate: mean("dnaRate"),
              treatmentCompletionRate: mean("treatmentCompletionRate"),
              revenuePerSessionPence: mean("revenuePerSessionPence"),
              appointmentsTotal: rows.reduce((s, r) => s + (r.appointmentsTotal ?? 0), 0),
              initialAssessments: rows.reduce((s, r) => s + (r.initialAssessments ?? 0), 0),
              followUps: rows.reduce((s, r) => s + (r.followUps ?? 0), 0),
            } satisfies WeeklyStats;
          });

        setWeeks(aggregated);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          console.error("[useWeeklyTrend]", e);
          setError("Failed to load weekly trend data.");
          setLoading(false);
        }
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [clinicId, isDemo, weeksBack]);

  return { weeks, loading, error };
}

// ─── Demo data ────────────────────────────────────────────────────────────────

function buildDemoWeeks(n: number): WeeklyStats[] {
  // Steady-improvement arc over n weeks — realistic UK private practice numbers.
  const now = new Date();
  const weeks: WeeklyStats[] = [];

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const weekStart = d.toISOString().slice(0, 10);
    const t = (n - 1 - i) / (n - 1); // 0 = oldest, 1 = newest
    const jitter = () => (Math.random() - 0.5) * 0.04;

    weeks.push({
      id: weekStart,
      clinicianId: "clinic",
      clinicianName: "Clinic",
      weekStart,
      followUpRate: parseFloat((lerp(2.8, 3.6, t) + jitter()).toFixed(2)),
      followUpTarget: 3.5,
      hepComplianceRate: parseFloat((lerp(0.72, 0.87, t) + jitter()).toFixed(3)),
      hepRate: parseFloat((lerp(0.72, 0.87, t) + jitter()).toFixed(3)),
      hepTarget: 0.85,
      utilisationRate: parseFloat((lerp(0.68, 0.79, t) + jitter()).toFixed(3)),
      dnaRate: parseFloat((lerp(0.11, 0.06, t) + jitter() * 0.5).toFixed(3)),
      treatmentCompletionRate: parseFloat((lerp(0.70, 0.80, t) + jitter()).toFixed(3)),
      revenuePerSessionPence: Math.round(lerp(5800, 6500, t)),
      appointmentsTotal: Math.round(lerp(48, 62, t)),
      initialAssessments: Math.round(lerp(8, 12, t)),
      followUps: Math.round(lerp(38, 50, t)),
    });
  }

  return weeks;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
