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

  const demoPatients = useDemoPatients(clinicianId);
  const clinicId = user?.clinicId ?? null;

  useEffect(() => {
    const cid = clinicianId && clinicianId !== "all" ? clinicianId : null;

    const unsubscribe = subscribePatients(
      clinicId,
      cid,
      (data) => {
        if (data.length === 0) {
          setPatients(demoPatients);
        } else {
          setPatients(data);
        }
        setLoading(false);
      },
      () => {
        setPatients(demoPatients);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [clinicId, clinicianId, demoPatients]);

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

  return { patients, active, churnRisk, postDischarge, loading };
}
