"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
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

const COLUMN_TOOLTIPS: Record<string, string> = {
  followUp: "Mean FU sessions per IA. UK MSK benchmark: 2.9\u20133.2. Below 2.0 signals patient drop-off risk.",
  completion: "% of patients completing full prescribed course. <75% may indicate early self-discharge. UK private MSK benchmark: 70\u201380%.",
  utilisation: "% of booked slots attended. Target >85%. Below 75% suggests scheduling inefficiency.",
  dna: "Did Not Attend %. <6% excellent, >10% requires intervention.",
  sessions: "Total billable appointments this clinician delivered in the week.",
  revenue: "Gross revenue = sessions \u00D7 avg revenue per session. Uses actual revenuePerSessionPence from weekly stats.",
};

function getFollowUpRAG(rate: number): MetricStatus {
  if (rate >= 2.9) return "ok";
  if (rate >= 2.0) return "warn";
  return "danger";
}

function getDnaRAG(rate: number): MetricStatus {
  if (rate < 0.06) return "ok";
  if (rate <= 0.10) return "warn";
  return "danger";
}

function getUtilisationRAG(rate: number): MetricStatus {
  if (rate > 0.85) return "ok";
  if (rate >= 0.75) return "warn";
  return "danger";
}

function getCourseCompletionRAG(rate: number): MetricStatus {
  if (rate > 0.75) return "ok";
  if (rate >= 0.60) return "warn";
  return "danger";
}

const RAG_BADGE: Record<MetricStatus, { bg: string; text: string }> = {
  ok:      { bg: "rgba(5,150,105,0.09)",  text: "#059669" },
  warn:    { bg: "rgba(245,158,11,0.09)", text: "#F59E0B" },
  danger:  { bg: "rgba(239,68,68,0.09)",  text: "#EF4444" },
  neutral: { bg: "rgba(107,114,128,0.09)", text: "#6B7280" },
};

function RagBadge({ value, status }: { value: string; status: MetricStatus }) {
  const style = RAG_BADGE[status];
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
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
        className="text-muted/40 hover:text-muted transition-colors"
        aria-label="Metric info"
      >
        <Info size={11} />
      </button>
      {open && (
        <div
          className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 w-56 px-3 py-2.5 rounded-lg text-[11px] leading-relaxed text-white shadow-lg animate-fade-in"
          style={{ background: "#0B2545" }}
        >
          {text}
          <div
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
            style={{ background: "#0B2545" }}
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
      case "sessions":
        cmp = a.stats.appointmentsTotal - b.stats.appointmentsTotal;
        break;
      case "revenue":
        cmp = clinicianRevenue(a.stats) - clinicianRevenue(b.stats);
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown size={12} className="text-muted/40" />;
    return sortAsc ? <ChevronUp size={12} className="text-blue" /> : <ChevronDown size={12} className="text-blue" />;
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Clinician" },
    { key: "followUp", label: "Follow-up Rate" },
    { key: "completion", label: "Course Completion" },
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
                  className="text-left px-5 py-3 text-[10px] font-semibold text-muted uppercase tracking-[0.1em] cursor-pointer hover:text-navy transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    {label}
                    {COLUMN_TOOLTIPS[key] && <HeaderTooltip text={COLUMN_TOOLTIPS[key]} />}
                    <SortIcon col={key} />
                  </div>
                </th>
              ))}
              <th className="px-5 py-3 text-[10px] font-semibold text-muted uppercase tracking-[0.1em] text-center">
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
                  className="group border-b border-border/50 cursor-pointer transition-colors hover:bg-blue/[0.04] active:bg-blue/[0.06]"
                  style={{
                    height: 52,
                    borderLeft: hasAlert ? "3px solid #F59E0B" : undefined,
                  }}
                >
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-navy flex items-center justify-center text-[10px] font-bold text-white shrink-0 transition-shadow duration-200 group-hover:ring-2 group-hover:ring-blue/20">
                        {getInitials(row.clinicianName)}
                      </div>
                      <span className="text-sm font-medium text-navy">
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
                  <td className="px-5 py-2 text-sm font-semibold text-navy tabular-nums">
                    {row.stats.appointmentsTotal}
                  </td>
                  <td className="px-5 py-2 text-sm font-semibold text-navy tabular-nums">
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
