"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

import { useAuth } from "@/hooks/useAuth";
import { useOwnerSummary, type OwnerSummaryPeriod } from "@/hooks/useOwnerSummary";
import { useProgress } from "@/components/TopProgressBar";
import ErrorBanner from "@/components/ui/ErrorBanner";
import RevenueTile from "@/components/owner-summary/RevenueTile";
import TodayTile from "@/components/owner-summary/TodayTile";
import RetentionTile from "@/components/owner-summary/RetentionTile";
import UtilisationTile from "@/components/owner-summary/UtilisationTile";
import EventsActionedByPulseTile from "@/components/intelligence/EventsActionedByPulseTile";
import InsightFeed from "@/components/intelligence/InsightFeed";
import { GlassCard } from "@/components/ui/GlassCard";
import Link from "next/link";
import { Lightbulb, ArrowRight } from "lucide-react";
import { brand } from "@/lib/brand";
import { DURATION, EASING, useSlidingPill } from "@/lib/motion";
import { getTimeGreeting } from "@/lib/greeting";
import { TrendStrip } from "@/components/dashboard/TrendStrip";
import SectionLabel from "@/components/ui/SectionLabel";

type Period = OwnerSummaryPeriod;

const PERIODS: { id: Period; label: string; appointmentLabel: string; revenueLabel: string }[] = [
  { id: "today", label: "Today", appointmentLabel: "appointments today", revenueLabel: "Today" },
  { id: "7d",    label: "7d",    appointmentLabel: "appointments this week", revenueLabel: "Last 7 days" },
  { id: "30d",   label: "30d",   appointmentLabel: "appointments this month", revenueLabel: "Last 30 days" },
  { id: "90d",   label: "90d",   appointmentLabel: "appointments this quarter", revenueLabel: "Last 90 days" },
];

