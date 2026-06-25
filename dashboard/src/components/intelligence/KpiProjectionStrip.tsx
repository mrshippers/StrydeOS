"use client";

/**
 * KPI Projection — for each locked KPI, shows the recent clinic-wide trend, the
 * current value, and a one-period PROJECTION (least-squares trajectory), versus
 * target. It reads the weekly trend from `/clinics/{clinicId}/metrics_weekly`
 * (clinicianId === "all") via `useWeeklyTrend`, the same populated source the
 * Clinician Performance table uses — so it actually analyses instead of rendering
 * nothing. The `kpis/*` projection is used only to enrich target/status when
 * present; the strip no longer blanks just because that collection is empty.
 *
 * Renders nothing only when there is genuinely no data (no weekly history AND no
 * kpis projection) or in demo mode.
 */

import { useKpis } from "@/hooks/useKpis";
import { useWeeklyTrend } from "@/hooks/useWeeklyTrend";
import { useConnections } from "@/hooks/useConnections";
import { brand } from "@/lib/brand";
import { KPI_IDS, type KpiDoc, type KpiId } from "@/types/kpi";
import type { WeeklyStats } from "@/types";
import { AlertTriangle, CheckCircle2, AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

// KPIs whose data comes from an enrichable source — hidden until that source is
// connected (else they read as fabricated, e.g. NPS with no NPS set up).
const KPI_REQUIRES_CONNECTION: Partial<Record<KpiId, string>> = {
  nps: "nps",
  "hep-compliance": "hep",
  "google-review-conversion": "reviews",
  "average-star-rating": "reviews",
};

const KPI_LABELS: Record<KpiId, string> = {
  "follow-up-rate": "Follow-up rate",
  "hep-compliance": "HEP compliance",
  utilisation: "Utilisation",
  "dna-rate": "DNA rate",
  "revenue-per-session": "Rev / session",
  nps: "NPS",
  "google-review-conversion": "Review conversion",
  "average-star-rating": "Star rating",
};

// Lower-is-better KPIs (only DNA). Everything else: higher is better.
const LOWER_IS_BETTER: Partial<Record<KpiId, true>> = { "dna-rate": true };

// Fallback targets when the kpis/* projection has not populated one yet.
// (revenue in pence). Aligned to CLAUDE.md "KPI Metrics — Confirmed from Spires".
const DEFAULT_TARGETS: Record<KpiId, number> = {
  "follow-up-rate": 4.0,
  "hep-compliance": 0.95,
  utilisation: 0.85,
  "dna-rate": 0.05,
  "revenue-per-session": 7000,
  nps: 50,
  "google-review-conversion": 0.05,
  "average-star-rating": 4.5,
};

// Pull each KPI's weekly series out of metrics_weekly. KPIs not carried on the
// weekly aggregate (e.g. review conversion) return [] and fall back to kpis/*.
const WEEKLY_FIELD: Partial<Record<KpiId, (w: WeeklyStats) => number | null | undefined>> = {
  "follow-up-rate": (w) => w.followUpRate,
  "hep-compliance": (w) => w.hepComplianceRate,
  utilisation: (w) => w.utilisationRate,
  "dna-rate": (w) => w.dnaRate,
  "revenue-per-session": (w) => w.revenuePerSessionPence,
  nps: (w) => w.npsScore ?? undefined,
  "average-star-rating": (w) => w.avgStarRating ?? undefined,
};

const STATUS_COLORS: Record<KpiDoc["status"], { bg: string; fg: string; Icon: typeof CheckCircle2 }> = {
  ok: { bg: `${brand.success}14`, fg: brand.success, Icon: CheckCircle2 },
  warn: { bg: `${brand.warning}14`, fg: brand.warning, Icon: AlertCircle },
  danger: { bg: `${brand.danger}14`, fg: brand.danger, Icon: AlertTriangle },
};

function formatValue(kpiId: KpiId, value: number): string {
  switch (kpiId) {
    case "follow-up-rate":
      return value.toFixed(1);
    case "revenue-per-session":
      return `£${Math.round(value / 100).toLocaleString("en-GB")}`;
    case "nps":
      return String(Math.round(value));
    case "hep-compliance":
    case "utilisation":
    case "dna-rate":
    case "google-review-conversion":
      return `${Math.round(value * 100)}%`;
    case "average-star-rating":
      return `${value.toFixed(1)} / 5`;
    default:
      return String(value);
  }
}

/** One-period projection via least-squares slope over the series. */
function projectNext(series: number[]): { projected: number; slope: number } | null {
  const pts = series.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return null;
  const n = pts.length;
  const meanX = (n - 1) / 2;
  const meanY = pts.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (pts[i] - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { projected: pts[n - 1] + slope, slope };
}

function deriveStatus(value: number, target: number, lowerIsBetter: boolean): KpiDoc["status"] {
  if (lowerIsBetter) {
    if (value <= target) return "ok";
    if (value <= target * 1.15) return "warn";
    return "danger";
  }
  if (value >= target) return "ok";
  if (value >= target * 0.85) return "warn";
  return "danger";
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMins = Math.round((Date.now() - then) / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

interface KpiProjection {
  kpiId: KpiId;
  series: number[];
  current: number;
  projected: number | null;
  target: number;
  status: KpiDoc["status"];
  lowerIsBetter: boolean;
}

export default function KpiProjectionStrip() {
  const { kpis, computeState } = useKpis();
  const { weeks } = useWeeklyTrend(12);
  const { connected } = useConnections();

  const visibleKpiIds = KPI_IDS.filter((id) => {
    const req = KPI_REQUIRES_CONNECTION[id];
    return !req || connected[req];
  });

  const projections: KpiProjection[] = visibleKpiIds
    .map((id): KpiProjection | null => {
      const field = WEEKLY_FIELD[id];
      const series = field
        ? weeks.map((w) => field(w)).filter((v): v is number => Number.isFinite(v as number))
        : [];
      const kpiDoc = kpis[id];

      // Current value: latest weekly point, else the kpis/* projection value.
      const current = series.length > 0 ? series[series.length - 1] : kpiDoc?.value ?? null;
      if (current == null) return null; // no data for this KPI at all → skip the tile

      const lowerIsBetter = !!LOWER_IS_BETTER[id];
      const target = kpiDoc?.target ?? DEFAULT_TARGETS[id];
      const proj = projectNext(series);
      const status = kpiDoc?.status ?? deriveStatus(current, target, lowerIsBetter);

      return {
        kpiId: id,
        series,
        current,
        projected: proj ? proj.projected : null,
        target,
        status,
        lowerIsBetter,
      };
    })
    .filter((p): p is KpiProjection => p !== null);

  if (projections.length === 0) return null;

  const health = computeState?.schedulerHealth ?? "ok";
  const lastRecomputeAt = computeState?.lastFullRecomputeAt ?? null;

  return (
    <GlassCard
      variant="primary"
      tint="intelligence"
      as="section"
      className="p-4"
      aria-label="KPI projection strip"
    >
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-[0.08em]">
            KPI projection
          </span>
          <span className="text-[11px] text-muted/70">· trend &amp; next-period forecast</span>
          {lastRecomputeAt && (
            <span className="text-[11px] text-muted/70">· updated {formatRelativeTime(lastRecomputeAt)}</span>
          )}
        </div>
        <HealthBadge health={health} />
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {projections.map((p) => (
          <KpiTile key={p.kpiId} projection={p} />
        ))}
      </div>
    </GlassCard>
  );
}

function KpiTile({ projection }: { projection: KpiProjection }) {
  const { kpiId, series, current, projected, target, status, lowerIsBetter } = projection;
  const { bg, fg, Icon } = STATUS_COLORS[status];

  // Projection direction relative to "good" (lower DNA is good).
  let trend: "up" | "down" | "flat" = "flat";
  if (projected != null && series.length >= 2) {
    const delta = projected - current;
    const threshold = Math.abs(current) * 0.01 || 0.0001;
    if (delta > threshold) trend = "up";
    else if (delta < -threshold) trend = "down";
  }
  const improving = trend === "flat" ? null : lowerIsBetter ? trend === "down" : trend === "up";
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = improving == null ? brand.muted : improving ? brand.success : brand.warning;

  return (
    <div className="rounded-xl p-3 border" style={{ background: bg, borderColor: `${fg}22` }}>
      <div className="flex items-start justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted leading-tight">
          {KPI_LABELS[kpiId]}
        </span>
        <Icon size={12} style={{ color: fg }} />
      </div>
      <p className="font-display text-lg text-navy leading-tight tabular-nums">
        {formatValue(kpiId, current)}
      </p>
      <div className="flex items-center justify-between mt-1">
        <ProjectionSparkline series={series} projected={projected} color={fg} />
        {projected != null && (
          <span className="inline-flex items-center gap-1 text-[10px] tabular-nums" style={{ color: trendColor }}>
            <TrendIcon size={11} />
            {formatValue(kpiId, projected)}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted mt-1 tabular-nums">
        target {formatValue(kpiId, target)}
      </p>
    </div>
  );
}

/** Recent trend with a dashed projected segment to the forecast point. */
function ProjectionSparkline({
  series,
  projected,
  color,
}: {
  series: number[];
  projected: number | null;
  color: string;
}) {
  const data = series.filter((v) => Number.isFinite(v));
  if (data.length < 2) return <div className="h-7" />;
  const all = projected != null ? [...data, projected] : data;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const w = 64;
  const h = 28;
  const divisor = all.length - 1;
  const xy = (v: number, i: number) => {
    const x = (i / divisor) * w;
    const y = h - ((v - min) / range) * h;
    return { x, y };
  };
  const histPoints = data.map((v, i) => {
    const { x, y } = xy(v, i);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden="true">
      <polyline
        points={histPoints}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      {projected != null && (() => {
        const last = xy(data[data.length - 1], data.length - 1);
        const next = xy(projected, all.length - 1);
        return (
          <>
            <line
              x1={last.x}
              y1={last.y}
              x2={next.x}
              y2={next.y}
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="2 2"
              opacity={0.6}
            />
            <circle cx={next.x} cy={next.y} r={2} fill={color} opacity={0.7} />
          </>
        );
      })()}
    </svg>
  );
}

function HealthBadge({ health }: { health: "ok" | "degraded" | "failed" }) {
  const label: Record<typeof health, string> = { ok: "Healthy", degraded: "Degraded", failed: "Failed" };
  const colour: Record<typeof health, string> = {
    ok: brand.success,
    degraded: brand.warning,
    failed: brand.danger,
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: `${colour[health]}14`, color: colour[health] }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: colour[health] }} />
      {label[health]}
    </span>
  );
}
