import type { FC } from "react";
import type { LifecycleState } from "@/types";

const STATE_STYLES: Record<LifecycleState, { bg: string; text: string; label: string }> = {
  NEW:        { bg: "bg-[#1C54F2]/10", text: "text-[#1C54F2]", label: "New" },
  ONBOARDING: { bg: "bg-[#1C54F2]/10", text: "text-[#1C54F2]", label: "Onboarding" },
  ACTIVE:     { bg: "bg-[#10B981]/10", text: "text-[#10B981]", label: "Active" },
  AT_RISK:    { bg: "bg-[#F59E0B]/10", text: "text-[#F59E0B]", label: "At Risk" },
  LAPSED:     { bg: "bg-orange-100",   text: "text-orange-600", label: "Lapsed" },
  RE_ENGAGED: { bg: "bg-[#0891B2]/10", text: "text-[#0891B2]", label: "Re-engaged" },
  DISCHARGED: { bg: "bg-gray-100",     text: "text-gray-500",  label: "Discharged" },
  CHURNED:    { bg: "bg-[#EF4444]/10", text: "text-[#EF4444]", label: "Churned" },
};

interface Props {
  state: LifecycleState;
}

export const LifecycleStateBadge: FC<Props> = ({ state }) => {
  const s = STATE_STYLES[state] ?? STATE_STYLES.ACTIVE;
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
};
