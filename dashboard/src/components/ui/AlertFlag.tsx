"use client";

import { ArrowRight } from "lucide-react";
import type { AlertFlagProps } from "@/types";

export default function AlertFlag({ metric, current, target, severity }: AlertFlagProps) {
  const bg = severity === "danger" ? "bg-danger/10" : "bg-warn/10";
  const text = severity === "danger" ? "text-danger" : "text-warn";
  const border = severity === "danger" ? "border-danger/20" : "border-warn/20";

  const formatted = current < 1 ? `${Math.round(current * 100)}%` : current.toFixed(1);
  const targetFormatted = target < 1 ? `${Math.round(target * 100)}%` : target.toFixed(1);

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${bg} ${text} ${border} border text-xs font-semibold`}
    >
      <span>
        {metric} {formatted} — target {targetFormatted}
      </span>
      <ArrowRight size={12} />
    </div>
  );
}

export function AlertBanner({
  alerts,
}: {
  alerts: AlertFlagProps[];
}) {
  if (alerts.length === 0) return null;

  const hasDanger = alerts.some((a) => a.severity === "danger");
  const bg = hasDanger ? "bg-danger/5 border-danger/15" : "bg-warn/5 border-warn/15";
  const text = hasDanger ? "text-danger" : "text-warn";

  return (
    <div className={`rounded-[var(--radius-card)] border ${bg} p-4`}>
      <p className={`text-sm font-semibold ${text} mb-2`}>
        {alerts.length} metric{alerts.length > 1 ? "s" : ""} need{alerts.length === 1 ? "s" : ""} attention this week
      </p>
      <div className="flex flex-wrap gap-2">
        {alerts.map((alert) => (
          <AlertFlag key={alert.metric} {...alert} />
        ))}
      </div>
    </div>
  );
}
