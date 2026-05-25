"use client";

import { useMemo } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useWeeklyTrend } from "@/hooks/useWeeklyTrend";
import { brand, hexToRgba } from "@/lib/brand";

// ─── Sparkline ────────────────────────────────────────────────────────────────

const VIEWBOX_W = 120;
const VIEWBOX_H = 40;
const PADDING = 2;

function buildSparklinePath(values: number[]): {
  linePath: string;
  areaPath: string;
} {
  if (values.length < 2) return { linePath: "", areaPath: "" };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const drawW = VIEWBOX_W - PADDING * 2;
  const drawH = VIEWBOX_H - PADDING * 2;

  const points = values.map((v, i) => ({
    x: PADDING + (i / (values.length - 1)) * drawW,
    y: PADDING + (1 - (v - min) / range) * drawH,
  }));

  // Catmull-Rom to cubic Bezier for smooth curve
  const d: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }

  const last = points[points.length - 1];
  const first = points[0];
  const areaPath =
    d.join(" ") +
    ` L ${last.x} ${VIEWBOX_H} L ${first.x} ${VIEWBOX_H} Z`;

  return { linePath: d.join(" "), areaPath };
}

interface SparklineProps {
  values: number[];
  color: string;
  gradientId: string;
  empty?: boolean;
}

