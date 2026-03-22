import type { FC } from "react";
import type { ComplexitySignals } from "@/types";
import { brand } from "@/lib/brand";

interface Props {
  signals: ComplexitySignals;
  updatedAt?: string;
}

const COMPLEXITY_COLOUR: Record<string, string> = {
  low: brand.success,
  moderate: brand.warning,
  high: brand.danger,
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Expanded panel showing all Heidi-derived complexity signals.
 * Renders below RiskFactorPanel when patient row is expanded.
 */
export const ComplexityPanel: FC<Props> = ({ signals, updatedAt }) => {
  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-navy tracking-wide uppercase">
          Clinical Complexity
        </span>
        <span className="text-[9px] text-muted flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="opacity-60">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill={brand.teal} fillOpacity={0.15} />
            <path d="M12 6v6l4 2" stroke={brand.teal} strokeWidth={2} strokeLinecap="round" />
          </svg>
          via Heidi{updatedAt ? ` · ${formatDate(updatedAt)}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {/* Pain score */}
        <SignalRow
          label="Pain score"
          value={signals.painScore !== undefined ? `${signals.painScore}/10` : "—"}
          colour={
            signals.painScore === undefined
              ? brand.muted
              : signals.painScore >= 7
                ? brand.danger
                : signals.painScore >= 4
                  ? brand.warning
                  : brand.success
          }
        />

        {/* Treatment complexity */}
        <SignalRow
          label="Complexity"
          value={signals.treatmentComplexity}
          colour={COMPLEXITY_COLOUR[signals.treatmentComplexity] ?? brand.muted}
        />

        {/* Discharge likelihood */}
        <SignalRow
          label="Discharge outlook"
          value={signals.dischargeLikelihood}
          colour={COMPLEXITY_COLOUR[signals.dischargeLikelihood] ?? brand.muted}
        />

        {/* Psychosocial flags */}
        <SignalRow
          label="Psychosocial"
          value={signals.psychosocialFlags ? "Flags detected" : "Clear"}
          colour={signals.psychosocialFlags ? brand.purple : brand.success}
        />

        {/* Multiple regions */}
        <SignalRow
          label="Body regions"
          value={signals.multipleRegions ? "Multiple" : "Single"}
          colour={signals.multipleRegions ? brand.warning : brand.muted}
        />

        {/* Chronic indicators */}
        <SignalRow
          label="Chronic indicators"
          value={signals.chronicIndicators ? "Present" : "None"}
          colour={signals.chronicIndicators ? brand.warning : brand.muted}
        />
      </div>
    </div>
  );
};

const SignalRow: FC<{ label: string; value: string; colour: string }> = ({
  label,
  value,
  colour,
}) => (
  <div className="flex items-center justify-between">
    <span className="text-[10px] text-muted">{label}</span>
    <span
      className="text-[10px] font-semibold capitalize"
      style={{ color: colour }}
    >
      {value}
    </span>
  </div>
);
