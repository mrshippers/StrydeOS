"use client";

/**
 * TrialBanner — amber bar shown across all authenticated pages during the 14-day trial.
 * Dismissable per session (no persistence needed).
 */

import { useState } from "react";
import Link from "next/link";
import { Clock, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import { brand } from "@/lib/brand";

const DISMISS_KEY = "strydeos_trial_banner_dismissed";

export default function TrialBanner() {
  const { trialActive, trialDaysRemaining } = useEntitlements();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try { return !!sessionStorage.getItem(DISMISS_KEY); }
    catch { return false; }
  });

  const isOwnerOrSuper = user?.role === "superadmin" || user?.role === "owner";
  const isDemo = user?.uid === "demo";

  if (!trialActive || dismissed || isOwnerOrSuper || isDemo) return null;

  const days = trialDaysRemaining;
  const urgent = days !== null && days <= 3;

  const label =
    days === null
      ? "Trial active"
      : days === 0
        ? "Trial ends today"
        : days === 1
          ? "1 day left in your trial"
          : `${days} days left in your trial`;

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl mb-5 text-sm"
      style={{
        background: urgent ? "rgba(245,158,11,0.10)" : "rgba(245,158,11,0.06)",
        border: urgent
          ? "1px solid rgba(245,158,11,0.30)"
          : "1px solid rgba(245,158,11,0.15)",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Clock size={13} style={{ color: brand.warning }} className="shrink-0" />
        <span className="text-[12px] font-medium truncate" style={{ color: brand.warning }}>
          {label}
          <span
            className="font-normal ml-1 hidden sm:inline"
            style={{ color: "rgba(245,158,11,0.60)" }}
          >
            — all modules unlocked, no card required.
          </span>
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/billing"
          className="text-[11px] font-semibold whitespace-nowrap transition-opacity hover:opacity-75"
          style={{ color: brand.warning }}
        >
          Upgrade →
        </Link>
        <button
          onClick={() => {
            try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignored */ }
            setDismissed(true);
          }}
          aria-label="Dismiss trial banner"
          className="transition-opacity hover:opacity-75"
          style={{ color: "rgba(245,158,11,0.45)" }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
