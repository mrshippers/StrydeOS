import type { FC } from "react";

interface Props {
  score: number; // 0–100
  size?: "sm" | "md";
}

export const RiskScoreBadge: FC<Props> = ({ score, size = "md" }) => {
  const colour =
    score >= 60
      ? { bg: "bg-danger/10", text: "text-danger" }
      : score >= 40
      ? { bg: "bg-warn/10", text: "text-warn" }
      : { bg: "bg-success/10", text: "text-success" };

  const sizeClass = size === "sm" ? "text-[11px] px-1.5 py-0.5" : "text-xs px-2 py-1";

  return (
    <span
      className={`inline-flex items-center font-bold rounded-md tabular-nums ${sizeClass} ${colour.bg} ${colour.text}`}
    >
      {score}
    </span>
  );
};
