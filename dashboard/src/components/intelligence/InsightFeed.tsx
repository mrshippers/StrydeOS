"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, CheckCheck } from "lucide-react";
import { brand } from "@/lib/brand";
import { useInsightEvents } from "@/hooks/useInsightEvents";
import InsightEventCard from "./InsightEventCard";
import ErrorBanner from "@/components/ui/ErrorBanner";

/**
 * Full list of recent insight events.
 * Used in the "Insights" tab on the Intelligence page.
 */
export default function InsightFeed() {
  const router = useRouter();
  const { events, activeEvents, markAsRead, loading, error } = useInsightEvents();
  const [showDismissed, setShowDismissed] = useState(false);
  const displayEvents = showDismissed ? events : activeEvents;

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
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-8 text-center">
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
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-muted">
          {activeEvents.length} active insight{activeEvents.length !== 1 ? "s" : ""}
          {events.length > activeEvents.length && (
            <span className="text-muted/60 ml-1">
              ({events.length - activeEvents.length} dismissed)
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {events.length > activeEvents.length && (
            <button
              onClick={() => setShowDismissed(!showDismissed)}
              className="text-[11px] font-semibold text-muted hover:text-navy transition-colors"
            >
              {showDismissed ? "Hide dismissed" : "Show dismissed"}
            </button>
          )}
        </div>
      </div>

      {/* Events list */}
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
