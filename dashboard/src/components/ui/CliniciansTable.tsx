"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { ChevronDown, ChevronUp, Info, Users } from "lucide-react";
import type { WeeklyStats, MetricStatus } from "@/types";
import { getInitials, formatPercent, formatRate } from "@/lib/utils";

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

type SortKey = "name" | "followUp" | "completion" | "utilisation" | "dna" | "sessions" | "revenue";

function SortIcon({ col, sortKey, sortAsc }: { col: SortKey; sortKey: SortKey; sortAsc: boolean }) {
  if (sortKey !== col) return <ChevronDown size={12} className="text-muted/70" />;
  return sortAsc ? <ChevronUp size={12} className="text-blue" /> : <ChevronDown size={12} className="text-blue" />;
}

const COLUMN_TOOLTIPS: Record<string, string> = {
  followUp: "Mean FU sessions per IA. UK median: 4.0 FU/IA (5.0 sessions per episode). Below 3.0 signals patient drop-off risk.",
  completion: "% of patients given a home exercise programme vs patients seen. UK private MSK benchmark: 70\u201385%.",
  utilisation: "% of booked slots attended. UK average: 72%. Green \u226575%. Above 80% monitor clinician wellbeing.",
  dna: "Did Not Attend %. \u22646% with automation is excellent, >10% requires intervention.",
  sessions: "Total billable appointments this clinician delivered in the week.",
  revenue: "Gross revenue = sessions \u00D7 avg revenue per session. Uses actual revenuePerSessionPence from weekly stats.",
};

function getFollowUpRAG(rate: number): MetricStatus {
  if (rate >= 4.0) return "ok";
  if (rate >= 3.0) return "warn";
  return "danger";
}

function getDnaRAG(rate: number): MetricStatus {
  if (rate < 0.06) return "ok";
  if (rate <= 0.10) return "warn";
  return "danger";
}

function getUtilisationRAG(rate: number): MetricStatus {
  if (rate >= 0.75) return "ok";
  if (rate >= 0.65) return "warn";
  return "danger";
}

function getCourseCompletionRAG(rate: number): MetricStatus {
  if (rate > 0.75) return "ok";
  if (rate >= 0.60) return "warn";
  return "danger";
}

const RAG_CLASSES: Record<MetricStatus, string> = {
  ok:      "bg-success/10 text-success",
  warn:    "bg-warn/10 text-warn",
  danger:  "bg-danger/10 text-danger",
  neutral: "bg-muted/10 text-muted",
};

