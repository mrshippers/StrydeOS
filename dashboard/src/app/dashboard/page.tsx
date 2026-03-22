"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, useScroll, useTransform } from "motion/react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import TrendChart from "@/components/ui/TrendChart";
import { AlertBanner } from "@/components/ui/AlertFlag";
import CliniciansTable from "@/components/ui/CliniciansTable";
import DemoBanner from "@/components/ui/DemoBanner";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { SkeletonCard } from "@/components/ui/EmptyState";
import DailySnapshot from "@/components/ui/DailySnapshot";
import EmptyState from "@/components/ui/EmptyState";
import InsightNudge from "@/components/ui/InsightNudge";
import { useWeeklyStats } from "@/hooks/useWeeklyStats";
import { usePatients } from "@/hooks/usePatients";
import { useClinicians } from "@/hooks/useClinicians";
import { useClinicianSummaryStats } from "@/hooks/useClinicianSummaryStats";
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

function computeTrendPercent(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

const SESSION_GREETED_KEY = "strydeos_greeted";

function getGreeting(firstName: string): { greeting: string; subtext: string } {
  let isFirstMount = false;
  try {
    if (!sessionStorage.getItem(SESSION_GREETED_KEY)) {
      isFirstMount = true;
      sessionStorage.setItem(SESSION_GREETED_KEY, "1");
    }
  } catch {
    // sessionStorage unavailable
  }

  const name = firstName || "";
  const hour = new Date().getHours();

  let greeting: string;
  if (isFirstMount && name) {
    greeting = `Welcome back, ${name}`;
  } else if (hour >= 5 && hour < 12) {
    greeting = name ? `Good morning, ${name}` : "Good morning";
  } else if (hour >= 12 && hour < 17) {
    greeting = name ? `Good afternoon, ${name}` : "Good afternoon";
  } else if (hour >= 17 && hour < 22) {
    greeting = name ? `Good evening, ${name}` : "Good evening";
  } else {
    greeting = name ? `Still up, ${name}?` : "Good night";
  }

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

function formatSyncTime(dateStr: string | undefined): { label: string; staleness: "fresh" | "stale" | "very-stale" } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  const hours = mins / 60;

  let label: string;
  if (mins < 1) label = "just now";
  else if (mins < 60) label = `${mins}m ago`;
  else if (hours < 24) label = `${Math.round(hours)}h ago`;
  else label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const staleness = hours < 24 ? "fresh" : hours < 72 ? "stale" : "very-stale";
  return { label, staleness };
}

const staggerItem = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const, delay },
});

