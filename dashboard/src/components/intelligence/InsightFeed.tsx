"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, CheckCheck, TrendingDown } from "lucide-react";
import { brand } from "@/lib/brand";
import { useInsightEvents } from "@/hooks/useInsightEvents";
import { DURATION, EASING, useMorphValue } from "@/lib/motion";
import InsightEventCard from "./InsightEventCard";
import ErrorBanner from "@/components/ui/ErrorBanner";

/**
 * Full list of recent insight events, sorted by £ revenueImpact desc so the
 * money sitting on the table sits at the top. Header surfaces the total £ at
 * risk across active critical + warning events — the owner's headline number.
 */
export default function InsightFeed() {
  const router = useRouter();
  const { events, activeEvents, markAsRead, loading, error } = useInsightEvents();
  const [showDismissed, setShowDismissed] = useState(false);

  const sortedActive = useMemo(
    () =>
      [...activeEvents].sort(
        (a, b) => (b.revenueImpact ?? 0) - (a.revenueImpact ?? 0)
      ),
    [activeEvents]
  );

  const sortedAll = useMemo(
    () =>
      [...events].sort(
        (a, b) => (b.revenueImpact ?? 0) - (a.revenueImpact ?? 0)
      ),
    [events]
  );

  const displayEvents = showDismissed ? sortedAll : sortedActive;

  const atRiskTotal = useMemo(
    () =>
      activeEvents
        .filter((e) => e.severity === "critical" || e.severity === "warning")
        .reduce((sum, e) => sum + (e.revenueImpact ?? 0), 0),
    [activeEvents]
  );
  const morphAtRisk = useMemo(() => Math.round(atRiskTotal), [atRiskTotal]);
  const morph = useMorphValue(morphAtRisk);
  const valOpacity = morph.isAnimating ? 0 : 1;
  const valDur = morph.isAnimating ? DURATION.morphOut : DURATION.morphIn;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl bg-cloud-light border border-border h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={() => router.refresh()} />;
  }

  if (events.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] bg-white surface-lit border border-border shadow-[var(--shadow-card)] p-8 text-center">
        <div
          className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
          style={{ background: `${brand.purple}12` }}
        >
          <Lightbulb size={20} style={{ color: brand.purple }} />
        </div>
        <h3 className="font-display text-lg text-navy mb-1">No insights yet</h3>
        <p className="text-sm text-muted max-w-md mx-auto">
          Intelligence will surface actionable insights here once your clinic data has been processed.
          Events are detected daily from your PMS metrics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row — £ at risk anchor + meta */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="text-[12px] font-semibold text-muted">
            {activeEvents.length} active insight{activeEvents.length !== 1 ? "s" : ""}
            {events.length > activeEvents.length && (
              <span className="text-muted/60 ml-1">
                ({events.length - activeEvents.length} dismissed)
              </span>
            )}
          </p>
          {atRiskTotal > 0 && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold tabular-nums"
              style={{
                background: `${brand.danger}14`,
                color: brand.danger,
                opacity: valOpacity,
                transition: `opacity ${valDur}ms ${EASING}`,
              }}
            >
              <TrendingDown size={11} />
              £{morph.value.toLocaleString("en-GB")} at risk
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {events.length > activeEvents.length && (
            <button
              type="button"
              onClick={() => setShowDismissed(!showDismissed)}
              className="text-[11px] font-semibold text-muted hover:text-navy transition-colors"
            >
              {showDismissed ? "Hide dismissed" : "Show dismissed"}
            </button>
          )}
        </div>
      </div>

      {/* Events list — sorted by £ impact desc */}
      <div className="space-y-3">
        {displayEvents.map((event) => (
          <InsightEventCard
            key={event.id}
            event={event}
            onMarkRead={markAsRead}
          />
        ))}
      </div>

      {displayEvents.length === 0 && showDismissed === false && (
        <div className="rounded-xl border border-border bg-cloud-light/50 p-6 text-center">
          <CheckCheck size={20} className="mx-auto mb-2 text-muted" />
          <p className="text-sm text-muted">All insights have been dismissed.</p>
        </div>
      )}
    </div>
  );
}
