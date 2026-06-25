"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type FC } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronRight, ChevronLeft, AlertCircle, Pencil, ArrowUpDown, ListFilter } from "lucide-react";
import type { Patient, LifecycleState, Clinician } from "@/types";
import { RiskScoreBadge } from "./RiskScoreBadge";
import { LifecycleStateBadge } from "./LifecycleStateBadge";
import { RiskFactorPanel } from "./RiskFactorPanel";
import { ComplexityIndicators } from "./ComplexityIndicators";
import { ComplexityPanel } from "./ComplexityPanel";
import { ClinicalNotesPanel } from "./ClinicalNotesPanel";
import { PatientEditModal } from "./PatientEditModal";
import EmptyState from "@/components/ui/EmptyState";
import { daysSince } from "@/lib/utils";
import { useInsightEvents } from "@/hooks/useInsightEvents";
import { brand } from "@/lib/brand";
import { EASING_ARRAY } from "@/lib/motion";
import { GlassCard } from "@/components/ui/GlassCard";

// Hoisted styles to avoid re-creation per patient row per render
const INSIGHT_BADGE_STYLE = { background: `${brand.purple}12`, color: brand.purple } as const;
import type { InsightEvent } from "@/types/insight-events";

interface Props {
  patients: Patient[];
  clinicianMap: Record<string, Clinician>;
  clinicId: string | null;
  visibleSegments: LifecycleState[];
  visibleMetrics: string[];
  onSendReminder: (patientId: string) => void;
  searchQuery?: string;
}

const SEGMENT_ORDER: LifecycleState[] = [
  "ONBOARDING", "ACTIVE", "AT_RISK", "LAPSED", "RE_ENGAGED", "NEW", "DISCHARGED", "CHURNED",
];

// Page size for each lifecycle segment — keeps long cohorts readable instead of an
// endless scroll. ~25 rows is a comfortable page on a clinical dashboard.
const PAGE_SIZE = 25;

type SortKey = "lastVisit" | "name" | "risk" | "sessions";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "lastVisit", label: "Last visit" },
  { key: "name", label: "Name" },
  { key: "risk", label: "Risk score" },
  { key: "sessions", label: "Sessions" },
];

// Build a compact numbered-pager model: 1 … 4 5 6 … 20
function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function patientSortValue(p: Patient, key: SortKey): number | string {
  switch (key) {
    case "name":
      return (p.name ?? "").toLowerCase();
    case "risk":
      return p.riskScore ?? -1;
    case "sessions":
      return p.sessionCount ?? 0;
    case "lastVisit":
    default:
      return p.lastSessionDate ? new Date(p.lastSessionDate).getTime() : 0;
  }
}

