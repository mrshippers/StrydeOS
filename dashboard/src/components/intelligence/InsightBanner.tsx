"use client";

import { useState } from "react";
import Link from "next/link";
import {
  X,
  TrendingDown,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { brand } from "@/lib/brand";
import { useAuth } from "@/hooks/useAuth";
import { useInsightEvents } from "@/hooks/useInsightEvents";
import type { InsightSeverity } from "@/types/insight-events";
import { GlassCard } from "@/components/ui/GlassCard";

const SEVERITY_BAR: Record<InsightSeverity, string> = {
  critical: brand.danger,
  warning: brand.warning,
  positive: brand.success,
};

const SEVERITY_ICON: Record<InsightSeverity, typeof AlertCircle> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  positive: CheckCircle2,
};

/**
 * Full-width banner for the main dashboard page.
 * Shows the single highest-ranked unread insight event.
 * Sits above the stat cards grid.
 */
export default function InsightBanner() {
  const { user } = useAuth();
  const { topUnread, unreadCount, dismiss, markAsRead } = useInsightEvents();
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());

  if (!topUnread || localDismissed.has(topUnread.id)) return null;

  const sev = topUnread.severity;
  const barColor = SEVERITY_BAR[sev];
  const SevIcon = SEVERITY_ICON[sev];

  function handleDismiss() {
    setLocalDismissed((prev) => new Set(prev).add(topUnread!.id));
    dismiss(topUnread!.id);
  }

  function handleClick() {
    if (!topUnread!.readAt) markAsRead(topUnread!.id);
  }

  return (
    <GlassCard
      variant="primary"
      tint="intelligence"
      onClick={handleClick}
    >
      <div className="flex">
        {/* Severity colour bar */}
        <div className="w-1 shrink-0" style={{ background: barColor }} />

        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${barColor}12` }}
              >
                <SevIcon size={14} style={{ color: barColor }} />
              </div>

              <div className="min-w-0">
                {(() => {
                  const isOwnerOrAdmin = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";
                  const narrative = isOwnerOrAdmin
                    ? topUnread.ownerNarrative
                    : topUnread.clinicianNarrative;

                  if (narrative) {
                    return (
                      <p className="text-[13px] text-navy leading-relaxed">
                        {narrative}
                      </p>
                    );
                  }

                  return (
                    <>
                      <p className="text-[14px] font-semibold text-navy leading-snug">
                        {topUnread.title}
                      </p>
                      <p className="text-[12px] text-muted mt-1">
                        → {topUnread.suggestedAction}
                      </p>
                    </>
                  );
                })()}

                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {topUnread.revenueImpact != null && topUnread.revenueImpact > 0 && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{
                        background: `${brand.danger}12`,
                        color: brand.danger,
                      }}
                    >
                      <TrendingDown size={10} />
                      ~£{topUnread.revenueImpact.toLocaleString()} estimated impact
                    </span>
                  )}

                  <Link
                    href="/intelligence"
                    className="inline-flex items-center gap-1 text-[12px] font-semibold hover:underline"
                    style={{ color: brand.purple }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    View all insights
                    <ArrowRight size={11} />
                    {unreadCount > 1 && (
                      <span className="ml-1 text-[10px] text-muted font-normal">
                        (+{unreadCount - 1} more)
                      </span>
                    )}
                  </Link>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
              className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-navy hover:bg-cloud-light transition-colors"
              aria-label="Dismiss insight"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