export default function DashboardPage() {
  const { user } = useAuth();
  const isClinicianView = user?.role === "clinician" && !!user?.clinicianId;
  const [selectedClinician, setSelectedClinician] = useState<string>(
    () => (user?.role === "clinician" && user?.clinicianId ? user.clinicianId : "all")
  );
  const [weekOffset, setWeekOffset] = useState(0);
  const effectiveClinician = isClinicianView ? user!.clinicianId! : selectedClinician;
  const { stats, loading, usedDemo, error: statsError } = useWeeklyStats(effectiveClinician);
  const { clinicians } = useClinicians();
  const { rows: clinicianRows, usedDemo: summaryUsedDemo, error: summaryError } = useClinicianSummaryStats();
  const { patients } = usePatients();
  const { startLoading, stopLoading } = useProgress();
  const router = useRouter();
  const firstName = user?.firstName || "";
  const { greeting, subtext } = getGreeting(firstName);

  useEffect(() => {
    if (loading) {
      startLoading();
      return () => stopLoading();
    }
  }, [loading, startLoading, stopLoading]);

  const lastSync = formatSyncTime(user?.clinicProfile?.pmsLastSyncAt ?? undefined);

  const weekIndex = useMemo(() => {
    const max = stats.length - 1;
    return Math.max(0, Math.min(max, max + weekOffset));
  }, [stats.length, weekOffset]);

  const latest = stats.length > 0 ? stats[weekIndex] : null;
  const previous = weekIndex > 0 ? stats[weekIndex - 1] : null;
  const isCurrentWeek = weekOffset === 0;

  const alerts = latest ? computeAlerts(latest) : [];

  const trendWindow = stats.slice(Math.max(0, weekIndex - 5), weekIndex + 1);

  const { scrollY } = useScroll();
  const headerFontSize = useTransform(scrollY, [0, 80], [32, 18]);
  const subtextOpacity = useTransform(scrollY, [0, 60], [1, 0]);
  const chevronOpacity = useTransform(scrollY, [0, 40], [1, 0]);

  return (
    <div className="space-y-6">
      {/* Welcome greeting + sync indicator */}
      <motion.div
        className="sticky top-0 z-20 mb-2 -mx-6 px-6 py-2 bg-cloud-dancer/90 dark:bg-navy/90 backdrop-blur-sm"
        style={{ paddingTop: 8 }}
        {...staggerItem(0)}
      >
        <div className="flex items-start justify-between">
          <div>
            <motion.h1
              className="font-display text-navy leading-tight relative"
              style={{ fontSize: headerFontSize }}
            >
              <span className="relative z-10">{greeting}{greeting.endsWith("?") ? "" : "."}</span>
              <motion.span className="chevron-trail" aria-hidden="true" style={{ opacity: chevronOpacity }}>
                <span className="chevron-glyph" style={{ animationDelay: "0s" }}>&rsaquo;</span>
                <span className="chevron-glyph" style={{ animationDelay: "0.4s" }}>&rsaquo;</span>
                <span className="chevron-glyph" style={{ animationDelay: "0.8s" }}>&rsaquo;</span>
              </motion.span>
            </motion.h1>
            <motion.p className="text-[13px] text-muted-strong mt-1 leading-relaxed" style={{ opacity: subtextOpacity }}>{subtext}</motion.p>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-2 flex-wrap justify-end">
            {isCurrentWeek && !loading && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cloud-light border border-border text-[12px] font-semibold shrink-0"
                style={{ color: "#059669" }}>
                <span className="pulse-live" style={{ color: "#059669" }}>●</span>
                Live
              </div>
            )}
            {lastSync && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cloud-light border border-border text-[12px] text-muted shrink-0">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background:
                      lastSync.staleness === "fresh"     ? "#059669" :
                      lastSync.staleness === "stale"     ? "#F59E0B" :
                      "#EF4444",
                  }}
                />
                <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
                Synced {lastSync.label}
              </div>
            )}
          </div>
        </div>
        {isCurrentWeek && !loading && (
          <DailySnapshot stats={latest} patients={patients} />
        )}
      </motion.div>

      {/* Rule-based insight nudge — current week only */}
      {isCurrentWeek && !loading && (
        <InsightNudge stats={latest} previousStats={previous} />
      )}

      {/* Error / Demo data banner */}
      {statsError && <ErrorBanner message={statsError} onRetry={() => window.location.reload()} />}
      {summaryError && <ErrorBanner message={summaryError} onRetry={() => window.location.reload()} />}
      {(user?.uid === "demo" || usedDemo) && <DemoBanner />}

      {/* Week navigation + clinician filter row */}
      <motion.div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" data-tour="clinician-filter" {...staggerItem(0.08)}>
        {/* Week picker */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            disabled={weekOffset <= -(stats.length - 1)}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted hover:text-navy hover:border-navy/20 transition-all duration-200 ease-out disabled:opacity-30 disabled:cursor-not-allowed bg-white shadow-[var(--shadow-card)] active:scale-[0.96]"
          >
            <ChevronLeft size={14} />
          </button>
          <div className="px-3 py-1.5 rounded-lg border border-border bg-white shadow-[var(--shadow-card)] text-sm font-medium text-navy min-w-[160px] text-center">
            {latest ? (
              isCurrentWeek ? (
                <span>
                  <span className="text-blue font-semibold">This week</span>
                  <span className="text-muted ml-2 text-[12px]">
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
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted hover:text-navy hover:border-navy/20 transition-all duration-200 ease-out disabled:opacity-30 disabled:cursor-not-allowed bg-white shadow-[var(--shadow-card)] active:scale-[0.96]"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Clinician filter — hidden for clinician role (they only see their own stats) */}
        {!isClinicianView && clinicians.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-strong font-medium">Viewing:</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setSelectedClinician("all")}
                className={`px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-200 ease-out active:scale-[0.97] ${
                  selectedClinician === "all"
                    ? "bg-navy text-white shadow-sm"
                    : "border border-border text-muted hover:text-navy hover:border-navy/20 hover:shadow-sm bg-white"
                }`}
              >
                All
              </button>
              {clinicians.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClinician(c.id)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-200 ease-out active:scale-[0.97] ${
                    selectedClinician === c.id
                      ? "bg-navy text-white shadow-sm"
                      : "border border-border text-muted hover:text-navy hover:border-navy/20 hover:shadow-sm bg-white"
                  }`}
                >
                  {c.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Alert section — before the numbers, so priority context lands first */}
      {!loading && alerts.length > 0 && <AlertBanner alerts={alerts} />}

      {/* Empty state — shown when loading is done but no metrics exist */}
      {!loading && !latest && (
        <motion.div {...staggerItem(0.1)}>
          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)]">
            <EmptyState
              heading="No performance data yet"
              subtext="Metrics will populate as patient data flows in from your PMS. If you've just connected, allow up to 24 hours for the first sync to complete."
              action={
                <a
                  href="/settings"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
                  style={{ background: "#1C54F2" }}
                >
                  Check PMS connection →
                </a>
              }
            />
          </div>
        </motion.div>
      )}

      {/* Stat cards — row 1 */}
      <motion.section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4" data-tour="stat-cards" {...staggerItem(0.1)}>
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
              trendPercent={computeTrendPercent(latest.followUpRate, previous?.followUpRate)}
              status={getFollowUpStatus(latest.followUpRate, latest.followUpTarget)}
              insight={getFollowUpInsight(
                latest.followUpRate,
                latest.followUpTarget,
                previous?.followUpRate
              )}
              sparklineData={trendWindow.map((s) => s.followUpRate)}
              action={{ label: "View rebooking opportunities", href: "/continuity" }}
            />
            <StatCard
              label="Physitrack Rate"
              value={formatPercent(latest.physitrackRate)}
              target={latest.physitrackTarget}
              benchmark="Target: 95%"
              trend={computeTrend(latest.physitrackRate, previous?.physitrackRate)}
              trendPercent={computeTrendPercent(latest.physitrackRate, previous?.physitrackRate)}
              status={getPhysitrackStatus(latest.physitrackRate)}
              insight={
                (latest.hepComplianceRate ?? latest.physitrackRate) >= 0.95
                  ? "All patients have active HEP programmes"
                  : "Some patients missing Physitrack assignment"
              }
              sparklineData={trendWindow.map((s) => s.physitrackRate)}
              action={{ label: "See non-compliant patients", href: "/continuity" }}
            />
          </>
        ) : null}
      </motion.section>

      {/* Stat cards — row 2 */}
      <motion.section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" {...staggerItem(0.18)}>
        {loading ? (
          <>
            <SkeletonCard />
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
              trendPercent={computeTrendPercent(latest.appointmentsTotal, previous?.appointmentsTotal)}
              status="neutral"
              sparklineData={trendWindow.map((s) => s.appointmentsTotal)}
            />
            <StatCard
              label="Utilisation Rate"
              value={formatPercent(latest.utilisationRate)}
              trend={computeTrend(latest.utilisationRate, previous?.utilisationRate)}
              trendPercent={computeTrendPercent(latest.utilisationRate, previous?.utilisationRate)}
              status={getGenericStatus(latest.utilisationRate, 0.85)}
              insight={
                latest.utilisationRate >= 0.9
                  ? "Running near capacity"
                  : "Room to add more bookings"
              }
              sparklineData={trendWindow.map((s) => s.utilisationRate)}
              action={{ label: "View schedule gaps", href: "/clinicians" }}
            />
            <StatCard
              label="DNA Rate"
              value={formatPercent(latest.dnaRate)}
              trend={computeTrend(
                -(latest.dnaRate),
                previous ? -(previous.dnaRate) : undefined
              )}
              trendPercent={computeTrendPercent(latest.dnaRate, previous?.dnaRate)}
              status={getDnaStatus(latest.dnaRate)}
              insight={
                latest.dnaRate <= 0.05
                  ? "Low no-show rate — excellent"
                  : "No-shows above target — review SMS reminders"
              }
              sparklineData={trendWindow.map((s) => s.dnaRate)}
              action={{ label: "Review missed appointments", href: "/continuity" }}
            />
            <StatCard
              label="HEP Compliance"
              value={formatPercent(latest.courseCompletionRate)}
              trend={computeTrend(latest.courseCompletionRate, previous?.courseCompletionRate)}
              trendPercent={computeTrendPercent(latest.courseCompletionRate, previous?.courseCompletionRate)}
              status={getGenericStatus(latest.courseCompletionRate, 0.80)}
              sparklineData={trendWindow.map((s) => s.courseCompletionRate)}
            />
            <StatCard
              label="Revenue per Session"
              value={formatPence(latest.revenuePerSessionPence)}
              unit="avg"
              trend={computeTrend(
                latest.revenuePerSessionPence,
                previous?.revenuePerSessionPence
              )}
              trendPercent={computeTrendPercent(latest.revenuePerSessionPence, previous?.revenuePerSessionPence)}
              status="neutral"
              sparklineData={trendWindow.map((s) => s.revenuePerSessionPence)}
              action={{ label: "See revenue breakdown", href: "/intelligence" }}
            />
          </>
        ) : null}
      </motion.section>

      {/* 90-day trend chart — shows window ending at selected week */}
      {!loading && trendWindow.length > 0 && (
        <motion.div {...staggerItem(0.26)}>
          <TrendChart
            data={trendWindow}
            lines={[
              { key: "followUpRate", color: "#4B8BF5", label: "Follow-up Rate" },
              { key: "physitrackRate", color: "#0891B2", label: "Physitrack Rate" },
              { key: "utilisationRate", color: "#8B5CF6", label: "Utilisation" },
            ]}
          />
        </motion.div>
      )}

      {/* Clinician mini-table — real Firestore data, demo fallback */}
      {!loading && !isClinicianView && clinicianRows.length > 0 && (
        <motion.div {...staggerItem(0.32)}>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-display text-lg text-navy">
              Clinician Summary — This Week
            </h3>
            {summaryUsedDemo && (
              <span className="text-[11px] font-semibold text-muted bg-cloud-light border border-border px-2 py-0.5 rounded-full">
                Demo
              </span>
            )}
          </div>
          <CliniciansTable
            rows={clinicianRows}
            onRowClick={(id) => router.push(`/clinicians?id=${id}`)}
          />
        </motion.div>
      )}
    </div>
  );
}
