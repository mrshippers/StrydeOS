"use client";

import { useEffect, useState, useMemo } from "react";
import { subscribePatients } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import { useDemoPatients } from "./useDemoData";
import type { Patient, LifecycleState } from "@/types";

export function usePatients(clinicianId?: string) {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDemo = user?.uid === "demo";
  const demoPatients = useDemoPatients(clinicianId);
  const clinicId = user?.clinicId ?? null;
  const userRole = user?.role ?? "clinician";
  const userClinicianId = user?.clinicianId ?? null;

  // Resolve the effective clinicianId filter:
  // - If an explicit clinicianId is passed (e.g. from a dropdown), use it (unless "all")
  // - If no clinicianId is passed and user is a clinician, auto-scope to their own patients
  // - Owners/admins with no explicit filter see all patients
  const effectiveClinicianId = useMemo(() => {
    if (clinicianId && clinicianId !== "all") return clinicianId;
    if (clinicianId === "all") {
      // Explicit "all" — only owners/admins should see all
      if (userRole === "owner" || userRole === "admin" || userRole === "superadmin") return null;
      // Clinicians requesting "all" get scoped to themselves
      return userClinicianId;
    }
    // No clinicianId passed — auto-scope for clinicians
    if (userRole === "clinician" && userClinicianId) return userClinicianId;
    return null;
  }, [clinicianId, userRole, userClinicianId]);

  useEffect(() => {
    setError(null);

    if (isDemo) {
      setPatients(demoPatients);
      setLoading(false);
      return () => {};
    }

    const unsubscribe = subscribePatients(
      clinicId,
      effectiveClinicianId,
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
  }, [clinicId, effectiveClinicianId, demoPatients, isDemo]);

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

  const byLifecycleState = useMemo(() => {
    const map = new Map<LifecycleState, Patient[]>();
    for (const p of patients) {
      const state = p.lifecycleState ?? "ACTIVE";
      const existing = map.get(state) ?? [];
      map.set(state, [...existing, p]);
    }
    return map;
  }, [patients]);

  const sessionAlerts = useMemo(
    () => patients.filter((p) => p.sessionThresholdAlert === true),
    [patients]
  );

  return { patients, active, churnRisk, postDischarge, byLifecycleState, sessionAlerts, loading, error };
}
