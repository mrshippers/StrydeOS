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

export type OwnerSummaryPeriod = "today" | "7d" | "30d" | "90d";

function dateFromForPeriod(period: OwnerSummaryPeriod): string {
  const now = new Date();
  switch (period) {
    case "today":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    case "7d":
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case "30d":
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case "90d":
      return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  }
}

function todayDateString(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

export function useOwnerSummary(period: OwnerSummaryPeriod = "30d"): OwnerSummaryData {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";
  const sessionPricePence = user?.clinicProfile?.sessionPricePence ?? 0;

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [apptReady, setApptReady] = useState(false);
  const [patientsReady, setPatientsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { rows: utilRows, loading: utilLoading } = useClinicianSummaryStats();

  useEffect(() => {
    if (isDemo) return;
    setApptReady(false);

    const dateFrom = dateFromForPeriod(period);

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
  }, [clinicId, isDemo, period]);

  if (isDemo) return DEMO_DATA;

  const today = todayDateString();

  const revenueMtdPence = appointments.reduce((sum, a) => {
    if (a.status === "completed" || a.status === "scheduled") {
      return sum + (a.revenueAmountPence ?? sessionPricePence);
    }
    return sum;
  }, 0);

  const todayAppts = appointments.filter((a) => a.dateTime.slice(0, 10) === today);
  const todayTotal = period === "today" ? appointments.length : todayAppts.length;
  const todayDnas = (period === "today" ? appointments : todayAppts).filter((a) => a.status === "dna").length;

  // Headline "patients at risk" = the actionable AT_RISK bucket only. The
  // cadence-relative model (compute-risk-score.ts) reserves AT_RISK for patients
  // who were actually seen (lastSessionDate present) and are overdue versus their
  // own rebooking rhythm but still inside the chase window. LAPSED/CHURNED are
  // past that window (a separate bucket), and never-seen imports are NEW — so the
  // old "259" stale-Spires bleed can no longer land here.
  const alertPatients = patients
    .filter(
      (p) =>
        !p.discharged &&
        p.lifecycleState === "AT_RISK" &&
        !p.nextSessionDate &&
        !!p.lastSessionDate
    )
    .map((p): RetentionAlert => ({
      id: p.id,
      name: p.name,
      daysSinceLastSession: (() => {
        const t = p.lastSessionDate ? new Date(p.lastSessionDate).getTime() : NaN;
        return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : 999;
      })(),
    }))
    .sort((a, b) => b.daysSinceLastSession - a.daysSinceLastSession);

  const clinicianUtilisation: ClinicianUtilisationRow[] = utilRows
    .filter((r) => r.hasData !== false)
    .map((r) => ({
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
