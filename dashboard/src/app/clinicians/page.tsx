"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import TrendChart from "@/components/ui/TrendChart";
import CliniciansTable from "@/components/ui/CliniciansTable";
import { SkeletonCard, SkeletonTable } from "@/components/ui/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { useClinicians } from "@/hooks/useClinicians";
import { useWeeklyStats } from "@/hooks/useWeeklyStats";
import { getDemoLatestWeekStats } from "@/hooks/useDemoData";
import {
  formatPercent,
  formatRate,
  formatPence,
  getFollowUpStatus,
  getPhysitrackStatus,
  getDnaStatus,
  getGenericStatus,
  getInitials,
} from "@/lib/utils";
import Link from "next/link";

export default function CliniciansPageWrapper() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <CliniciansPage />
    </Suspense>
  );
}

function CliniciansPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isClinicianView = user?.role === "clinician" && !!user?.clinicianId;
  const initialId = searchParams.get("id");
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (user?.role === "clinician" && user?.clinicianId) return user.clinicianId;
    return initialId;
  });
  const effectiveId = isClinicianView ? user!.clinicianId! : (selectedId ?? "all");
  const { clinicians, loading: clLoading } = useClinicians();
  const { stats, loading: statsLoading } = useWeeklyStats(effectiveId);
  const clinicianRows = isClinicianView
    ? getDemoLatestWeekStats().filter((r) => r.clinicianId === user?.clinicianId)
    : getDemoLatestWeekStats();

  useEffect(() => {
    if (isClinicianView && user?.clinicianId) setSelectedId(user.clinicianId);
    else if (initialId) setSelectedId(initialId);
  }, [initialId, isClinicianView, user?.clinicianId]);

  const latest = stats.length > 0 ? stats[stats.length - 1] : null;
  const selectedClinician = clinicians.find((c) => c.id === (effectiveId === "all" ? selectedId : effectiveId));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Clinician Performance"
        subtitle="Per-clinician KPI breakdown with 6-week trends"
      />

      {/* Full clinician table */}
      {clLoading || statsLoading ? (
        <SkeletonTable />
      ) : (
        <CliniciansTable
          rows={clinicianRows}
          onRowClick={(id) => setSelectedId(selectedId === id ? null : id)}
        />
      )}

      {/* Selected clinician detail panel — for clinician role, always show their panel */}
      {(effectiveId !== "all" && selectedClinician && latest) && (
        <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6 animate-fade-in">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-navy flex items-center justify-center text-sm font-bold text-white">
              {getInitials(selectedClinician.name)}
            </div>
            <div>
              <h2 className="font-display text-xl text-navy">
                {selectedClinician.name}
              </h2>
              <p className="text-xs text-muted">{selectedClinician.role}</p>
            </div>
            <Link
              href={`/continuity?clinician=${selectedId}`}
              className="ml-auto text-xs font-semibold text-blue hover:text-blue-bright transition-colors"
            >
              View patients →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {statsLoading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : (
              <>
                <StatCard
                  label="Follow-Up Rate"
                  value={formatRate(latest.followUpRate)}
                  target={latest.followUpTarget}
                  status={getFollowUpStatus(latest.followUpRate, latest.followUpTarget)}
                />
                <StatCard
                  label="Physitrack Rate"
                  value={formatPercent(latest.physitrackRate)}
                  status={getPhysitrackStatus(latest.physitrackRate)}
                />
                <StatCard
                  label="Utilisation"
                  value={formatPercent(latest.utilisationRate)}
                  status={getGenericStatus(latest.utilisationRate, 0.85)}
                />
                <StatCard
                  label="DNA Rate"
                  value={formatPercent(latest.dnaRate)}
                  status={getDnaStatus(latest.dnaRate)}
                />
                <StatCard
                  label="Revenue per Session"
                  value={formatPence(latest.revenuePerSessionPence)}
                  unit="avg"
                  status="neutral"
                />
              </>
            )}
          </div>

          {stats.length > 0 && (
            <TrendChart
              data={stats}
              lines={[
                { key: "followUpRate", color: "#3B90FF", label: "Follow-up Rate" },
                { key: "utilisationRate", color: "#8B5CF6", label: "Utilisation" },
                { key: "courseCompletionRate", color: "#059669", label: "Course Completion" },
              ]}
              height={260}
            />
          )}

          {/* Quick links for this clinician */}
          <div className="flex items-center gap-3 pt-4 border-t border-border/50">
            <Link
              href={`/continuity?clinician=${effectiveId}`}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors"
            >
              View patients
            </Link>
            <Link
              href="/intelligence"
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-muted border border-border hover:text-navy hover:border-navy/20 transition-colors"
            >
              Intelligence deep-dive
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
