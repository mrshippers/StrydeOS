"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { subscribeAppointments, subscribePatients } from "@/lib/queries";
import { useClinicianSummaryStats } from "@/hooks/useClinicianSummaryStats";
import type { Appointment, Patient } from "@/types";

export interface RetentionAlert {
  id: string;
  name: string;
  daysSinceLastSession: number;
}

export interface ClinicianUtilisationRow {
  clinicianId: string;
  name: string;
  utilisationRate: number;
}

export interface OwnerSummaryData {
  revenueMtdPence: number;
  todayTotal: number;
  todayDnas: number;
  retentionAlerts: RetentionAlert[];
  retentionAlertCount: number;
  clinicianUtilisation: ClinicianUtilisationRow[];
  loading: boolean;
  error: string | null;
  usedDemo: boolean;
}

const DEMO_DATA: OwnerSummaryData = {
  revenueMtdPence: 1468500,
  todayTotal: 14,
  todayDnas: 1,
  retentionAlerts: [
    { id: "p1", name: "Marcus Webb", daysSinceLastSession: 41 },
    { id: "p2", name: "Sofia Nakamura", daysSinceLastSession: 35 },
    { id: "p3", name: "David Osei", daysSinceLastSession: 29 },
  ],
  retentionAlertCount: 3,
  clinicianUtilisation: [
    { clinicianId: "c1", name: "Nina Bennett", utilisationRate: 0.88 },
    { clinicianId: "c2", name: "David Lin", utilisationRate: 0.76 },
  ],
  loading: false,
  error: null,
  usedDemo: true,
};

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function todayDateString(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

export function useOwnerSummary(): OwnerSummaryData {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [apptReady, setApptReady] = useState(false);
  const [patientsReady, setPatientsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { rows: utilRows, loading: utilLoading } = useClinicianSummaryStats();

  useEffect(() => {
    if (isDemo) return;

    const dateFrom = startOfMonthIso();

    const unsubAppt = subscribeAppointments(
      clinicId,
      null,
      dateFrom,
      (data) => { setAppointments(data); setApptReady(true); },
      () => { setError("Failed to load appointments."); setApptReady(true); }
    );

    const unsubPatients = subscribePatients(
      clinicId,
      null,
      (data) => { setPatients(data); setPatientsReady(true); },
      () => { setError("Failed to load patients."); setPatientsReady(true); }
    );

    return () => { unsubAppt(); unsubPatients(); };
  }, [clinicId, isDemo]);

  if (isDemo) return DEMO_DATA;

  const today = todayDateString();

  const revenueMtdPence = appointments.reduce((sum, a) => {
    if (a.status === "completed" || a.status === "scheduled") {
      return sum + (a.revenueAmountPence ?? 0);
    }
    return sum;
  }, 0);

  const todayAppts = appointments.filter((a) => a.dateTime.slice(0, 10) === today);
  const todayTotal = todayAppts.length;
  const todayDnas = todayAppts.filter((a) => a.status === "dna").length;

  const alertPatients = patients
    .filter(
      (p) =>
        !p.discharged &&
        (p.lifecycleState === "AT_RISK" || p.lifecycleState === "LAPSED") &&
        !p.nextSessionDate
    )
    .map((p): RetentionAlert => ({
      id: p.id,
      name: p.name,
      daysSinceLastSession: p.lastSessionDate
        ? Math.floor((Date.now() - new Date(p.lastSessionDate).getTime()) / 86400000)
        : 999,
    }))
    .sort((a, b) => b.daysSinceLastSession - a.daysSinceLastSession);

  const clinicianUtilisation: ClinicianUtilisationRow[] = utilRows.map((r) => ({
    clinicianId: r.clinicianId,
    name: r.clinicianName,
    utilisationRate: r.stats.utilisationRate,
  }));

  const loading = !apptReady || !patientsReady || utilLoading;

  return {
    revenueMtdPence,
    todayTotal,
    todayDnas,
    retentionAlerts: alertPatients.slice(0, 5),
    retentionAlertCount: alertPatients.length,
    clinicianUtilisation,
    loading,
    error,
    usedDemo: false,
  };
}
