"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useScroll, useTransform } from "motion/react";
import { ChevronLeft, ChevronRight, RefreshCw, Upload, ArrowRight, Info, X } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { AlertBanner } from "@/components/ui/AlertFlag";
import CliniciansTable from "@/components/ui/CliniciansTable";

import ErrorBanner from "@/components/ui/ErrorBanner";
import { SkeletonCard } from "@/components/ui/EmptyState";
import DailySnapshot from "@/components/ui/DailySnapshot";
import EmptyState from "@/components/ui/EmptyState";
import InsightNudge from "@/components/ui/InsightNudge";
import InsightBanner from "@/components/intelligence/InsightBanner";
import { useInsightEvents } from "@/hooks/useInsightEvents";
import { getGreeting, SESSION_GREETED_KEY } from "@/lib/greeting";
import type { GreetingData } from "@/lib/greeting";

const TrendChart = dynamic(
  () => import("@/components/ui/TrendChart"),
  {
    loading: () => <div className="animate-pulse bg-navy/10 rounded-xl h-[320px]" />,
    ssr: false,
  }
);
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
  getHepStatus,
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
  const { unreadCount } = useInsightEvents();
  const { startLoading, stopLoading } = useProgress();
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const firstName = user?.firstName || "";
  const [isFirstMount] = useState(() => {
    try {
      if (!sessionStorage.getItem(SESSION_GREETED_KEY)) {
        sessionStorage.setItem(SESSION_GREETED_KEY, "1");
        return true;
      }
      return false;
    } catch {
      return false;
    }
  });

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

  const greetingData: GreetingData = {
    latest,
    previous,
    patients,
    clinicians,
    selectedClinician: effectiveClinician,
    unreadInsightCount: unreadCount,
  };
  const { greeting, subtext } = getGreeting(firstName, isFirstMount, greetingData);
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

      {/* Intelligence insight banner — #1 ranked unread event */}
      {isCurrentWeek && !loading && <InsightBanner />}

      {/* Rule-based insight nudge — current week only */}
      {isCurrentWeek && !loading && (
        <InsightNudge stats={latest} previousStats={previous} />
      )}

      {/* Data staleness nudge for CSV-bridge clinics (TM3 etc.) */}
      {isCurrentWeek && !loading && lastSync?.staleness === "very-stale" && ["tm3"].includes(user?.clinicProfile?.pmsType ?? "") && (
        <motion.div
          className="flex items-center gap-3 p-3 rounded-xl border border-warn/20 bg-warn/5"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="w-8 h-8 rounded-lg bg-warn/10 flex items-center justify-center shrink-0">
            <RefreshCw size={14} className="text-warn" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-navy">Data import overdue</p>
            <p className="text-[11px] text-muted">Last import was {lastSync.label}. Upload a new CSV to keep your metrics current.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/settings#csv-import-section"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors"
            >
              <Upload size={11} /> Upload CSV
            </a>
            <a
              href="/settings"
              className="flex items-center gap-1 text-[11px] font-medium text-muted hover:text-navy transition-colors"
            >
              Auto-import <ArrowRight size={10} />
            </a>
          </div>
        </motion.div>
      )}

      {/* Error / Demo data banner */}
      {statsError && <ErrorBanner message={statsError} onRetry={() => window.location.reload()} />}
      {summaryError && <ErrorBanner message={summaryError} onRetry={() => window.location.reload()} />}
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
                <div className="flex items-center gap-3">
                  <a
                    href="/settings"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
                    style={{ background: "#1C54F2" }}
                  >
                    Check PMS connection →
                  </a>
                  <button
                    onClick={() => setPreviewOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold border border-border text-muted hover:text-navy hover:border-navy/20 bg-white transition-all duration-150 active:scale-[0.97] shadow-[var(--shadow-card)]"
                  >
                    <Info size={13} />
                    Preview dashboard
                  </button>
                </div>
              }
            />
          </div>
        </motion.div>
      )}

      {/* Ghost preview modal — shows what the dashboard looks like when populated */}
      <AnimatePresence>
        {previewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
            style={{ background: "rgba(11, 37, 69, 0.5)", backdropFilter: "blur(4px)" }}
            onClick={() => setPreviewOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-3xl rounded-2xl bg-white shadow-[var(--shadow-elevated)] overflow-hidden my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-border">
                <div>
                  <h3 className="font-display text-base text-navy">Dashboard Preview</h3>
                  <p className="text-[11px] text-muted mt-0.5">This is what your dashboard will look like once data flows in</p>
                </div>
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="text-muted hover:text-navy transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Ghost preview content */}
              <div className="p-6 opacity-50 pointer-events-none select-none">
                {/* Example stat cards — row 1 */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* Follow-up Rate */}
                  <div className="rounded-[var(--radius-card)] border border-border bg-white p-5">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Follow-Up Rate</p>
                    <p className="text-3xl font-semibold text-navy">3.8</p>
                    <p className="text-[11px] text-muted mt-1">sessions per patient</p>
                    <div className="flex items-center gap-1 mt-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#059669" }} />
                      <span className="text-[10px] font-semibold" style={{ color: "#059669" }}>+12% vs last week</span>
                    </div>
                  </div>
                  {/* HEP Rate */}
                  <div className="rounded-[var(--radius-card)] border border-border bg-white p-5">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">HEP Rate</p>
                    <p className="text-3xl font-semibold text-navy">92%</p>
                    <p className="text-[11px] text-muted mt-1">programme compliance</p>
                    <div className="flex items-center gap-1 mt-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#059669" }} />
                      <span className="text-[10px] font-semibold" style={{ color: "#059669" }}>On target</span>
                    </div>
                  </div>
                </div>

                {/* Example stat cards — row 2 */}
                <div className="grid grid-cols-3 gap-4 mb-5">
                  {/* Utilisation */}
                  <div className="rounded-[var(--radius-card)] border border-border bg-white p-4">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Utilisation</p>
                    <p className="text-2xl font-semibold text-navy">78%</p>
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#F59E0B" }} />
                      <span className="text-[10px] font-semibold" style={{ color: "#F59E0B" }}>Room to grow</span>
                    </div>
                  </div>
                  {/* DNA Rate */}
                  <div className="rounded-[var(--radius-card)] border border-border bg-white p-4">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">DNA Rate</p>
                    <p className="text-2xl font-semibold text-navy">4.2%</p>
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#059669" }} />
                      <span className="text-[10px] font-semibold" style={{ color: "#059669" }}>Below threshold</span>
                    </div>
                  </div>
                  {/* Revenue per Session */}
                  <div className="rounded-[var(--radius-card)] border border-border bg-white p-4">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Revenue / Session</p>
                    <p className="text-2xl font-semibold text-navy">&pound;62</p>
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#6B7280" }} />
                      <span className="text-[10px] font-semibold text-muted">Flat</span>
                    </div>
                  </div>
                </div>

                {/* Example clinician table */}
                <div className="rounded-[var(--radius-card)] border border-border bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-cloud-light/50">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide">Clinician Summary</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2.5 px-4 text-[10px] font-semibold text-muted uppercase">Clinician</th>
                        <th className="text-left py-2.5 px-4 text-[10px] font-semibold text-muted uppercase">Follow-up</th>
                        <th className="text-left py-2.5 px-4 text-[10px] font-semibold text-muted uppercase">HEP</th>
                        <th className="text-left py-2.5 px-4 text-[10px] font-semibold text-muted uppercase">Utilisation</th>
                        <th className="text-left py-2.5 px-4 text-[10px] font-semibold text-muted uppercase">Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue/10 flex items-center justify-center text-[10px] font-bold text-blue">AH</div>
                            <span className="text-sm font-medium text-navy">Andrew H.</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#05966912", color: "#059669" }}>3.8</span></td>
                        <td className="py-2.5 px-4"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#05966912", color: "#059669" }}>94%</span></td>
                        <td className="py-2.5 px-4"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#F59E0B12", color: "#F59E0B" }}>76%</span></td>
                        <td className="py-2.5 px-4 text-sm text-navy font-medium">24</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-purple/10 flex items-center justify-center text-[10px] font-bold text-purple">MR</div>
                            <span className="text-sm font-medium text-navy">Max R.</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#F59E0B12", color: "#F59E0B" }}>2.9</span></td>
                        <td className="py-2.5 px-4"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#05966912", color: "#059669" }}>88%</span></td>
                        <td className="py-2.5 px-4"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#05966912", color: "#059669" }}>82%</span></td>
                        <td className="py-2.5 px-4 text-sm text-navy font-medium">18</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stat cards — row 1 */}
      <motion.section className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4" data-tour="stat-cards" {...staggerItem(0.1)}>
        {/* Ambient radial glow — blue wash behind primary stats */}
        <div
          className="ambient-glow -z-10"
          style={{
            width: "50%",
            height: "120%",
            top: "-10%",
            left: "25%",
            background: "radial-gradient(ellipse at center, rgba(28,84,242,0.06) 0%, transparent 70%)",
          }}
        />
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
              label="HEP Rate"
              value={formatPercent(latest.hepRate)}
              target={latest.hepTarget}
              benchmark="Target: 95%"
              trend={computeTrend(latest.hepRate, previous?.hepRate)}
              trendPercent={computeTrendPercent(latest.hepRate, previous?.hepRate)}
              status={getHepStatus(latest.hepRate)}
              insight={
                (latest.hepComplianceRate ?? latest.hepRate) >= 0.95
                  ? "All patients have active HEP programmes"
                  : "Some patients missing HEP assignment"
              }
              sparklineData={trendWindow.map((s) => s.hepRate)}
              action={{ label: "See non-compliant patients", href: "/continuity" }}
            />
          </>
        ) : null}
      </motion.section>

      {/* Stat cards — row 2 */}
      <motion.section className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" {...staggerItem(0.18)}>
        {/* Ambient radial glow — teal wash behind secondary stats */}
        <div
          className="ambient-glow -z-10"
          style={{
            width: "40%",
            height: "140%",
            top: "-20%",
            left: "30%",
            background: "radial-gradient(ellipse at center, rgba(8,145,178,0.05) 0%, transparent 70%)",
            animationDelay: "3s",
          }}
        />
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
        <motion.div className="relative" {...staggerItem(0.26)}>
          {/* Ambient radial glow — purple accent behind chart */}
          <div
            className="ambient-glow -z-10"
            style={{
              width: "35%",
              height: "80%",
              top: "10%",
              right: "5%",
              background: "radial-gradient(ellipse at center, rgba(139,92,246,0.04) 0%, transparent 70%)",
              animationDelay: "2s",
            }}
          />
          <TrendChart
            data={trendWindow}
            lines={[
              { key: "followUpRate", color: "#4B8BF5", label: "Follow-up Rate" },
              { key: "hepRate", color: "#0891B2", label: "HEP Rate" },
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
