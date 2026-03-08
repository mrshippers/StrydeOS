"use client";

import { useEffect, useState, useMemo } from "react";
import { subscribePatients } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import { useDemoPatients } from "./useDemoData";
import type { Patient } from "@/types";

export function usePatients(clinicianId?: string) {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDemo = user?.uid === "demo";
  const demoPatients = useDemoPatients(clinicianId);
  const clinicId = user?.clinicId ?? null;

  useEffect(() => {
    setError(null);

    if (isDemo) {
      setPatients(demoPatients);
      setLoading(false);
      return () => {};
    }

    const cid = clinicianId && clinicianId !== "all" ? clinicianId : null;

    const unsubscribe = subscribePatients(
      clinicId,
      cid,
      (data) => {
        setPatients(data);
        setLoading(false);
      },
      (err) => {
        console.error("[usePatients]", err);
        setError("Failed to load patients.");
        setPatients([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [clinicId, clinicianId, demoPatients, isDemo]);

  const active = useMemo(
    () =>
      patients.filter(
        (p) =>
          !p.discharged &&
          !p.churnRisk &&
          p.sessionCount < p.courseLength &&
          p.nextSessionDate
      ),
    [patients]
  );

  const churnRisk = useMemo(
    () => patients.filter((p) => !p.discharged && p.churnRisk),
    [patients]
  );

  const postDischarge = useMemo(
    () => patients.filter((p) => p.discharged),
    [patients]
  );

  return { patients, active, churnRisk, postDischarge, loading, error };
}
