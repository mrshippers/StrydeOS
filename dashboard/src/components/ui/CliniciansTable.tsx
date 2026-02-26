"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { WeeklyStats } from "@/types";
import { getInitials, formatPercent, formatRate, getFollowUpStatus, getDnaStatus, getGenericStatus } from "@/lib/utils";

interface ClinicianRow {
  clinicianId: string;
  clinicianName: string;
  stats: WeeklyStats;
  allWeeks?: WeeklyStats[];
}

interface CliniciansTableProps {
  rows: ClinicianRow[];
  onRowClick?: (clinicianId: string) => void;
}

type SortKey = "name" | "followUp" | "completion" | "utilisation" | "dna";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok"
      ? "bg-success"
      : status === "warn"
        ? "bg-warn"
        : status === "danger"
          ? "bg-danger"
          : "bg-muted";

  return (
    <div className={`w-2 h-2 rounded-full ${color}`} />
  );
}

export default function CliniciansTable({ rows, onRowClick }: CliniciansTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = a.clinicianName.localeCompare(b.clinicianName);
        break;
      case "followUp":
        cmp = a.stats.followUpRate - b.stats.followUpRate;
        break;
      case "completion":
        cmp = a.stats.courseCompletionRate - b.stats.courseCompletionRate;
        break;
      case "utilisation":
        cmp = a.stats.utilisationRate - b.stats.utilisationRate;
        break;
      case "dna":
        cmp = a.stats.dnaRate - b.stats.dnaRate;
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown size={12} className="text-muted/40" />;
    return sortAsc ? <ChevronUp size={12} className="text-blue" /> : <ChevronDown size={12} className="text-blue" />;
  };

  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {[
                { key: "name" as SortKey, label: "Clinician" },
                { key: "followUp" as SortKey, label: "Follow-up Rate" },
                { key: "completion" as SortKey, label: "Course Completion" },
                { key: "utilisation" as SortKey, label: "Utilisation" },
                { key: "dna" as SortKey, label: "DNA Rate" },
              ].map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="text-left px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide cursor-pointer hover:text-navy transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    {label}
                    <SortIcon col={key} />
                  </div>
                </th>
              ))}
              <th className="px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wide text-center">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const fuStatus = getFollowUpStatus(row.stats.followUpRate, row.stats.followUpTarget);
              const dnaStatus = getDnaStatus(row.stats.dnaRate);
              const utilStatus = getGenericStatus(row.stats.utilisationRate, 0.85);
              const worstStatus = [fuStatus, dnaStatus, utilStatus].includes("danger")
                ? "danger"
                : [fuStatus, dnaStatus, utilStatus].includes("warn")
                  ? "warn"
                  : "ok";

              return (
                <tr
                  key={row.clinicianId}
                  onClick={() => {
                    if (onRowClick) onRowClick(row.clinicianId);
                    setExpandedId(expandedId === row.clinicianId ? null : row.clinicianId);
                  }}
                  className="border-b border-border/50 hover:bg-cloud-light/50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-navy flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        {getInitials(row.clinicianName)}
                      </div>
                      <span className="text-sm font-medium text-navy">
                        {row.clinicianName}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-navy">
                    {formatRate(row.stats.followUpRate)}
                  </td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-navy">
                    {formatPercent(row.stats.courseCompletionRate)}
                  </td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-navy">
                    {formatPercent(row.stats.utilisationRate)}
                  </td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-navy">
                    {formatPercent(row.stats.dnaRate)}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <div className="flex justify-center">
                      <StatusDot status={worstStatus} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
