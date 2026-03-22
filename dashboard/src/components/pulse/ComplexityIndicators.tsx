import type { FC } from "react";
import type { ComplexitySignals } from "@/types";
import { brand } from "@/lib/brand";

interface Props {
  signals: ComplexitySignals;
}

/**
 * Compact inline badges for the patient row.
 * Only renders when there's something clinically notable — zero noise otherwise.
 */
export const ComplexityIndicators: FC<Props> = ({ signals }) => {
  const badges: Array<{ label: string; bg: string; fg: string; title: string }> = [];

  // Pain score — only surface if ≥ 5 (clinically notable)
  if (signals.painScore !== undefined && signals.painScore >= 5) {
    const isHigh = signals.painScore >= 7;
    badges.push({
      label: `Pain ${signals.painScore}/10`,
      bg: isHigh ? `${brand.danger}14` : `${brand.warning}14`,
      fg: isHigh ? brand.danger : brand.warning,
      title: `NPRS/VAS pain score: ${signals.painScore}/10`,
    });
  }

  // Psychosocial flags — always surface when present
  if (signals.psychosocialFlags) {
    badges.push({
      label: "Psych flags",
      bg: `${brand.purple}14`,
      fg: brand.purple,
      title: "Psychosocial flags detected (fear-avoidance, catastrophising, kinesiophobia, anxiety, depression, sleep, hypervigilance)",
    });
  }

  // Treatment complexity — only surface moderate or high
  if (signals.treatmentComplexity === "high") {
    badges.push({
      label: "High complexity",
      bg: `${brand.danger}14`,
      fg: brand.danger,
      title: "High treatment complexity: multiple regions, chronic indicators, or comorbidities",
    });
  } else if (signals.treatmentComplexity === "moderate") {
    badges.push({
      label: "Mod complexity",
      bg: `${brand.warning}14`,
      fg: brand.warning,
      title: "Moderate treatment complexity",
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {badges.map((b) => (
        <span
          key={b.label}
          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold leading-none whitespace-nowrap"
          style={{ backgroundColor: b.bg, color: b.fg }}
          title={b.title}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
};
