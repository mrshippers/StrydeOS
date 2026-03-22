"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle, Lightbulb } from "lucide-react";
import type { WeeklyStats } from "@/types";
import { brand } from "@/lib/brand";

interface InsightNudgeProps {
  stats: WeeklyStats | null;
  previousStats: WeeklyStats | null;
}

const DISMISS_KEY = "strydeos_insight_dismissed";

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function computeInsight(
  stats: WeeklyStats,
  previous: WeeklyStats | null
): string | null {
  // DNA rate more than 2× week average (vs previous)
  if (previous && stats.dnaRate > previous.dnaRate * 2 && stats.dnaRate > 0.10) {
    return `DNA rate is ${Math.round(stats.dnaRate * 100)}% this week — more than double last week's ${Math.round(previous.dnaRate * 100)}%. Consider sending additional reminders before afternoon slots.`;
  }

  // Follow-up rate below target for current clinician
  if (stats.followUpRate < stats.followUpTarget * 0.85) {
    return `Follow-up rate (${stats.followUpRate.toFixed(1)}) is running below target (${stats.followUpTarget.toFixed(1)}). Review rebooking prompts in Pulse to close the gap.`;
  }

  // HEP compliance below 50%
  const hepRate = stats.hepComplianceRate ?? stats.hepRate;
  if (hepRate < 0.5) {
    return `HEP programme assignment is at ${Math.round(hepRate * 100)}% — below half of patients seen. Programme assignment at first contact is one of the highest-leverage retention levers.`;
  }

  // Revenue below previous week
  if (
    previous &&
    stats.revenuePerSessionPence > 0 &&
    stats.revenuePerSessionPence < previous.revenuePerSessionPence * 0.95
  ) {
    const drop = Math.round(
      ((previous.revenuePerSessionPence - stats.revenuePerSessionPence) /
        previous.revenuePerSessionPence) *
        100
    );
    return `Revenue per session is down ${drop}% week-on-week. Check for DNA-heavy sessions or missed billing.`;
  }

  // All good
  return null;
}

export default function InsightNudge({ stats, previousStats }: InsightNudgeProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden, resolve on mount

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (stored === getTodayKey()) {
        setDismissed(true);
      } else {
        setDismissed(false);
      }
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!stats || dismissed) return null;

  const insight = computeInsight(stats, previousStats);
  const message = insight ?? "All metrics are on track this week. Keep it up.";
  const isAllGood = !insight;

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, getTodayKey());
    } catch {
      // localStorage unavailable
    }
    setDismissed(true);
  }

  return (
    <div
      className="rounded-[var(--radius-card)] px-5 py-4 flex items-start gap-3"
      style={{
        background: isAllGood ? "rgba(5,150,105,0.04)" : "rgba(28,84,242,0.04)",
        border: isAllGood ? "1px solid rgba(5,150,105,0.10)" : "1px solid rgba(28,84,242,0.10)",
        borderLeft: `3px solid ${isAllGood ? brand.success : brand.blue}`,
      }}
    >
      {isAllGood
        ? <CheckCircle size={16} className="text-success shrink-0 mt-0.5" />
        : <Lightbulb size={16} className="text-blue shrink-0 mt-0.5" />
      }
      <p className="text-sm text-muted flex-1 leading-relaxed">{message}</p>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-muted/70 hover:text-muted transition-colors mt-0.5"
        aria-label="Dismiss insight"
      >
        <X size={14} />
      </button>
    </div>
  );
}
