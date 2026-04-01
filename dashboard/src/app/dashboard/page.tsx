"use client";

import { useState, useMemo, useEffect, Component, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useScroll, useTransform } from "motion/react";
import { ChevronLeft, ChevronRight, RefreshCw, Upload, ArrowRight, Info, X, AlertTriangle } from "lucide-react";
const StatCard = dynamic(() => import("@/components/ui/StatCard"), {
  loading: () => <div className="animate-pulse bg-cloud-light rounded-[var(--radius-card)] h-[200px]" />,
});
const CliniciansTable = dynamic(() => import("@/components/ui/CliniciansTable"), {
  loading: () => <div className="animate-pulse bg-cloud-light rounded-[var(--radius-card)] h-[200px]" />,
});
const LiveActivityFeed = dynamic(() => import("@/components/ui/LiveActivityFeed"), {
  loading: () => (
    <div className="rounded-[var(--radius-card)] p-5 h-full animate-pulse"
      style={{ background: "linear-gradient(135deg, #0B2545 0%, #132D5E 100%)" }}>
      <div className="h-3 w-20 bg-white/10 rounded mb-4" />
      <div className="space-y-2">
        <div className="h-6 bg-white/5 rounded" />
        <div className="h-6 bg-white/5 rounded" />
        <div className="h-6 bg-white/5 rounded" />
      </div>
    </div>
  ),
  ssr: false,
});

class FeedErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[var(--radius-card)] p-5 h-full flex flex-col items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #0B2545 0%, #132D5E 100%)" }}>
          <p className="text-[12px] text-white/30 font-medium">Live feed paused</p>
          <p className="text-[10px] text-white/15">Will resume on next page load</p>
        </div>
      );
    }
    return this.props.children;
  }
}

import ErrorBanner from "@/components/ui/ErrorBanner";
import { SkeletonCard } from "@/components/ui/EmptyState";
import EmptyState from "@/components/ui/EmptyState";
import { getGreeting, SESSION_GREETED_KEY } from "@/lib/greeting";
import type { GreetingData } from "@/lib/greeting";

const TrendChart = dynamic(
  () => import("@/components/ui/TrendChart"),
  {
    loading: () => <div className="animate-pulse bg-navy/10 rounded-xl h-[140px]" />,
    ssr: false,
  }
);
import { useWeeklyStats } from "@/hooks/useWeeklyStats";
import { usePatients } from "@/hooks/usePatients";
import { useClinicians } from "@/hooks/useClinicians";
import { useClinicianSummaryStats } from "@/hooks/useClinicianSummaryStats";
import { useAuth } from "@/hooks/useAuth";
import { useInsightEvents } from "@/hooks/useInsightEvents";
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
} from "@/lib/utils";
import { brand } from "@/lib/brand";
import type { TrendDirection, MetricStatus } from "@/types";

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