function RagBadge({ value, status }: { value: string; status: MetricStatus }) {
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-md text-[13px] font-semibold tabular-nums ${RAG_CLASSES[status]}`}>
      {value}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok"
      ? "bg-success"
      : status === "warn"
        ? "bg-warn"
        : status === "danger"
          ? "bg-danger"
          : "bg-muted";

  return <div className={`w-2 h-2 rounded-full ${color}`} />;
}

function HeaderTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  return (
    <div ref={ref} className="relative inline-flex ml-0.5">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="text-muted/70 hover:text-muted transition-colors"
        aria-label="Metric info"
      >
        <Info size={11} />
      </button>
      {open && (
        <div
          className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 w-56 px-3 py-2.5 rounded-lg text-[12px] leading-relaxed text-white/90 shadow-lg animate-fade-in border border-white/10"
          style={{ background: "#132D5E" }}
        >
          {text}
          <div
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-l border-t border-white/10"
            style={{ background: "#132D5E" }}
          />
        </div>
      )}
    </div>
  );
}

function formatRevenue(pence: number): string {
  const pounds = Math.round(pence / 100);
  return `£${pounds.toLocaleString("en-GB")}`;
}

function clinicianRevenue(stats: WeeklyStats): number {
  return stats.appointmentsTotal * stats.revenuePerSessionPence;
}

// Re-renders when rows array or onRowClick reference changes (shallow compare).
// Parent should stabilise onRowClick with useCallback and rows with useMemo.
function CliniciansTable({ rows, onRowClick }: CliniciansTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-12 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-blue/10 flex items-center justify-center">
            <Users size={22} className="text-blue" />
          </div>
        </div>
        <h3 className="font-display text-xl text-navy mb-2">No clinician data yet</h3>
        <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
          Clinician performance will appear here once your PMS is connected and appointment data starts syncing. This typically populates within 24 hours of your first sync.
        </p>
      </div>
    );
  }

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
      case "sessions":
        cmp = a.stats.appointmentsTotal - b.stats.appointmentsTotal;
        break;
      case "revenue":
        cmp = clinicianRevenue(a.stats) - clinicianRevenue(b.stats);
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  // SortIcon hoisted to module scope for render stability

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Clinician" },
    { key: "followUp", label: "Follow-up Rate" },
    { key: "completion", label: "HEP Compliance" },
    { key: "utilisation", label: "Utilisation" },
    { key: "dna", label: "DNA Rate" },
    { key: "sessions", label: "Sessions" },
    { key: "revenue", label: "Revenue" },
  ];

  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-border">
              {columns.map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="text-left px-5 py-3 text-[11px] font-semibold text-muted-strong uppercase tracking-[0.08em] cursor-pointer hover:text-navy transition-colors duration-200 select-none"
                >
                  <div className="flex items-center gap-1">
                    {label}
                    {COLUMN_TOOLTIPS[key] && <HeaderTooltip text={COLUMN_TOOLTIPS[key]} />}
                    <SortIcon col={key} sortKey={sortKey} sortAsc={sortAsc} />
                  </div>
                </th>
              ))}
              <th className="px-5 py-3 text-[11px] font-semibold text-muted-strong uppercase tracking-[0.08em] text-center">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const fuStatus = getFollowUpRAG(row.stats.followUpRate);
              const dnaStatus = getDnaRAG(row.stats.dnaRate);
              const utilStatus = getUtilisationRAG(row.stats.utilisationRate);
              const ccStatus = getCourseCompletionRAG(row.stats.courseCompletionRate);
              const worstStatus = [fuStatus, dnaStatus, utilStatus, ccStatus].includes("danger")
                ? "danger"
                : [fuStatus, dnaStatus, utilStatus, ccStatus].includes("warn")
                  ? "warn"
                  : "ok";

              const dangerCount = [fuStatus, dnaStatus, utilStatus, ccStatus].filter(s => s === "danger").length;
              const warnCount = [fuStatus, dnaStatus, utilStatus, ccStatus].filter(s => s === "warn").length;
              const hasAlert = dangerCount >= 2 || (dangerCount >= 1 && warnCount >= 1);

              const revenuePence = clinicianRevenue(row.stats);

              return (
                <tr
                  key={row.clinicianId}
                  onClick={() => {
                    if (onRowClick) onRowClick(row.clinicianId);
                    setExpandedId(expandedId === row.clinicianId ? null : row.clinicianId);
                  }}
                  className="group border-b border-border/50 cursor-pointer transition-all duration-200 hover:bg-blue/[0.04] active:bg-blue/[0.06]"
                  style={{
                    height: 52,
                    borderLeft: hasAlert ? "3px solid #F59E0B" : undefined,
                  }}
                >
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-navy flex items-center justify-center text-[11px] font-bold text-white shrink-0 transition-shadow duration-200 group-hover:ring-2 group-hover:ring-blue/20">
                        {getInitials(row.clinicianName)}
                      </div>
                      <span className="text-[14px] font-medium text-navy">
                        {row.clinicianName}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-2">
                    <RagBadge value={formatRate(row.stats.followUpRate)} status={fuStatus} />
                  </td>
                  <td className="px-5 py-2">
                    <RagBadge value={formatPercent(row.stats.courseCompletionRate)} status={ccStatus} />
                  </td>
                  <td className="px-5 py-2">
                    <RagBadge value={formatPercent(row.stats.utilisationRate)} status={utilStatus} />
                  </td>
                  <td className="px-5 py-2">
                    <RagBadge value={formatPercent(row.stats.dnaRate)} status={dnaStatus} />
                  </td>
                  <td className="px-5 py-2 text-[14px] font-semibold text-navy tabular-nums">
                    {row.stats.appointmentsTotal}
                  </td>
                  <td className="px-5 py-2 text-[14px] font-semibold text-navy tabular-nums">
                    {formatRevenue(revenuePence)}
                  </td>
                  <td className="px-5 py-2 text-center">
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

export default memo(CliniciansTable);
