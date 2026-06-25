"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Lightbulb,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { brand } from "@/lib/brand";
import { GlassCard } from "@/components/ui/GlassCard";
import { useInsightEvents } from "@/hooks/useInsightEvents";
import { useClinicians } from "@/hooks/useClinicians";
import {
  EVENT_TO_SEQUENCE,
  type InsightEvent,
  type InsightSeverity,
} from "@/types/insight-events";

/**
 * Compact dashboard surface for "Insights to action".
 *
 * Deliberately NOT the full InsightFeed (which lives on /intelligence and stays
 * untouched). This is a contained, scannable card: the top three active insights
 * as tidy rows with a soft per-severity glow accent, a single amber "£ at risk"
 * anchor, and a clear route into Intelligence to action the rest. No full-bleed
 * list, no flat-red click state.
 */

const SEV: Record<InsightSeverity, { color: string; icon: typeof AlertCircle }> = {
  critical: { color: brand.danger, icon: AlertCircle },
  warning: { color: brand.warning, icon: AlertTriangle },
  positive: { color: brand.success, icon: CheckCircle2 },
};

const MAX_ROWS = 3;

function rowHref(event: InsightEvent): string {
  return !event.dismissedAt && !event.resolvedAt && EVENT_TO_SEQUENCE[event.type]
    ? `/continuity?event=${event.id}`
    : "/intelligence";
}

function InsightRow({ event }: { event: InsightEvent }) {
  const sev = SEV[event.severity];
  const SevIcon = sev.icon;
  const isUnread = !event.readAt;
  const impact = event.revenueImpact ?? 0;

  return (
    <Link
      href={rowHref(event)}
      className="group/row flex items-center gap-3 rounded-xl px-3 py-2.5 border border-transparent
                 transition-colors duration-200
                 hover:bg-navy/[0.035] hover:border-navy/10
                 dark:hover:bg-white/[0.05] dark:hover:border-white/10
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple/30"
    >
      {/* Severity accent: soft glow dot, never a flat fill */}
      <span
        className="relative shrink-0 w-7 h-7 rounded-lg inline-flex items-center justify-center"
        style={{
          background: `${sev.color}14`,
          boxShadow: `0 0 0 1px ${sev.color}22, 0 0 14px -2px ${sev.color}55`,
        }}
      >
        <SevIcon size={13} style={{ color: sev.color }} />
      </span>

      <span className="flex-1 min-w-0">
        <span
          className={`block text-[12.5px] leading-snug truncate ${
            isUnread
              ? "font-semibold text-navy dark:text-white"
              : "font-medium text-navy/70 dark:text-white/60"
          }`}
        >
          {event.title}
        </span>
        {impact > 0 && (
          <span
            className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold tabular-nums"
            style={{ color: brand.warning }}
          >
            <TrendingDown size={9} />~£{impact.toLocaleString("en-GB")} at risk
          </span>
        )}
      </span>

      <ChevronRight
        size={15}
        className="shrink-0 text-navy/25 dark:text-white/25 transition-transform duration-200 group-hover/row:translate-x-0.5 group-hover/row:text-navy/45 dark:group-hover/row:text-white/45"
      />
    </Link>
  );
}

export default function InsightsActionCard() {
  const { events, activeEvents, loading } = useInsightEvents();
  const { clinicians } = useClinicians();

  // Seat gate — mirror InsightFeed: only this clinic's active-seat events plus
  // clinic-level events (no clinicianId). Falls back to all while roster loads.
  const seatIds = useMemo(() => new Set(clinicians.map((c) => c.id)), [clinicians]);
  const isSeatEvent = useMemo(
    () => (e: { clinicianId?: string }) =>
      !e.clinicianId || seatIds.size === 0 || seatIds.has(e.clinicianId),
    [seatIds]
  );

  const scopedActive = useMemo(
    () => activeEvents.filter(isSeatEvent),
    [activeEvents, isSeatEvent]
  );
  const scopedAll = useMemo(() => events.filter(isSeatEvent), [events, isSeatEvent]);

  const sorted = useMemo(
    () => [...scopedActive].sort((a, b) => (b.revenueImpact ?? 0) - (a.revenueImpact ?? 0)),
    [scopedActive]
  );

  const atRiskTotal = useMemo(
    () =>
      scopedActive
        .filter((e) => e.severity === "critical" || e.severity === "warning")
        .reduce((sum, e) => sum + (e.revenueImpact ?? 0), 0),
    [scopedActive]
  );

  const topRows = sorted.slice(0, MAX_ROWS);
  const overflow = sorted.length - topRows.length;

  return (
    <GlassCard
      variant="standard"
      tint="intelligence"
      as="section"
      className="p-5 flex flex-col"
      style={{ background: "var(--surface-tile)", minHeight: 220 }}
      aria-label="Insights to action"
    >
      <header className="flex items-center justify-between gap-3 mb-3">
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
          className="flex items-center gap-1 text-[11.5px] font-semibold opacity-75 hover:opacity-100 transition-opacity shrink-0"
          style={{ color: brand.purple }}
        >
          Open Intelligence
          <ArrowRight size={11} />
        </Link>
      </header>

      {/* Anchor row: active count + soft amber £-at-risk pill */}
      {!loading && scopedActive.length > 0 && (
        <div className="flex items-center gap-2.5 mb-3 flex-wrap">
          <span className="text-[11.5px] font-semibold text-navy/65 dark:text-white/55 tabular-nums">
            {scopedActive.length} active insight{scopedActive.length !== 1 ? "s" : ""}
          </span>
          {atRiskTotal > 0 && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tabular-nums"
              style={{
                color: brand.warning,
                background: `${brand.warning}14`,
                boxShadow: `0 0 0 1px ${brand.warning}26, 0 0 16px -3px ${brand.warning}66`,
              }}
            >
              <TrendingDown size={11} />£{atRiskTotal.toLocaleString("en-GB")} at risk
            </span>
          )}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl h-[52px]"
              style={{ background: `${brand.purple}10` }}
            />
          ))}
        </div>
      ) : scopedAll.length === 0 || scopedActive.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-4">
          <span
            className="w-10 h-10 rounded-full inline-flex items-center justify-center"
            style={{ background: `${brand.teal}14`, color: brand.teal }}
          >
            <CheckCircle2 size={18} />
          </span>
          <p className="text-[12.5px] font-medium text-navy/70 dark:text-white/60">
            {scopedAll.length === 0 ? "No insights yet" : "Nothing needs actioning"}
          </p>
          <p className="text-[11.5px] text-navy/45 dark:text-white/35 max-w-[34ch]">
            {scopedAll.length === 0
              ? "Intelligence surfaces actionable insights here once your clinic data is processed."
              : "All active insights are clear. New ones appear as they are detected."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 -mx-1">
          {topRows.map((event) => (
            <InsightRow key={event.id} event={event} />
          ))}

          {overflow > 0 && (
            <Link
              href="/intelligence"
              className="mt-1 mx-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-semibold
                         text-navy/60 dark:text-white/55 hover:text-navy/90 dark:hover:text-white/85
                         bg-navy/[0.025] dark:bg-white/[0.04] hover:bg-navy/[0.05] dark:hover:bg-white/[0.07]
                         transition-colors"
            >
              <Sparkles size={11} style={{ color: brand.purple }} />
              {overflow} more insight{overflow !== 1 ? "s" : ""} in Intelligence
            </Link>
          )}
        </div>
      )}
    </GlassCard>
  );
}
