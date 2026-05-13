"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { AlertTriangle } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useOwnerSummary } from "@/hooks/useOwnerSummary";
import { useProgress } from "@/components/TopProgressBar";
import ErrorBanner from "@/components/ui/ErrorBanner";
import RevenueTile from "@/components/owner-summary/RevenueTile";
import TodayTile from "@/components/owner-summary/TodayTile";
import RetentionTile from "@/components/owner-summary/RetentionTile";
import UtilisationTile from "@/components/owner-summary/UtilisationTile";
import DemoBanner from "@/components/ui/DemoBanner";

const staggerItem = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay },
});

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { startLoading, stopLoading } = useProgress();

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

  const firstName = user?.firstName ?? "";
  const greeting = firstName ? `Good to see you, ${firstName}` : "Overview";

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

      {/* Header */}
      <motion.div {...staggerItem(0)}>
        <h1 className="font-display text-navy/90 text-[28px] leading-tight tracking-[-0.5px]">
          {greeting}.
        </h1>
        <p className="text-[13px] text-muted mt-1">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </motion.div>

      {/* Error state */}
      {error && <ErrorBanner message={error} />}

      {/* Four-tile grid */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        {...staggerItem(0.05)}
      >
        <RevenueTile revenueMtdPence={revenueMtdPence} loading={loading} />
        <TodayTile todayTotal={todayTotal} todayDnas={todayDnas} loading={loading} />
        <RetentionTile alerts={retentionAlerts} alertCount={retentionAlertCount} loading={loading} />
        <UtilisationTile rows={clinicianUtilisation} loading={loading} />
      </motion.div>
    </div>
  );
}
