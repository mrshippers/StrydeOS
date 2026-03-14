import type { FC } from "react";
import type { RiskFactors } from "@/types";

interface Props {
  factors: RiskFactors;
}

const FACTOR_CONFIG = [
  { key: "attendance",        label: "Attendance",           weight: 30, colour: "#0891B2" },
  { key: "treatmentProgress", label: "Treatment Progress",   weight: 25, colour: "#8B5CF6" },
  { key: "hepEngagement",     label: "HEP Engagement",       weight: 20, colour: "#1C54F2" },
  { key: "sentiment",         label: "Outcomes / Sentiment", weight: 15, colour: "#4B8BF5" },
  { key: "staticRisk",        label: "Patient Profile",      weight: 10, colour: "#64748B" },
] as const;

export const RiskFactorPanel: FC<Props> = ({ factors }) => {
  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
      {FACTOR_CONFIG.map(({ key, label, weight, colour }) => {
        const score = Math.round(factors[key] ?? 0);
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] text-muted w-36 shrink-0">
              {label} <span className="opacity-50">({weight}%)</span>
            </span>
            <div className="flex-1 h-1.5 bg-cloud-dark rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${score}%`, backgroundColor: colour }}
              />
            </div>
            <span className="text-[10px] font-semibold text-navy w-6 text-right tabular-nums">
              {score}
            </span>
          </div>
        );
      })}
    </div>
  );
};