function TimeframeSegment({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const activeIndex = PERIODS.findIndex((o) => o.id === value);
  const { pillStyle } = useSlidingPill(activeIndex, PERIODS.length);

  return (
    <div
      className="bg-navy/[0.04] border border-navy/10 dark:bg-white/[0.04] dark:border-white/10"
      style={{
        position: "relative",
        display: "inline-flex",
        padding: 3,
        borderRadius: 50,
        backdropFilter: "blur(20px)",
      }}
    >
      <div
        className="bg-white dark:bg-white/[0.10]"
        style={{
          position: "absolute",
          top: 3,
          bottom: 3,
          borderRadius: 50,
          boxShadow:
            "0 2px 12px rgba(11, 37, 69, 0.18), 0 1px 3px rgba(11, 37, 69, 0.12), inset 0 1px 0 rgba(255,255,255,0.4)",
          zIndex: 0,
          border: "1px solid rgba(255,255,255,0.18)",
          ...pillStyle,
        }}
      />
      {PERIODS.map((o, i) => {
        const active = activeIndex === i;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={active ? "text-navy dark:text-white" : "text-muted/80 dark:text-white/45 hover:text-navy/80 dark:hover:text-white/75"}
            style={{
              position: "relative",
              zIndex: 1,
              padding: "7px 22px",
              borderRadius: 50,
              border: "none",
              background: "transparent",
              fontWeight: active ? 600 : 500,
              fontSize: 12.5,
              letterSpacing: 0.3,
              cursor: "pointer",
              transition: `color ${DURATION.pill}ms ${EASING}`,
              minWidth: 72,
              textAlign: "center",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const staggerItem = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay },
});

function useTickingGreeting(firstName?: string): string {
  const [phrase, setPhrase] = useState(() => getTimeGreeting(firstName));
  useEffect(() => {
    const recompute = () => setPhrase(getTimeGreeting(firstName));
    // Tick every minute so the greeting flips when the time band changes.
    const id = setInterval(recompute, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") recompute();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [firstName]);
  return phrase;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { startLoading, stopLoading } = useProgress();
  const [period, setPeriod] = useState<Period>("30d");

  const {
    revenueMtdPence,
    todayTotal,
    todayDnas,
    retentionAlerts,
    retentionAlertCount,
    clinicianUtilisation,
    loading,
    error,
  } = useOwnerSummary(period);

  useEffect(() => {
    if (loading) {
      startLoading();
      return () => stopLoading();
    }
  }, [loading, startLoading, stopLoading]);

  const showOnboardingBanner = (() => {
    if (!user?.clinicProfile) return false;
    const clinic = user.clinicProfile;
    const dpaAccepted = !!clinic.compliance?.dpaAcceptedAt;
    return clinic.status === "onboarding" && !dpaAccepted && user.role === "owner";
  })();

  const clinicName = user?.clinicProfile?.name ?? "Your clinic";
  const greeting = useTickingGreeting(user?.firstName);

  const periodConfig = PERIODS.find((p) => p.id === period) ?? PERIODS[2];

  return (
    <div className="space-y-6">
      {/* Onboarding banner */}
      {showOnboardingBanner && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-blue/3 border border-blue/10">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue/8 flex items-center justify-center text-blue text-[10px] font-bold">!</div>
            <p className="text-xs font-medium text-navy">Finish setting up your clinic</p>
          </div>
          <a href="/onboarding" className="btn-primary" style={{ padding: "6px 18px", fontSize: 11 }}>
            Continue &rarr;
          </a>
        </div>
      )}

      {/* Header + timeframe segment */}
      <motion.div
        className="flex items-end justify-between gap-6 flex-wrap"
        {...staggerItem(0)}
      >
        <div>
          <SectionLabel className="mb-1.5">Dashboard</SectionLabel>
          <h1 className="font-display text-navy dark:text-white text-[32px] leading-[1.05] tracking-[-0.6px]">
            {greeting}
          </h1>
          <p className="text-[13px] mt-1.5 text-muted dark:text-white/55 font-medium">
            {clinicName} · {periodConfig.revenueLabel}
          </p>
        </div>
        <TimeframeSegment value={period} onChange={setPeriod} />
      </motion.div>

      {/* Error state */}
      {error && <ErrorBanner message={error} />}

      {/* Four-tile grid — 2x2 at lg, single row only on xl+ (avoids narrow Utilisation crush) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <RevenueTile
          revenueMtdPence={revenueMtdPence}
          periodLabel={periodConfig.revenueLabel}
          loading={loading}
        />
        <TodayTile
          todayTotal={todayTotal}
          todayDnas={todayDnas}
          periodLabel={periodConfig.appointmentLabel}
          loading={loading}
        />
        <RetentionTile alerts={retentionAlerts} alertCount={retentionAlertCount} loading={loading} />
        <UtilisationTile rows={clinicianUtilisation} loading={loading} />
      </div>

      {/* Operational row: cross-module activity (left) + actionable insights (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <EventsActionedByPulseTile />
        </div>
        <div className="lg:col-span-2">
          <GlassCard
            variant="standard"
            tint="intelligence"
            className="p-5"
            style={{ background: "var(--surface-tile)", minHeight: 220 }}
            as="section"
          >
            <header className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full inline-flex items-center justify-center"
                  style={{ background: `${brand.purple}22`, color: brand.purple }}
                >
                  <Lightbulb size={12} />
                </span>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-navy/70 dark:text-white/55">
                  Insights to action
                </h2>
              </div>
              <Link
                href="/intelligence"
                className="flex items-center gap-1 text-[11.5px] font-semibold hover:opacity-100 opacity-75 transition-opacity"
                style={{ color: brand.purple }}
              >
                Open Intelligence
                <ArrowRight size={11} />
              </Link>
            </header>
            <InsightFeed />
          </GlassCard>
        </div>
      </div>

      {/* Clinic Pulse strip — 12-week sparkline trend for key metrics */}
      <motion.div {...staggerItem(0.25)}>
        <div className="mb-3 flex items-center gap-2">
          <SectionLabel>Clinic pulse</SectionLabel>
          <div
            className="h-px flex-1 opacity-30"
            style={{ background: `linear-gradient(to right, ${brand.navy}40, transparent)` }}
          />
          <p className="text-[10.5px] text-muted/50 dark:text-white/30 font-medium">
            12-week trend
          </p>
        </div>
        <TrendStrip />
      </motion.div>
    </div>
  );
}
