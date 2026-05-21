"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

import { useAuth } from "@/hooks/useAuth";
import { useOwnerSummary } from "@/hooks/useOwnerSummary";
import { useProgress } from "@/components/TopProgressBar";
import ErrorBanner from "@/components/ui/ErrorBanner";
import RevenueTile from "@/components/owner-summary/RevenueTile";
import TodayTile from "@/components/owner-summary/TodayTile";
import RetentionTile from "@/components/owner-summary/RetentionTile";
import UtilisationTile from "@/components/owner-summary/UtilisationTile";
import DemoBanner from "@/components/ui/DemoBanner";
import { brand } from "@/lib/brand";
import { DURATION, EASING, useSlidingPill } from "@/lib/motion";
import { getTimeGreeting } from "@/lib/greeting";

type Period = "today" | "7d" | "30d" | "90d";

const PERIODS: { id: Period; label: string; revenueScale: number; todayScale: number; appointmentLabel: string; revenueLabel: string }[] = [
  { id: "today", label: "Today", revenueScale: 1 / 30, todayScale: 1, appointmentLabel: "appointments today", revenueLabel: "Today" },
  { id: "7d", label: "7d", revenueScale: 7 / 30, todayScale: 6.8, appointmentLabel: "appointments this week", revenueLabel: "Last 7 days" },
  { id: "30d", label: "30d", revenueScale: 1, todayScale: 28, appointmentLabel: "appointments this month", revenueLabel: "Month to date" },
  { id: "90d", label: "90d", revenueScale: 3, todayScale: 85, appointmentLabel: "appointments this quarter", revenueLabel: "Last 90 days" },
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
    usedDemo,
  } = useOwnerSummary();

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
  const scaledRevenuePence = Math.round(revenueMtdPence * periodConfig.revenueScale);
  const scaledTodayTotal = Math.round(todayTotal * periodConfig.todayScale);

  return (
    <div className="space-y-6">
      {/* Onboarding banner */}
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

      {/* Demo banner */}
      {usedDemo && <DemoBanner />}

      {/* Header + timeframe segment */}
      <motion.div
        className="flex items-end justify-between gap-6 flex-wrap"
        {...staggerItem(0)}
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted/80 dark:text-white/40 mb-1.5">
            Dashboard
          </p>
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
          revenueMtdPence={scaledRevenuePence}
          periodLabel={periodConfig.revenueLabel}
          loading={loading}
        />
        <TodayTile
          todayTotal={scaledTodayTotal}
          todayDnas={todayDnas}
          periodLabel={periodConfig.appointmentLabel}
          loading={loading}
        />
        <RetentionTile alerts={retentionAlerts} alertCount={retentionAlertCount} loading={loading} />
        <UtilisationTile rows={clinicianUtilisation} loading={loading} />
      </div>
    </div>
  );
}