function Sparkline({ values, color, gradientId, empty }: SparklineProps) {
  const { linePath, areaPath } = useMemo(
    () => (empty ? { linePath: "", areaPath: "" } : buildSparklinePath(values)),
    [values, empty]
  );

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      width="100%"
      height={VIEWBOX_H}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {empty ? (
        // Placeholder flat line when no data
        <line
          x1={PADDING}
          y1={VIEWBOX_H / 2}
          x2={VIEWBOX_W - PADDING}
          y2={VIEWBOX_H / 2}
          stroke={color}
          strokeOpacity={0.2}
          strokeWidth={1.5}
          strokeDasharray="3 4"
        />
      ) : (
        <>
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

// ─── Delta badge ──────────────────────────────────────────────────────────────

function deltaBadge(
  current: number,
  reference: number,
  higherIsBetter: boolean,
  unit: "pp" | "x" | "%"
): { text: string; positive: boolean } | null {
  if (reference === 0) return null;
  const raw = current - reference;
  const abs = Math.abs(raw);
  const isImprovement = higherIsBetter ? raw > 0 : raw < 0;
  const sign = raw >= 0 ? "+" : "-";
  let formatted: string;
  if (unit === "x") {
    formatted = `${sign}${abs.toFixed(1)}x`;
  } else if (unit === "pp") {
    formatted = `${sign}${(abs * 100).toFixed(1)}pp`;
  } else {
    formatted = `${sign}${(abs * 100).toFixed(1)}%`;
  }
  return { text: `${formatted} vs 4w`, positive: isImprovement };
}

// ─── Single metric card ───────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  color: string;
  gradientId: string;
  sparkValues: number[];
  delta: { text: string; positive: boolean } | null;
  empty: boolean;
  tint: "ava" | "pulse" | "intelligence";
}

function MetricCard({
  label,
  value,
  color,
  gradientId,
  sparkValues,
  delta,
  empty,
  tint,
}: MetricCardProps) {
  return (
    <GlassCard
      variant="standard"
      tint={tint}
      className="p-5"
      style={{ background: "var(--surface-tile)" }}
      as="article"
    >
      {/* Label */}
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-3"
        style={{ color: hexToRgba(color, 0.75) }}
      >
        {label}
      </p>

      {/* Value + delta */}
      <div className="flex items-end justify-between gap-2 mb-3">
        <span
          className="font-display text-[28px] leading-none tracking-[-0.5px]"
          style={{
            color: empty
              ? "var(--color-muted, #5C6370)"
              : "var(--color-navy, #0B2545)",
          }}
        >
          {empty ? "--" : value}
        </span>
        {delta && !empty && (
          <span
            className="text-[11px] font-semibold rounded-full px-2 py-0.5 mb-0.5"
            style={{
              color: delta.positive ? brand.success : brand.danger,
              background: delta.positive
                ? hexToRgba(brand.success, 0.1)
                : hexToRgba(brand.danger, 0.1),
            }}
          >
            {delta.text}
          </span>
        )}
      </div>

      {/* Sparkline */}
      <div style={{ marginLeft: -2, marginRight: -2 }}>
        <Sparkline
          values={sparkValues}
          color={color}
          gradientId={gradientId}
          empty={empty}
        />
      </div>

      {empty && (
        <p className="text-[11px] text-muted/60 dark:text-white/30 mt-2">
          Awaiting weekly data
        </p>
      )}
    </GlassCard>
  );
}

// ─── TrendStrip ───────────────────────────────────────────────────────────────

export function TrendStrip() {
  const { weeks, loading } = useWeeklyTrend(12);

  const isEmpty = !loading && weeks.length === 0;
  const hasData = weeks.length >= 2;

  // Extract series values
  const followUpValues = weeks.map((w) => w.followUpRate);
  const hepValues = weeks.map((w) => w.hepComplianceRate);
  const dnaValues = weeks.map((w) => w.dnaRate);

  // Current = last week; reference = 4 weeks ago (index -5 from end)
  const current = weeks[weeks.length - 1];
  const reference = weeks.length >= 5 ? weeks[weeks.length - 5] : null;

  // Follow-up rate: x multiplier, higher is better
  const followUpCurrent = current?.followUpRate ?? 0;
  const followUpRef = reference?.followUpRate ?? 0;
  const followUpDelta = hasData
    ? deltaBadge(followUpCurrent, followUpRef, true, "x")
    : null;

  // HEP compliance: percentage points, higher is better
  const hepCurrent = current?.hepComplianceRate ?? 0;
  const hepRef = reference?.hepComplianceRate ?? 0;
  const hepDelta = hasData
    ? deltaBadge(hepCurrent, hepRef, true, "pp")
    : null;

  // DNA rate: percentage points, lower is better
  const dnaCurrent = current?.dnaRate ?? 0;
  const dnaRef = reference?.dnaRate ?? 0;
  const dnaDelta = hasData
    ? deltaBadge(dnaCurrent, dnaRef, false, "pp")
    : null;

  // DNA colour flips red when trending up (worsening)
  const dnaIsTrendingUp =
    dnaValues.length >= 2 &&
    dnaValues[dnaValues.length - 1] > dnaValues[dnaValues.length - 2];
  const dnaColor = dnaIsTrendingUp ? brand.danger : brand.blue;

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <GlassCard
            key={i}
            variant="standard"
            tint="neutral"
            className="p-5"
            style={{ background: "var(--surface-tile)", minHeight: 130 }}
          >
            <div className="animate-pulse space-y-3">
              <div className="h-2.5 w-20 rounded-full bg-navy/10 dark:bg-white/10" />
              <div className="h-7 w-16 rounded-md bg-navy/10 dark:bg-white/10" />
              <div className="h-10 w-full rounded-md bg-navy/6 dark:bg-white/6" />
            </div>
          </GlassCard>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <MetricCard
        label="Follow-up rate"
        value={`${followUpCurrent.toFixed(1)}x`}
        color={brand.teal}
        gradientId="trend-fu-gradient"
        sparkValues={followUpValues}
        delta={followUpDelta}
        empty={isEmpty || !hasData}
        tint="pulse"
      />
      <MetricCard
        label="HEP compliance"
        value={`${Math.round(hepCurrent * 100)}%`}
        color={brand.purple}
        gradientId="trend-hep-gradient"
        sparkValues={hepValues}
        delta={hepDelta}
        empty={isEmpty || !hasData}
        tint="intelligence"
      />
      <MetricCard
        label="DNA rate"
        value={`${Math.round(dnaCurrent * 100)}%`}
        color={dnaColor}
        gradientId="trend-dna-gradient"
        sparkValues={dnaValues}
        delta={dnaDelta}
        empty={isEmpty || !hasData}
        tint="ava"
      />
    </div>
  );
}
