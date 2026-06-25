"use client";

// ─── Clinician coaching surfaces ────────────────────────────────────────────
//
// Two presentational pieces over the pure `clinician-coaching` logic:
//   • CoachingPill  — collapsed-row glance ("needs coaching" / "on track").
//   • ClinicianCoachingCard — the in-drilldown band that explains *why* a row
//     is the colour it is, with the action to take.
//
// Brand-locked: purple is the Intelligence module colour; severity uses the
// same success/warning/danger tokens as the Clinician Performance table. No
// values outside brand.ts.

import { AlertTriangle, TrendingDown, TrendingUp, Sparkles } from "lucide-react";
import { brand, hexToRgba } from "@/lib/brand";
import {
  type CoachingSignal,
  type CoachingSeverity,
  severityCounts,
} from "./clinician-coaching";

const SEVERITY_STYLE: Record<
  CoachingSeverity,
  { color: string; icon: React.ElementType; label: string }
> = {
  critical: { color: brand.danger, icon: AlertTriangle, label: "Act now" },
  watch: { color: brand.warning, icon: TrendingDown, label: "Watch" },
  strong: { color: brand.success, icon: TrendingUp, label: "Strength" },
};

/** Compact pill for the collapsed clinician row. */
export function CoachingPill({ severity, count }: { severity: CoachingSeverity; count: number }) {
  const s = SEVERITY_STYLE[severity];
  const Icon = s.icon;
  const text =
    severity === "strong"
      ? "On track"
      : `${count} to coach`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap"
      style={{ background: hexToRgba(s.color, 0.12), color: s.color }}
    >
      <Icon size={10} strokeWidth={2.5} />
      {text}
    </span>
  );
}

/** Full coaching band rendered inside the expanded drill-down row. */
export default function ClinicianCoachingCard({
  clinicianName,
  signals,
}: {
  clinicianName: string;
  signals: CoachingSignal[];
}) {
  if (signals.length === 0) {
    return (
      <div
        className="rounded-[var(--radius-card)] border p-4 flex items-start gap-3"
        style={{ borderColor: hexToRgba(brand.success, 0.2), background: hexToRgba(brand.success, 0.05) }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: hexToRgba(brand.success, 0.12) }}
        >
          <Sparkles size={14} style={{ color: brand.success }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-navy">No coaching signals for {clinicianName}</p>
          <p className="text-xs text-muted leading-relaxed">
            Every tracked metric is within its reference band this period. Keep the current routine steady.
          </p>
        </div>
      </div>
    );
  }

  const counts = severityCounts(signals);

  return (
    <div
      className="rounded-[var(--radius-card)] border p-4"
      style={{ borderColor: hexToRgba(brand.purple, 0.18), background: hexToRgba(brand.purple, 0.04) }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] flex items-center gap-1.5" style={{ color: brand.purple }}>
          <Sparkles size={12} /> Coaching signals
        </p>
        <div className="flex items-center gap-2">
          {(["critical", "watch", "strong"] as CoachingSeverity[])
            .filter((sev) => counts[sev] > 0)
            .map((sev) => (
              <span
                key={sev}
                className="inline-flex items-center gap-1 text-[10px] font-semibold"
                style={{ color: SEVERITY_STYLE[sev].color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEVERITY_STYLE[sev].color }} />
                {counts[sev]} {SEVERITY_STYLE[sev].label}
              </span>
            ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {signals.map((sig) => {
          const s = SEVERITY_STYLE[sig.severity];
          const Icon = s.icon;
          return (
            <div
              key={sig.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-white p-3"
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: hexToRgba(s.color, 0.12) }}
              >
                <Icon size={13} style={{ color: s.color }} strokeWidth={2.4} />
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{sig.metric}</span>
                  <span className="text-sm font-semibold text-navy">{sig.headline}</span>
                </div>
                <p className="text-xs text-muted leading-relaxed mt-0.5">{sig.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
