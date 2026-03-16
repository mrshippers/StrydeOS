import type { FC } from "react";
import type { LifecycleState } from "@/types";

const STATE_STYLES: Record<LifecycleState, { bg: string; text: string; label: string }> = {
  NEW:        { bg: "bg-blue/10",    text: "text-blue",    label: "New" },
  ONBOARDING: { bg: "bg-blue/10",   text: "text-blue",    label: "Onboarding" },
  ACTIVE:     { bg: "bg-success/10", text: "text-success", label: "Active" },
  AT_RISK:    { bg: "bg-warn/10",    text: "text-warn",    label: "At Risk" },
  LAPSED:     { bg: "bg-warn/10",    text: "text-warn",    label: "Lapsed" },
  RE_ENGAGED: { bg: "bg-teal/10",    text: "text-teal",    label: "Re-engaged" },
  DISCHARGED: { bg: "bg-muted/10",   text: "text-muted",   label: "Discharged" },
  CHURNED:    { bg: "bg-danger/10",  text: "text-danger",  label: "Churned" },
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
