"use client";

/**
 * Read-only projection strip of the seven locked KPIs, rendered above the
 * existing Intelligence tabs. Reads from `/clinics/{clinicId}/kpis/*` via
 * `useKpis()`.
 *
 * Renders nothing (null) when `kpis` is empty - either the pipeline hasn't
 * run yet or the user is in demo mode. The existing tabs below continue to
 * drive the dashboard in that case, so this is purely additive.
 */

import { useKpis } from "@/hooks/useKpis";
import { brand } from "@/lib/brand";
import { KPI_IDS, type KpiDoc, type KpiId } from "@/types/kpi";
import { AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

const KPI_LABELS: Record<KpiId, string> = {
  "follow-up-rate": "Follow-up rate",
  "hep-compliance": "HEP compliance",
  utilisation: "Utilisation",
  "dna-rate": "DNA rate",
  "revenue-per-session": "Rev / session",
  nps: "NPS",
  "google-review-conversion": "Review conversion",
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
    default:
      return String(value);
  }
}

function formatTarget(kpiId: KpiId, target: number): string {
  return `target ${formatValue(kpiId, target)}`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const diffMins = Math.round(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function KpiProjectionStrip() {
  const { kpis, computeState } = useKpis();

  const hasAny = KPI_IDS.some((id) => kpis[id] != null);
  if (!hasAny) return null;

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
          {lastRecomputeAt && (
            <span className="text-[11px] text-muted/70">
              · updated {formatRelativeTime(lastRecomputeAt)}
            </span>
          )}
        </div>
        <HealthBadge health={health} />
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {KPI_IDS.map((id) => {
          const kpi = kpis[id];
          if (!kpi) return <KpiTilePlaceholder key={id} kpiId={id} />;
          return <KpiTile key={id} kpi={kpi} />;
        })}
      </div>
    </GlassCard>
  );
}

function KpiTile({ kpi }: { kpi: KpiDoc }) {
  const { bg, fg, Icon } = STATUS_COLORS[kpi.status];
  return (
    <div
      className="rounded-xl p-3 border"
      style={{ background: bg, borderColor: `${fg}22` }}
    >
      <div className="flex items-start justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted leading-tight">
          {KPI_LABELS[kpi.kpiId]}
        </span>
        <Icon size={12} style={{ color: fg }} />
      </div>
      <p className="font-display text-lg text-navy leading-tight tabular-nums">
        {formatValue(kpi.kpiId, kpi.value)}
      </p>
      <p className="text-[10px] text-muted mt-0.5 tabular-nums">
        {formatTarget(kpi.kpiId, kpi.target)}
      </p>
    </div>
  );
}

function KpiTilePlaceholder({ kpiId }: { kpiId: KpiId }) {
  return (
    <div
      className="rounded-xl p-3 border border-dashed"
      style={{ borderColor: brand.border, background: brand.cloudLight }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted/70 leading-tight block mb-1">
        {KPI_LABELS[kpiId]}
      </span>
      <p className="font-display text-lg text-muted/50 leading-tight">-</p>
      <p className="text-[10px] text-muted/60 mt-0.5">pending</p>
    </div>
  );
}

function HealthBadge({ health }: { health: "ok" | "degraded" | "failed" }) {
  const label: Record<typeof health, string> = {
    ok: "Healthy",
    degraded: "Degraded",
    failed: "Failed",
  };
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
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: colour[health] }}
      />
      {label[health]}
    </span>
  );
}