/** Composite status: worst of two statuses */
function worstStatus(a: MetricStatus, b: MetricStatus): MetricStatus {
  const rank: Record<MetricStatus, number> = { danger: 0, warn: 1, neutral: 2, ok: 3 };
  return rank[a] <= rank[b] ? a : b;
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
  const [syncing, setSyncing] = useState(false);

  const handleManualSync = async () => {
    if (syncing || !user) return;
    setSyncing(true);
    try {
      const { getIdToken } = await import("firebase/auth");
      const { getFirebaseAuth } = await import("@/lib/firebase");
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) return;
      const token = await getIdToken(auth.currentUser);
      const res = await fetch("/api/pms/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Sync failed");
      // Also trigger metrics recompute after sync
      await fetch("/api/metrics/compute", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      window.location.reload();
    } catch {
      // Fail silently — the staleness banner will remain visible
    } finally {
      setSyncing(false);
    }
  };
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

  // Show onboarding banner instead of redirecting — login should always land here
  const showOnboardingBanner = (() => {
    if (!user?.clinicProfile) return false;
    const clinic = user.clinicProfile;
    const dpaAccepted = !!clinic.compliance?.dpaAcceptedAt;
    return clinic.status === "onboarding" && !dpaAccepted && user.role === "owner";
  })();

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

  const trendWindow = stats.slice(Math.max(0, weekIndex - 5), weekIndex + 1);

  const { scrollY } = useScroll();
  const headerFontSize = useTransform(scrollY, [0, 80], [32, 18]);
  const subtextOpacity = useTransform(scrollY, [0, 60], [1, 0]);
  const chevronOpacity = useTransform(scrollY, [0, 40], [1, 0]);

  return (
    <div className="space-y-5">
      {/* ── Onboarding banner (compressed) ────────────────────────────────── */}
      {showOnboardingBanner && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-blue/3 border border-blue/10">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue/8 flex items-center justify-center text-blue text-[10px] font-bold">!</div>
            <p className="text-xs font-medium text-navy">Finish setting up your clinic</p>
          </div>
          <a href="/onboarding" className="btn-primary" style={{ padding: "6px 18px", fontSize: 11 }}>
            Continue &rarr;
          </a>
        </div>
      )}

      {/* ── Greeting (softer header) ──────────────────────────────────────── */}
      <motion.div
        className="sticky top-0 z-20 mb-1 -mx-6 px-6 py-2 bg-cloud-dancer/90 dark:bg-navy/90 backdrop-blur-sm"
        style={{ paddingTop: 8 }}
        {...staggerItem(0)}
      >
        <div className="flex items-start justify-between">
          <div>
            <motion.h1
              className="font-display text-navy/90 leading-tight relative"
              style={{ fontSize: headerFontSize, letterSpacing: "-0.5px" }}
            >
              <span className="relative z-10">{greeting}{greeting.endsWith("?") ? "" : "."}</span>
              <motion.span className="chevron-trail" aria-hidden="true" style={{ opacity: chevronOpacity }}>
                <span className="chevron-glyph" style={{ animationDelay: "0s" }}>&rsaquo;</span>
                <span className="chevron-glyph" style={{ animationDelay: "0.4s" }}>&rsaquo;</span>
                <span className="chevron-glyph" style={{ animationDelay: "0.8s" }}>&rsaquo;</span>
              </motion.span>
            </motion.h1>
            <motion.p className="text-[13px] font-medium text-muted-strong mt-1 italic leading-relaxed" style={{ opacity: subtextOpacity }}>{subtext}</motion.p>
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
              <button
                onClick={handleManualSync}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cloud-light border border-border text-[12px] text-muted shrink-0 hover:border-navy/20 hover:text-navy transition-all disabled:opacity-50 cursor-pointer"
                title="Click to sync now"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background:
                      lastSync.staleness === "fresh"     ? "#059669" :
                      lastSync.staleness === "stale"     ? "#F59E0B" :
                      "#EF4444",
                  }}
                />
                <RefreshCw size={10} className={syncing || loading ? "animate-spin" : ""} />
                {syncing ? "Syncing…" : `Synced ${lastSync.label}`}
              </button>
            )}
            {!lastSync && user?.clinicProfile?.pmsType && !loading && (
              <button
                onClick={handleManualSync}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cloud-light border border-border text-[12px] text-muted shrink-0 hover:border-navy/20 hover:text-navy transition-all disabled:opacity-50"
              >
                <RefreshCw size={10} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Syncing…" : "Sync data"}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Data staleness nudge (all PMS types) ─────────────────────────── */}
      {isCurrentWeek && !loading && lastSync?.staleness === "very-stale" && user?.clinicProfile?.pmsType && (
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
            <p className="text-sm font-medium text-navy">Data sync overdue</p>
            <p className="text-[11px] text-muted">
              Last sync was {lastSync.label}. {user.clinicProfile.pmsType === "tm3" ? "Upload a new CSV to keep your metrics current." : "Trigger a manual sync or check your PMS connection."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {user.clinicProfile.pmsType === "tm3" ? (
              <a
                href="/settings#csv-import-section"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors"
              >
                <Upload size={11} /> Upload CSV
              </a>
            ) : (
              <button
                onClick={handleManualSync}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={11} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync now"}
              </button>
            )}
            <a
              href="/settings"
              className="flex items-center gap-1 text-[11px] font-medium text-muted hover:text-navy transition-colors"
            >
              Settings <ArrowRight size={10} />
            </a>
          </div>
        </motion.div>
      )}

      {/* ── Gentle stale nudge (24-72h) — only for non-webhook PMS ────────── */}
      {isCurrentWeek && !loading && lastSync?.staleness === "stale" && user?.clinicProfile?.pmsType && (
        <motion.div
          className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-cloud-light"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <RefreshCw size={13} className="text-muted shrink-0" />
          <p className="text-[11px] text-muted flex-1">
            Your data was last synced {lastSync.label}. For the most accurate weekly metrics, sync before your end-of-week review.
          </p>
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </motion.div>
      )}

      {/* Error banners — subtle, triangle on right */}
      {statsError && <ErrorBanner message="Metrics couldn't load — showing placeholders until the next sync." onRetry={() => window.location.reload()} />}
      {summaryError && <ErrorBanner message="Clinician summary unavailable right now." onRetry={() => window.location.reload()} />}

      {/* ── Week navigation + clinician filter ────────────────────────────── */}
      <motion.div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" data-tour="clinician-filter" {...staggerItem(0.08)}>
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

      {/* ── Empty state ───────────────────────────────────────────────────── */}
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
                    className="btn-primary"
                    style={{ padding: "8px 20px", fontSize: 12 }}
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

      {/* ── Preview modal (updated layout) ────────────────────────────────── */}
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
              <div className="flex items-center justify-between p-5 border-b border-border">
                <div>
                  <h3 className="font-display text-base text-navy">Dashboard Preview</h3>
                  <p className="text-[11px] text-muted mt-0.5">This is what your dashboard will look like once data flows in</p>
                </div>
                <button onClick={() => setPreviewOpen(false)} className="text-muted hover:text-navy transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="p-6 opacity-50 pointer-events-none select-none">
                {/* Row 1: 3 hero cards */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-[var(--radius-card)] border border-border bg-white p-4">
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Appointments</p>
                    <p className="text-2xl font-semibold text-navy">73</p>
                    <p className="text-[10px] text-muted mt-0.5">this week</p>
                    <div className="border-t border-border mt-2 pt-2 flex justify-between text-[10px] text-navy font-medium">
                      <span>11 new</span><span>62 follow-ups</span>
                    </div>
                  </div>
                  <div className="rounded-[var(--radius-card)] border border-border bg-white p-4">
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Performance</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-xl font-semibold text-navy">3.8</p><p className="text-[9px] text-muted">follow-up</p></div>
                      <div><p className="text-xl font-semibold text-navy">82%</p><p className="text-[9px] text-muted">utilisation</p></div>
                    </div>
                  </div>
                  <div className="rounded-[var(--radius-card)] p-4" style={{ background: brand.navy }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>Clinic Pulse</p>
                    <div className="space-y-1.5">
                      {["Ava booked new patient", "HEP reminder responded", "DNA spike detected"].map((t) => (
                        <div key={t} className="text-[9px] px-2 py-1 rounded" style={{ color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.04)" }}>{t}</div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Row 2: 4 grouped cards */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {["Patient Flow", "Revenue", "Compliance", "Trend"].map((l) => (
                    <div key={l} className="rounded-[var(--radius-card)] border border-border bg-white p-3">
                      <p className="text-[9px] font-semibold text-muted uppercase tracking-wide">{l}</p>
                      <div className="h-8 mt-2 bg-cloud-light rounded" />
                    </div>
                  ))}
                </div>
                {/* Clinician table placeholder */}
                <div className="rounded-[var(--radius-card)] border border-border bg-white p-3">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">Clinician Summary</p>
                  <div className="h-12 bg-cloud-light rounded" />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 1 — Hero Cards: Appointments | Performance Snapshot | Live Feed
         ══════════════════════════════════════════════════════════════════════ */}
      <motion.section className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-tour="stat-cards" {...staggerItem(0.1)}>
        {/* Ambient glow */}
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
            <SkeletonCard />
          </>
        ) : latest ? (
          <>
            {/* Appointments (promoted from Row 2) */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5 hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5 transition-all duration-300">
              <div className="flex items-start justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">Appointments</span>
                <div className="w-[7px] h-[7px] rounded-full" style={{ background: "#6B7280", boxShadow: "0 0 6px rgba(107,114,128,0.2)" }} />
              </div>
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-[44px] font-bold text-navy leading-none tabular-nums">{latest.appointmentsTotal}</span>
                {(() => {
                  const t = computeTrend(latest.appointmentsTotal, previous?.appointmentsTotal);
                  const p = computeTrendPercent(latest.appointmentsTotal, previous?.appointmentsTotal);
                  const color = t === "up" ? "#059669" : t === "down" ? "#EF4444" : "#6B7280";
                  return p !== undefined ? (
                    <span className="text-[11px] font-semibold" style={{ color }}>
                      {t === "up" ? "↑" : t === "down" ? "↓" : "→"} {Math.abs(Math.round(p))}%
                    </span>
                  ) : null;
                })()}
              </div>
              <p className="text-[12px] text-muted">this week</p>
              <div className="border-t border-border mt-3 pt-3 flex items-center justify-between">
                <div>
                  <span className="text-lg font-bold text-navy">{latest.initialAssessments}</span>
                  <span className="text-[10px] text-muted ml-1">new patients</span>
                </div>
                <div>
                  <span className="text-lg font-bold text-navy">{latest.followUps}</span>
                  <span className="text-[10px] text-muted ml-1">follow-ups</span>
                </div>
              </div>
            </div>

            {/* Performance Snapshot (merged follow-up + utilisation) */}
            {(() => {
              const fuStatus = getFollowUpStatus(latest.followUpRate, latest.followUpTarget);
              const utilStatus = getGenericStatus(latest.utilisationRate, 0.85);
              const compositeStatus = worstStatus(fuStatus, utilStatus);
              const statusColor =
                compositeStatus === "ok" ? "#059669"
                : compositeStatus === "warn" ? "#F59E0B"
                : compositeStatus === "danger" ? "#EF4444"
                : "#6B7280";
              const fuTrend = computeTrend(latest.followUpRate, previous?.followUpRate);
              const fuPct = computeTrendPercent(latest.followUpRate, previous?.followUpRate);
              const utilTrend = computeTrend(latest.utilisationRate, previous?.utilisationRate);
              const utilPct = computeTrendPercent(latest.utilisationRate, previous?.utilisationRate);
              const insight = getFollowUpInsight(latest.followUpRate, latest.followUpTarget, previous?.followUpRate);

              return (
                <Link href="/intelligence" className="block rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5 hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5 transition-all duration-300">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">Performance</span>
                    <div className="w-[7px] h-[7px] rounded-full" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}73` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <div>
                      <span className="text-[32px] font-bold text-navy leading-none tabular-nums">{formatRate(latest.followUpRate)}</span>
                      <p className="text-[10px] text-muted mt-0.5">follow-up rate</p>
                      {fuPct !== undefined && (
                        <span className="text-[10px] font-semibold" style={{ color: fuTrend === "up" ? "#059669" : fuTrend === "down" ? "#EF4444" : "#6B7280" }}>
                          {fuTrend === "up" ? "↑" : fuTrend === "down" ? "↓" : "→"} {Math.abs(Math.round(fuPct))}%
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-[32px] font-bold text-navy leading-none tabular-nums">{formatPercent(latest.utilisationRate)}</span>
                      <p className="text-[10px] text-muted mt-0.5">utilisation</p>
                      {utilPct !== undefined && (
                        <span className="text-[10px] font-semibold" style={{ color: utilTrend === "up" ? "#059669" : utilTrend === "down" ? "#EF4444" : "#6B7280" }}>
                          {utilTrend === "up" ? "↑" : utilTrend === "down" ? "↓" : "→"} {Math.abs(Math.round(utilPct))}%
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted italic">{insight}</p>
                </Link>
              );
            })()}

            {/* Live Activity Feed */}
            <FeedErrorBoundary>
              <LiveActivityFeed />
            </FeedErrorBoundary>
          </>
        ) : statsError ? (
          <>
            {/* Error placeholder cards — dashes instead of broken data */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-start justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">Appointments</span>
                <AlertTriangle size={13} style={{ color: brand.warning }} />
              </div>
              <span className="text-[44px] font-bold text-navy/20 leading-none">——</span>
              <p className="text-[12px] text-muted mt-1">this week</p>
              <div className="border-t border-border mt-3 pt-3 flex items-center justify-between">
                <div><span className="text-lg font-bold text-navy/20">——</span><span className="text-[10px] text-muted ml-1">new patients</span></div>
                <div><span className="text-lg font-bold text-navy/20">——</span><span className="text-[10px] text-muted ml-1">follow-ups</span></div>
              </div>
            </div>

            {/* Performance placeholder */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">Performance</span>
                <AlertTriangle size={13} style={{ color: brand.warning }} />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div>
                  <span className="text-[32px] font-bold text-navy/20 leading-none">——</span>
                  <p className="text-[10px] text-muted mt-0.5">follow-up rate</p>
                </div>
                <div>
                  <span className="text-[32px] font-bold text-navy/20 leading-none">——</span>
                  <p className="text-[10px] text-muted mt-0.5">utilisation</p>
                </div>
              </div>
              <p className="text-[11px] text-muted italic">Waiting for data to come back online</p>
            </div>

            {/* Live Activity Feed still works independently */}
            <FeedErrorBoundary>
              <LiveActivityFeed />
            </FeedErrorBoundary>
          </>
        ) : null}
      </motion.section>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 2 — Patient Flow | Revenue | Compliance | 6-Week Trend
         ══════════════════════════════════════════════════════════════════════ */}
      <motion.section className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.2fr] gap-4" {...staggerItem(0.18)}>
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
          </>
        ) : latest ? (
          <>
            {/* Patient Flow (DNA-focused) */}
            <StatCard
              label="Patient Flow"
              value={formatPercent(latest.dnaRate)}
              trend={computeTrend(-(latest.dnaRate), previous ? -(previous.dnaRate) : undefined)}
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

            {/* Revenue (compound) */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-4 hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5 transition-all duration-300">
              <div className="flex items-start justify-between mb-1">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">Revenue</span>
                <div className="w-[7px] h-[7px] rounded-full" style={{ background: "#6B7280", boxShadow: "0 0 6px rgba(107,114,128,0.2)" }} />
              </div>
              <div className="flex items-baseline gap-1.5 mb-0.5">
                <span className="text-[28px] font-bold text-navy leading-none tabular-nums">{formatPence(latest.revenuePerSessionPence)}</span>
                <span className="text-[11px] text-muted">avg/session</span>
                {(() => {
                  const t = computeTrend(latest.revenuePerSessionPence, previous?.revenuePerSessionPence);
                  const p = computeTrendPercent(latest.revenuePerSessionPence, previous?.revenuePerSessionPence);
                  const color = t === "up" ? "#059669" : t === "down" ? "#EF4444" : "#6B7280";
                  return p !== undefined ? (
                    <span className="text-[10px] font-semibold" style={{ color }}>
                      {t === "up" ? "↑" : t === "down" ? "↓" : "→"} {Math.abs(Math.round(p))}%
                    </span>
                  ) : null;
                })()}
              </div>
              <p className="text-[11px] text-muted mb-2">
                {latest.revenuePerSessionPence > (previous?.revenuePerSessionPence ?? 0) ? "Improving rate" : "Steady rate"}
              </p>
              <div className="border-t border-border pt-2 flex items-center justify-between">
                <div>
                  <span className="text-base font-bold text-navy tabular-nums">
                    {formatPence(latest.appointmentsTotal * latest.revenuePerSessionPence)}
                  </span>
                  <span className="text-[9px] text-muted ml-1">total this week</span>
                </div>
              </div>
              <div className="mt-2">
                <Link href="/intelligence" className="text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors group">
                  See revenue breakdown <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
                </Link>
              </div>
            </div>

            {/* Compliance (HEP + course completion as progress bars) */}
            {(() => {
              const hepVal = Math.round((latest.hepRate ?? 0) * 100);
              const courseVal = Math.round((latest.courseCompletionRate ?? 0) * 100);
              const hepStatus = getHepStatus(latest.hepRate);
              const courseStatus = getGenericStatus(latest.courseCompletionRate, 0.80);
              const composite = worstStatus(hepStatus, courseStatus);
              const dotColor =
                composite === "ok" ? "#059669"
                : composite === "warn" ? "#F59E0B"
                : composite === "danger" ? "#EF4444"
                : "#6B7280";
              const barGrad = "linear-gradient(90deg, #0891B2, #4B8BF5)";
              const barWarn = "linear-gradient(90deg, #F59E0B, #F59E0B)";
              const hepPct = computeTrendPercent(latest.hepRate, previous?.hepRate);
              const coursePct = computeTrendPercent(latest.courseCompletionRate, previous?.courseCompletionRate);
              const avgChange = ((hepPct ?? 0) + (coursePct ?? 0)) / 2;

              return (
                <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-4 hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5 transition-all duration-300">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">Compliance</span>
                    <div className="w-[7px] h-[7px] rounded-full" style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}73` }} />
                  </div>
                  {/* HEP bar */}
                  <div className="mb-3">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-[11px] font-medium text-navy">HEP assigned</span>
                      <span className="text-[11px] font-bold text-navy tabular-nums">{hepVal}%</span>
                    </div>
                    <div className="h-[4px] bg-cloud-dark rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(hepVal, 100)}%`, background: hepStatus === "ok" ? barGrad : barWarn }}
                      />
                    </div>
                  </div>
                  {/* Course completion bar */}
                  <div className="mb-3">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-[11px] font-medium text-navy">Course completion</span>
                      <span className="text-[11px] font-bold text-navy tabular-nums">{courseVal}%</span>
                    </div>
                    <div className="h-[4px] bg-cloud-dark rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(courseVal, 100)}%`, background: courseStatus === "ok" ? barGrad : barWarn }}
                      />
                    </div>
                  </div>
                  <div className="border-t border-border pt-2">
                    <p className="text-[10px] text-muted italic">
                      {composite === "ok" ? "On track" : composite === "warn" ? "Needs attention" : "Below target"}
                      {avgChange ? ` · ${avgChange > 0 ? "+" : ""}${Math.round(avgChange)}% WoW` : ""}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* 6-Week Trend Strip (replaces full 90-day chart) */}
            {trendWindow.length > 0 && (
              <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-4">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">6-Week Trend</span>
                <p className="text-[10px] text-muted mb-2">Rolling performance</p>
                <div className="h-[100px]">
                  <TrendChart
                    data={trendWindow}
                    lines={[
                      { key: "followUpRate", color: "#4B8BF5", label: "Follow-up Rate" },
                      { key: "utilisationRate", color: "#8B5CF6", label: "Utilisation" },
                    ]}
                    compact
                  />
                </div>
              </div>
            )}
          </>
        ) : statsError ? (
          <>
            {/* Error placeholder cards for Row 2 */}
            <StatCard label="Patient Flow" value="——" trend="flat" status="neutral" insight="Unavailable" />
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-4">
              <div className="flex items-start justify-between mb-1">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">Revenue</span>
                <AlertTriangle size={13} style={{ color: brand.warning }} />
              </div>
              <span className="text-[28px] font-bold text-navy/20 leading-none">——</span>
              <p className="text-[12px] text-muted mt-1">avg/session</p>
            </div>
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">Compliance</span>
                <AlertTriangle size={13} style={{ color: brand.warning }} />
              </div>
              <div className="mb-3">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-[11px] font-medium text-navy">HEP assigned</span>
                  <span className="text-[11px] font-bold text-navy/20">——</span>
                </div>
                <div className="h-[4px] bg-cloud-dark rounded-full" />
              </div>
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-[11px] font-medium text-navy">Course completion</span>
                  <span className="text-[11px] font-bold text-navy/20">——</span>
                </div>
                <div className="h-[4px] bg-cloud-dark rounded-full" />
              </div>
            </div>
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-4">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">6-Week Trend</span>
              <p className="text-[10px] text-muted mb-2">Rolling performance</p>
              <div className="h-[100px] flex items-center justify-center">
                <p className="text-[11px] text-muted/40 italic">No trend data available</p>
              </div>
            </div>
          </>
        ) : null}
      </motion.section>

      {/* ── Clinician summary table ───────────────────────────────────────── */}
      {!loading && !isClinicianView && clinicianRows.length > 0 && (
        <motion.div {...staggerItem(0.26)}>
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
