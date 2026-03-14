import type { FC } from "react";

interface Props {
  score: number; // 0–100
  size?: "sm" | "md";
}

export const RiskScoreBadge: FC<Props> = ({ score, size = "md" }) => {
  const colour =
    score >= 60
      ? { bg: "bg-[#EF4444]/10", text: "text-[#EF4444]" }
      : score >= 40
      ? { bg: "bg-[#F59E0B]/10", text: "text-[#F59E0B]" }
      : { bg: "bg-[#10B981]/10", text: "text-[#10B981]" };

  const sizeClass = size === "sm" ? "text-[11px] px-1.5 py-0.5" : "text-xs px-2 py-1";

  return (
    <span
      className={`inline-flex items-center font-bold rounded-md tabular-nums ${sizeClass} ${colour.bg} ${colour.text}`}
    >
      {score}
    </span>
  );
};
