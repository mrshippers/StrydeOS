"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useClinicians } from "@/hooks/useClinicians";
import { getDemoLatestWeekStats } from "@/hooks/useDemoData";
import type { WeeklyStats, Clinician } from "@/types";

export interface ClinicianSummaryRow {
  clinicianId: string;
  clinicianName: string;
  stats: WeeklyStats;
  /** False when the clinician has no metrics_weekly row yet (awaiting first sync).
   *  Their `stats` are zero-filled so consumers can render "—" rather than a
   *  misleading 0%, and the dashboard utilisation tile can filter them out.
   *  Undefined (e.g. demo rows) is treated as "has data". */
  hasData?: boolean;
}

/** Zero-filled stats for a clinician with no computed week yet, so every active
 *  clinician can still be listed with their proper name. */
function emptyStats(clinicianId: string, clinicianName: string): WeeklyStats {
  return {
    id: `empty_${clinicianId}`,
    clinicianId,
    clinicianName,
    weekStart: "",
    followUpRate: 0,
    followUpTarget: 0,
    hepComplianceRate: 0,
    hepRate: 0,
    hepTarget: 0,
    utilisationRate: 0,
    dnaRate: 0,
    treatmentCompletionRate: 0,
    revenuePerSessionPence: 0,
    appointmentsTotal: 0,
    initialAssessments: 0,
    followUps: 0,
  };
}

/**
 * Returns the latest weekly stats for each active clinician.
 * Falls back to demo data only when in explicit demo mode.
 */
export function useClinicianSummaryStats(): {
  rows: ClinicianSummaryRow[];
  usedDemo: boolean;
  loading: boolean;
  error: string | null;
} {
  const { user } = useAuth();
  const { clinicians, loading: cliniciansLoading } = useClinicians();
  const [rows, setRows] = useState<ClinicianSummaryRow[]>([]);
  const [usedDemo, setUsedDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";

  useEffect(() => {
    if (cliniciansLoading) return;

    if (isDemo) {
      setRows(getDemoLatestWeekStats());
      setUsedDemo(true);
      setLoading(false);
      return;
    }

    if (!db || !clinicId || clinicians.length === 0) {
      setRows([]);
      setUsedDemo(false);
      setLoading(false);
      if (!db) setError("Database not configured. Add Firebase credentials in Settings.");
      return;
    }

    const activeClinicians = clinicians.filter((c: Clinician) => c.active);
    if (activeClinicians.length === 0) {
      setRows([]);
      setUsedDemo(false);
      setLoading(false);
      return;
    }

    // Subscribe to latest week stats for each active clinician
    const latestByClinicianId: Record<string, WeeklyStats> = {};
    let resolvedCount = 0;
    const unsubs: Array<() => void> = [];

    function tryFlush() {
      resolvedCount++;
      if (resolvedCount < activeClinicians.length) return;

      // Every active clinician is listed with their canonical full name from the
      // clinicians collection (synced from the PMS), not the name snapshotted into
      // metrics_weekly. Clinicians without a computed week yet still appear, with
      // zero-filled stats + hasData=false so the UI shows "—" rather than dropping
      // them — "show every clinician's full name".
      const built: ClinicianSummaryRow[] = activeClinicians.map((c: Clinician) => {
        const stats = latestByClinicianId[c.id];
        const clinicianName = c.name || stats?.clinicianName || c.id;
        return {
          clinicianId: c.id,
          clinicianName,
          stats: stats ?? emptyStats(c.id, clinicianName),
          hasData: !!stats,
        };
      });

      setRows(built);
      setUsedDemo(false);
      setLoading(false);
    }

    for (const clinician of activeClinicians) {
      const q = query(
        collection(db!, "clinics", clinicId, "metrics_weekly"),
        where("clinicianId", "==", clinician.id),
        orderBy("weekStart", "desc"),
        limit(1)
      );

      const unsub = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            const doc = snap.docs[0];
            latestByClinicianId[clinician.id] = { id: doc.id, ...doc.data() } as WeeklyStats;
          }
          tryFlush();
        },
        (err) => {
          console.error("[useClinicianSummaryStats]", err);
          setError("Failed to load clinician stats.");
          tryFlush();
        }
      );

      unsubs.push(unsub);
    }

    return () => unsubs.forEach((u) => u());
  }, [clinicId, clinicians, cliniciansLoading, isDemo]);

  return { rows, usedDemo, loading, error };
}
