"use client";

import type { WeeklyStats } from "@/types";
import type { Patient } from "@/types";
import { brand as colors } from "@/lib/brand";

interface DailySnapshotProps {
  stats: WeeklyStats | null;
  patients: Patient[];
}

interface SnapshotChip {
  icon: string;
  label: string;
  color: string;
}

export default function DailySnapshot({ stats, patients }: DailySnapshotProps) {
  if (!stats) return null;

  const churnCount = patients.filter((p) => !p.discharged && p.churnRisk).length;

  const chips: SnapshotChip[] = [
    {
      icon: "📅",
      label: `${stats.appointmentsTotal} appointments this week`,
      color: colors.blue,
    },
  ];

  if (churnCount > 0) {
    chips.push({
      icon: "⚠️",
      label: `${churnCount} patient${churnCount !== 1 ? "s" : ""} at churn risk`,
      color: colors.warning,
    });
  }

  if (stats.dnaRate > 0.08) {
    chips.push({
      icon: "📋",
      label: `DNA rate ${Math.round(stats.dnaRate * 100)}% — above target`,
      color: colors.danger,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {chips.map((chip, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border"
          style={{
            color: chip.color,
            borderColor: `${chip.color}25`,
            background: `${chip.color}0A`,
          }}
        >
          <span aria-hidden="true">{chip.icon}</span>
          {chip.label}
        </span>
      ))}
    </div>
  );
}
