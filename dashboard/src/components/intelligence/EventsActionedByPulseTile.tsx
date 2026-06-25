"use client";

/**
 * Pulse Impact (7d) - the ROI translation of cross-module Pulse activity.
 *
 * Owners pay for outcomes, not event counts. This tile sums what Pulse
 * actually recovered for them this week (from `revenueImpact` on each
 * actioned event, with a per-action fallback) and shows:
 *  - £ recovered, big and morphing
 *  - a 7-day sparkline of action volume
 *  - breakdown of rebook nudges vs retention saves
 *  - the latest action (patient initial + relative time)
 *
 * Replaces the prior "17 events actioned" tile which surfaced an internal
 * metric without the £ translation an owner cares about.
 */

import Link from "next/link";
import { useEventsActionedByPulse } from "@/hooks/useEventsActionedByPulse";
import { useConnections } from "@/hooks/useConnections";
import { brand } from "@/lib/brand";
import { DURATION, EASING, useMorphValue } from "@/lib/motion";
import { Zap, ArrowRight } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function patientInitial(name?: string): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return `${first}${last ?? ""}`.toUpperCase() || "·";
}

function Sparkline({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1);
  return (
    <svg
      viewBox="0 0 140 28"
      width="100%"
      height="28"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {counts.map((c, i) => {
        const h = (c / max) * 22;
        const x = i * 20;
        const opacity = c === 0 ? 0.18 : 0.55 + (c / max) * 0.45;
        return (
          <rect
            key={i}
            x={x}
            y={28 - h - 2}
            width={14}
            height={Math.max(h, 2)}
            rx={2}
            fill={brand.teal}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

export default function EventsActionedByPulseTile() {
  const { count, recoveredPounds, revenueLabel, dailyCounts, breakdown, latest, loading } =
    useEventsActionedByPulse();
  const { sources, loading: connectionsLoading } = useConnections();

  const morphRecovered = useMorphValue(recoveredPounds);
  const morphCount = useMorphValue(count);
  const valOpacity = morphRecovered.isAnimating ? 0 : 1;
  const valDur = morphRecovered.isAnimating ? DURATION.morphOut : DURATION.morphIn;

  if (loading || connectionsLoading) return null;

  const hasData = count > 0;
  const anyConnected = sources.some((s) => s.connected);
  // A fresh clinic with nothing connected and no actions has no live source to
  // report on - render nothing rather than an empty tile.
  if (!hasData && !anyConnected) return null;
  const showRevenue = revenueLabel !== "count-only";

  return (
    <GlassCard
      variant="hero"
      tint="pulse"
      as="section"
      className="p-5 flex flex-col gap-4"
      style={{ background: "var(--surface-tile)", minHeight: 220 }}
      aria-label="Pulse impact, last 7 days"
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full inline-flex items-center justify-center"
            style={{ background: `${brand.teal}22`, color: brand.teal }}
          >
            <Zap size={12} />
          </span>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-navy/70 dark:text-white/55">
            Pulse Impact · 7 days
          </span>
        </div>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: `${brand.teal}1A`, color: brand.teal }}
        >
          PULSE
        </span>
      </header>

      <div className="flex flex-col gap-1">
        {showRevenue ? (
          <p
            className="font-display text-[40px] leading-none tabular-nums text-navy dark:text-white"
            style={{ opacity: valOpacity, transition: `opacity ${valDur}ms ${EASING}` }}
          >
            £{morphRecovered.value.toLocaleString("en-GB")}
          </p>
        ) : (
          <p
            className="font-display text-[40px] leading-none tabular-nums text-navy dark:text-white"
            style={{ opacity: valOpacity, transition: `opacity ${valDur}ms ${EASING}` }}
          >
            {morphCount.value}
          </p>
        )}
        <p
          className="text-[12px] text-navy/70 dark:text-white/55 tracking-wide"
          style={{
            opacity: valOpacity,
            transition: `opacity ${valDur}ms ${EASING} ${DURATION.subtitleDelay}ms`,
          }}
        >
          {showRevenue
            ? revenueLabel === "estimated"
              ? "estimated recovery by Pulse this week"
              : "recovered by Pulse this week"
            : "actions by Pulse this week"}
        </p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex-1">
          <Sparkline counts={dailyCounts} />
          <div className="flex justify-between text-[9px] text-navy/50 dark:text-white/35 mt-1 tracking-wider uppercase">
            <span>6d</span>
            <span>5d</span>
            <span>4d</span>
            <span>3d</span>
            <span>2d</span>
            <span>1d</span>
            <span>today</span>
          </div>
        </div>
      </div>

      {hasData && (
        <div className="flex flex-col gap-1.5 pt-1 border-t border-white/[0.06]">
          {breakdown.rebooks > 0 && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-navy/80 dark:text-white/70">
                {breakdown.rebooks} rebook nudge{breakdown.rebooks === 1 ? "" : "s"}
              </span>
            </div>
          )}
          {breakdown.retention > 0 && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-navy/80 dark:text-white/70">
                {breakdown.retention} retention save{breakdown.retention === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>
      )}

      {latest && (
        <Link
          href="/continuity"
          className="flex items-center justify-between gap-2 pt-2 -mb-1 text-[11.5px] hover:opacity-100 opacity-75 transition-opacity group"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span
              className="w-5 h-5 rounded-full shrink-0 inline-flex items-center justify-center text-[9px] font-bold text-navy dark:text-white"
              style={{ background: `${brand.teal}66` }}
            >
              {patientInitial(latest.patientName)}
            </span>
            <span className="text-navy/75 dark:text-white/65 truncate">
              Last action: <span className="text-navy/90 dark:text-white/85">{timeAgo(latest.createdAt)}</span>
              {latest.patientName ? ` · ${latest.patientName.split(" ")[0]}` : ""}
            </span>
          </span>
          <span
            className="flex items-center gap-1 text-[11px] font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform"
            style={{ color: brand.teal }}
          >
            Open Pulse
            <ArrowRight size={11} />
          </span>
        </Link>
      )}

      {!hasData && (
        <p className="text-[12px] text-navy/60 dark:text-white/45 italic">
          No actions yet this week. Pulse activates automatically when Intelligence emits an event.
          <span className="text-navy/45 dark:text-white/30 ml-1 tabular-nums">({morphCount.value} events)</span>
        </p>
      )}
    </GlassCard>
  );
}
