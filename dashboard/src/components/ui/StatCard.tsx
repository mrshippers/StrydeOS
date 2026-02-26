"use client";

import type { StatCardProps } from "@/types";
import { ChevronUp, ChevronDown, Minus, AlertTriangle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  ok: "#059669",
  warn: "#F59E0B",
  danger: "#DC2626",
  neutral: "#6B7280",
};

export default function StatCard({
  label,
  value,
  unit,
  target,
  benchmark,
  trend,
  status,
  insight,
  color,
  onClick,
}: StatCardProps) {
  const borderColor = color ?? STATUS_COLORS[status] ?? STATUS_COLORS.neutral;

  const TrendIcon = trend === "up"
    ? ChevronUp
    : trend === "down"
      ? ChevronDown
      : trend === "warn"
        ? AlertTriangle
        : Minus;

  const trendColor = trend === "up"
    ? "#059669"
    : trend === "down"
      ? "#DC2626"
      : trend === "warn"
        ? "#F59E0B"
        : "#6B7280";

  return (
    <div
      onClick={onClick}
      className={`relative rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] transition-all duration-200 ${
        onClick ? "cursor-pointer hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5" : ""
      }`}
      style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <span className="text-xs font-medium text-muted uppercase tracking-wide">
            {label}
          </span>
          {benchmark && (
            <span className="text-[10px] font-semibold text-muted bg-cloud-dark/60 px-2 py-0.5 rounded-full">
              {benchmark}
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-display text-4xl text-navy leading-none">
            {value}
          </span>
          {unit && (
            <span className="text-xs text-muted font-medium">{unit}</span>
          )}
          {trend && (
            <TrendIcon size={16} color={trendColor} strokeWidth={2.5} />
          )}
        </div>

        {target !== undefined && (
          <p className="text-[11px] text-muted mt-1">
            Target: {target}
          </p>
        )}

        {insight && (
          <p className="text-[11px] text-muted italic mt-2 leading-relaxed">
            {insight}
          </p>
        )}
      </div>
    </div>
  );
}
