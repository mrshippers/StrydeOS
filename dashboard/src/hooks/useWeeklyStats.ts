"use client";

import { useEffect, useState } from "react";
import { subscribeWeeklyStats } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import { useDemoWeeklyStats } from "./useDemoData";
import type { WeeklyStats } from "@/types";

export function useWeeklyStats(clinicianId: string) {
  const { user } = useAuth();
  const [stats, setStats] = useState<WeeklyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usedDemo, setUsedDemo] = useState(false);

  const isDemo = user?.uid === "demo";
  const demoStats = useDemoWeeklyStats(clinicianId);
  const clinicId = user?.clinicId ?? null;

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (isDemo) {
      setStats(demoStats);
      setUsedDemo(true);
      setLoading(false);
      return () => {};
    }

    const unsubscribe = subscribeWeeklyStats(
      clinicId,
      clinicianId,
      (data) => {
        setStats(data);
        setUsedDemo(false);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore error:", err);
        setError("Failed to load weekly stats. Check your connection and try again.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [clinicId, clinicianId, demoStats, isDemo]);

  return { stats, loading, error, usedDemo };
}
