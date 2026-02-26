"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import TrendChart from "@/components/ui/TrendChart";
import { AlertBanner } from "@/components/ui/AlertFlag";
import CliniciansTable from "@/components/ui/CliniciansTable";
import DemoBanner from "@/components/ui/DemoBanner";
import { SkeletonCard } from "@/components/ui/EmptyState";
import { useWeeklyStats } from "@/hooks/useWeeklyStats";
import { useClinicians } from "@/hooks/useClinicians";
import { getDemoLatestWeekStats } from "@/hooks/useDemoData";
import { useAuth } from "@/hooks/useAuth";
import { useProgress } from "@/components/TopProgressBar";
import {
  formatFullDate,
  formatPercent,
  formatRate,
  formatPence,
  getFollowUpStatus,
  getPhysitrackStatus,
  getDnaStatus,
  getGenericStatus,
  getFollowUpInsight,
  computeAlerts,
} from "@/lib/utils";
import type { TrendDirection } from "@/types";

function computeTrend(current: number, previous: number | undefined): TrendDirection {
  if (previous === undefined) return "flat";
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

function getGreeting(): { greeting: string; subtext: string } {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const day = new Date().toLocaleDateString("en-GB", { weekday: "long" });
  const subtext =
    hour < 9
      ? `It's early. Here's where the clinic stands heading into ${day}.`
      : hour < 12
        ? `Here's your weekly overview for ${day}.`
        : hour < 17
          ? `Here's this week at a glance.`
          : `End of day. Here's how this week shaped up.`;

  return { greeting, subtext };
}

function formatSyncTime(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isClinicianView = user?.role === "clinician" && !!user?.clinicianId;
  const [selectedClinician, setSelectedClinician] = useState<string>(
    () => (user?.role === "clinician" && user?.clinicianId ? user.clinicianId : "all")
  );
  const [weekOffset, setWeekOffset] = useState(0);
  const effectiveClinician = isClinicianView ? user!.clinicianId! : selectedClinician;
  const { stats, loading, usedDemo } = useWeeklyStats(effectiveClinician);
  const { clinicians } = useClinicians();
  const { startLoading, stopLoading } = useProgress();
  const router = useRouter();
  const { greeting, subtext } = getGreeting();

  useEffect(() => {
    if (loading) {
      startLoading();
      return () => stopLoading();
    }
  }, [loading, startLoading, stopLoading]);

  const lastSyncLabel = formatSyncTime(user?.clinicProfile?.pmsLastSyncAt ?? undefined);

  const weekIndex = useMemo(() => {
    const max = stats.length - 1;
    return Math.max(0, Math.min(max, max + weekOffset));
  }, [stats.length, weekOffset]);

  const latest = stats.length > 0 ? stats[weekIndex] : null;
  const previous = weekIndex > 0 ? stats[weekIndex - 1] : null;
  const isCurrentWeek = weekOffset === 0;

  const alerts = latest ? computeAlerts(latest) : [];
  const clinicianRows = isClinicianView ? [] : getDemoLatestWeekStats();

  const trendWindow = stats.slice(Math.max(0, weekIndex - 5), weekIndex + 1);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome greeting + sync indicator */}
      <div className="mb-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-[32px] text-navy leading-tight">
              {greeting}.
            </h1>
            <p className="text-sm text-muted mt-0.5">{subtext}</p>
          </div>
          {lastSyncLabel && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cloud-light border border-border text-[11px] text-muted shrink-0 mt-2">
              <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
              Synced {lastSyncLabel}
            </div>
          )}
        </div>
      </div>

      {/* Demo data banner */}
      {usedDemo && <DemoBanner />}

      {/* Week navigation + clinician filter row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Week picker */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            disabled={weekOffset <= -(stats.length - 1)}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted hover:text-navy hover:border-navy/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-white shadow-[var(--shadow-card)]"
          >
            <ChevronLeft size={14} />
          </button>
          <div className="px-3 py-1.5 rounded-lg border border-border bg-white shadow-[var(--shadow-card)] text-sm font-medium text-navy min-w-[160px] text-center">
            {latest ? (
              isCurrentWeek ? (
                <span>
                  <span className="text-blue font-semibold">This week</span>
                  <span className="text-muted ml-2 text-xs">
                    {formatFullDate(latest.weekStart)}
                  </span>
                </span>
              ) : (
                formatFullDate(latest.weekStart)
              )
            ) : (
              "Loading..."
            )}
          </div>
          <button
            onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}
            disabled={isCurrentWeek}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted hover:text-navy hover:border-navy/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-white shadow-[var(--shadow-card)]"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Clinician filter — hidden for clinician role (they only see their own stats) */}
        {!isClinicianView && clinicians.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Viewing:</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setSelectedClinician("all")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  selectedClinician === "all"
                    ? "bg-navy text-white"
                    : "border border-border text-muted hover:text-navy hover:border-navy/20 bg-white"
                }`}
              >
                All
              </button>
              {clinicians.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClinician(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    selectedClinician === c.id
                      ? "bg-navy text-white"
                      : "border border-border text-muted hover:text-navy hover:border-navy/20 bg-white"
                  }`}
                >
                  {c.name.split(" ").pop()}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Alert section — before the numbers, so priority context lands first */}
      {!loading && alerts.length > 0 && <AlertBanner alerts={alerts} />}

      {/* Stat cards — row 1 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : latest ? (
          <>
            <StatCard
              label="Follow-Up Rate"
              value={formatRate(latest.followUpRate)}
              unit="sessions per patient"
              target={latest.followUpTarget}
              benchmark="Top performer: 3.8"
              trend={computeTrend(latest.followUpRate, previous?.followUpRate)}
              status={getFollowUpStatus(latest.followUpRate, latest.followUpTarget)}
              insight={getFollowUpInsight(
                latest.followUpRate,
                latest.followUpTarget,
                previous?.followUpRate
              )}
            />
            <StatCard
              label="Physitrack Rate"
              value={formatPercent(latest.physitrackRate)}
              target={latest.physitrackTarget}
              benchmark="Target: 95%"
              trend={computeTrend(latest.physitrackRate, previous?.physitrackRate)}
              status={getPhysitrackStatus(latest.physitrackRate)}
              insight={
                (latest.hepComplianceRate ?? latest.physitrackRate) >= 0.95
                  ? "All patients have active HEP programmes"
                  : "Some patients missing Physitrack assignment"
              }
            />
          </>
        ) : null}
      </section>

      {/* Stat cards — row 2 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : latest ? (
          <>
            <StatCard
              label="Appointments Total"
              value={latest.appointmentsTotal}
              unit="total this week"
              trend={computeTrend(latest.appointmentsTotal, previous?.appointmentsTotal)}
              status="neutral"
            />
            <StatCard
              label="Utilisation Rate"
              value={formatPercent(latest.utilisationRate)}
              trend={computeTrend(latest.utilisationRate, previous?.utilisationRate)}
              status={getGenericStatus(latest.utilisationRate, 0.85)}
              insight={
                latest.utilisationRate >= 0.9
                  ? "Running near capacity"
                  : "Room to add more bookings"
              }
            />
            <StatCard
              label="DNA Rate"
              value={formatPercent(latest.dnaRate)}
              trend={computeTrend(
                -(latest.dnaRate),
                previous ? -(previous.dnaRate) : undefined
              )}
              status={getDnaStatus(latest.dnaRate)}
              insight={
                latest.dnaRate <= 0.05
                  ? "Low no-show rate — excellent"
                  : "No-shows above target — review SMS reminders"
              }
            />
            <StatCard
              label="Course Completion"
              value={formatPercent(latest.courseCompletionRate)}
              trend={computeTrend(latest.courseCompletionRate, previous?.courseCompletionRate)}
              status={getGenericStatus(latest.courseCompletionRate, 0.80)}
            />
            <StatCard
              label="Revenue per Session"
              value={formatPence(latest.revenuePerSessionPence)}
              unit="avg"
              trend={computeTrend(
                latest.revenuePerSessionPence,
                previous?.revenuePerSessionPence
              )}
              status="neutral"
            />
          </>
        ) : null}
      </section>

      {/* 6-Week Trend Chart — shows window ending at selected week */}
      {!loading && trendWindow.length > 0 && (
        <TrendChart
          data={trendWindow}
          lines={[
            { key: "followUpRate", color: "#3B90FF", label: "Follow-up Rate" },
            { key: "physitrackRate", color: "#0891B2", label: "Physitrack Rate" },
            { key: "utilisationRate", color: "#8B5CF6", label: "Utilisation" },
          ]}
        />
      )}

      {/* Clinician mini-table */}
      {!loading && clinicianRows.length > 0 && (
        <div>
          <h3 className="font-display text-lg text-navy mb-3">
            Clinician Summary — This Week
          </h3>
          <CliniciansTable
            rows={clinicianRows}
            onRowClick={(id) => router.push(`/clinicians?id=${id}`)}
          />
        </div>
      )}
    </div>
  );
}