export const PatientBoard: FC<Props> = ({
  patients,
  clinicianMap,
  clinicId,
  visibleSegments,
  visibleMetrics,
  onSendReminder,
  searchQuery,
}) => {
  const [collapsed, setCollapsed] = useState<Set<LifecycleState>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("lastVisit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [segmentFilter, setSegmentFilter] = useState<LifecycleState | "ALL">("ALL");
  const [pageByState, setPageByState] = useState<Record<string, number>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { activeEvents } = useInsightEvents();

  const openDropdown = useCallback((patientId: string, buttonEl: HTMLButtonElement) => {
    const rect = buttonEl.getBoundingClientRect();
    const dropdownWidth = 160;
    // Clamp left so dropdown doesn't overflow viewport
    const left = Math.min(rect.left, window.innerWidth - dropdownWidth - 16);
    // If dropdown would go below viewport, position above the button
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < 120 ? rect.top - 44 : rect.bottom + 4;
    setDropdownPos({ top, left: Math.max(8, left) });
    setActiveDropdown(patientId);
  }, []);

  // Close dropdown on click outside or scroll
  useEffect(() => {
    if (!activeDropdown) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    }
    function handleScroll() { setActiveDropdown(null); }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [activeDropdown]);

  // Map patientId → active PATIENT_DROPOUT_RISK events for badge display
  const patientInsightMap = useMemo(() => {
    const map = new Map<string, InsightEvent>();
    for (const e of activeEvents) {
      if (e.type === "PATIENT_DROPOUT_RISK" && e.patientId && !e.resolvedAt) {
        map.set(e.patientId, e);
      }
    }
    return map;
  }, [activeEvents]);

  const q = (searchQuery ?? "").trim().toLowerCase();
  const searchedPatients = q
    ? patients.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.contact?.phone ?? "").includes(q),
      )
    : patients;

  // Sort once across the whole filtered set so grouping preserves the chosen order.
  const filteredPatients = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...searchedPatients].sort((a, b) => {
      const av = patientSortValue(a, sortKey);
      const bv = patientSortValue(b, sortKey);
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv)) * dir;
      }
      return (av - bv) * dir;
    });
  }, [searchedPatients, sortKey, sortDir]);

  // Reset every segment's page when the inputs that change the row set change.
  useEffect(() => {
    setPageByState({});
  }, [q, sortKey, sortDir, segmentFilter]);

  const grouped = SEGMENT_ORDER
    .filter((s) => visibleSegments.includes(s))
    .filter((s) => segmentFilter === "ALL" || s === segmentFilter)
    .map((state) => ({
      state,
      patients: filteredPatients.filter((p) => (p.lifecycleState ?? "ACTIVE") === state),
    }))
    .filter((g) => g.patients.length > 0);

  // Segment options for the filter dropdown — only segments that currently have rows.
  const availableSegments = SEGMENT_ORDER
    .filter((s) => visibleSegments.includes(s))
    .filter((s) => filteredPatients.some((p) => (p.lifecycleState ?? "ACTIVE") === s));

  function setPage(state: LifecycleState, page: number) {
    setPageByState((prev) => ({ ...prev, [state]: page }));
  }

  const isSearch = q.length > 0;

  return (
    <>
      {/* Sort + filter toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-2.5 py-1.5 shadow-[var(--shadow-card)]">
          <ArrowUpDown size={13} className="text-muted" />
          <span className="text-[11px] font-medium text-muted">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-transparent text-xs font-semibold text-navy focus:outline-none cursor-pointer"
            aria-label="Sort patients by"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="text-[11px] font-semibold text-teal hover:text-teal/80 transition-colors px-1"
            aria-label={`Sort direction ${sortDir === "asc" ? "ascending" : "descending"}`}
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-2.5 py-1.5 shadow-[var(--shadow-card)]">
          <ListFilter size={13} className="text-muted" />
          <span className="text-[11px] font-medium text-muted">Segment</span>
          <select
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value as LifecycleState | "ALL")}
            className="bg-transparent text-xs font-semibold text-navy focus:outline-none cursor-pointer"
            aria-label="Filter by lifecycle segment"
          >
            <option value="ALL">All segments</option>
            {availableSegments.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          module="pulse"
          heading={isSearch ? `No patients match "${searchQuery}"` : "No patients match your filters"}
          subtext={isSearch ? "Try a different name or phone number." : "Adjust your segment filters in Customise View."}
        />
      ) : (
      <div className="space-y-4">
        {grouped.map(({ state, patients: group }) => {
          const isCollapsed = collapsed.has(state);
          const totalPages = Math.max(1, Math.ceil(group.length / PAGE_SIZE));
          const currentPage = Math.min(pageByState[state] ?? 1, totalPages);
          const pageStart = (currentPage - 1) * PAGE_SIZE;
          const pageItems = group.slice(pageStart, pageStart + PAGE_SIZE);
          const avgRisk = group
            .filter((p) => p.riskScore !== undefined)
            .reduce((acc, p, _, arr) => acc + (p.riskScore ?? 0) / arr.length, 0);

          return (
            <GlassCard key={state} variant="standard" tint="pulse">
              <button
                onClick={() => setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (isCollapsed) { next.delete(state); } else { next.add(state); }
                  return next;
                })}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  {isCollapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  <LifecycleStateBadge state={state} />
                  <span className="text-xs text-gray-500">{group.length} patient{group.length !== 1 ? "s" : ""}</span>
                  {avgRisk > 0 && group[0]?.riskScore !== undefined && (
                    <span className="text-[10px] text-gray-400">
                      · avg risk <RiskScoreBadge score={Math.round(avgRisk)} size="sm" />
                    </span>
                  )}
                </div>
              </button>

              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.2, ease: EASING_ARRAY }}
                    className="overflow-hidden"
                  >
                    <div className="divide-y divide-gray-100">
                      {pageItems.map((p) => {
                        const clinician = clinicianMap[p.clinicianId];
                        const isExpanded = expanded.has(p.id);
                        const lastSeen = p.lastSessionDate ? daysSince(p.lastSessionDate) : null;
                        const isDropdownOpen = activeDropdown === p.id;

                        return (
                          <GlassCard key={p.id} variant="row" tint="pulse" className="px-4 py-3">
                            <div
                              className="flex items-center gap-3 cursor-pointer"
                              onClick={() => setExpanded((prev) => {
                                const next = new Set(prev);
                                if (isExpanded) { next.delete(p.id); } else { next.add(p.id); }
                                return next;
                              })}
                            >
                              <div className="w-8 h-8 rounded-full bg-blue/10 flex items-center justify-center text-[10px] font-bold text-blue shrink-0">
                                {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isDropdownOpen) {
                                      setActiveDropdown(null);
                                    } else {
                                      openDropdown(p.id, e.currentTarget);
                                    }
                                  }}
                                  className="text-sm font-semibold text-navy truncate hover:text-teal transition-colors text-left"
                                >
                                  {p.name}
                                </button>
                                <p className="text-[11px] text-gray-400">
                                  {visibleMetrics.includes("sessions") && `${p.sessionCount}/${p.treatmentLength} sessions`}
                                  {visibleMetrics.includes("clinician") && clinician ? ` · ${clinician.name}` : ""}
                                  {visibleMetrics.includes("lastVisit") && lastSeen !== null ? ` · Last ${lastSeen}d ago` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {/* Heidi complexity indicators */}
                                {p.complexitySignals && (
                                  <ComplexityIndicators signals={p.complexitySignals} />
                                )}
                                {/* Intelligence flag badge */}
                                {patientInsightMap.has(p.id) && (() => {
                                  const evt = patientInsightMap.get(p.id)!;
                                  const days = (evt.metadata?.daysSinceLastSession as number) ?? "?";
                                  return (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                      style={INSIGHT_BADGE_STYLE}
                                      title={evt.suggestedAction}
                                    >
                                      <AlertCircle size={10} />
                                      No rebooking in {days}d
                                      {evt.pulseActionId && (
                                        <span className="ml-0.5 text-[9px] opacity-70">· nudged</span>
                                      )}
                                    </span>
                                  );
                                })()}
                                {visibleMetrics.includes("riskScore") && p.riskScore !== undefined && (
                                  <RiskScoreBadge score={p.riskScore} />
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); onSendReminder(p.id); }}
                                  className="text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors"
                                >
                                  Re-engage →
                                </button>
                              </div>
                            </div>

                            {isExpanded && p.riskFactors && (
                              <RiskFactorPanel factors={p.riskFactors} />
                            )}
                            {isExpanded && p.complexitySignals && (
                              <ComplexityPanel
                                signals={p.complexitySignals}
                                updatedAt={p.complexityUpdatedAt}
                              />
                            )}
                            {isExpanded && p.heidiPatientId && (
                              <ClinicalNotesPanel patientId={p.id} />
                            )}
                          </GlassCard>
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
                        <span className="text-[11px] text-gray-400">
                          {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, group.length)} of {group.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPage(state, currentPage - 1)}
                            disabled={currentPage <= 1}
                            className="p-1 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            aria-label="Previous page"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          {getPageNumbers(currentPage, totalPages).map((pg, i) =>
                            pg === "…" ? (
                              <span key={`gap-${i}`} className="px-1.5 text-[11px] text-gray-300">…</span>
                            ) : (
                              <button
                                key={pg}
                                type="button"
                                onClick={() => setPage(state, pg as number)}
                                className={`min-w-[26px] h-[26px] rounded-md text-[11px] font-semibold transition-colors ${
                                  pg === currentPage ? "bg-teal text-white" : "text-gray-500 hover:bg-gray-100"
                                }`}
                              >
                                {pg}
                              </button>
                            )
                          )}
                          <button
                            type="button"
                            onClick={() => setPage(state, currentPage + 1)}
                            disabled={currentPage >= totalPages}
                            className="p-1 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            aria-label="Next page"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          );
        })}
      </div>
      )}

      {/* Fixed-position action dropdown (avoids overflow-hidden clipping) */}
      {activeDropdown && dropdownPos && (() => {
        const patient = patients.find((p) => p.id === activeDropdown);
        if (!patient) return null;
        return (
          <div
            ref={dropdownRef}
            className="fixed z-50 min-w-[160px] rounded-[8px] border border-border bg-white shadow-[var(--shadow-elevated)] py-1"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <button
              onClick={() => {
                setActiveDropdown(null);
                setEditingPatient(patient);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-navy hover:bg-cloud-light transition-colors text-left"
            >
              <Pencil size={13} style={{ color: brand.teal }} />
              Edit patient
            </button>
          </div>
        );
      })()}

      {/* Edit modal */}
      {editingPatient && clinicId && (
        <PatientEditModal
          patient={editingPatient}
          clinicianMap={clinicianMap}
          clinicId={clinicId}
          onClose={() => setEditingPatient(null)}
        />
      )}
    </>
  );
};
