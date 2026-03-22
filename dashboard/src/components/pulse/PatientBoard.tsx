"use client";

import { useState, useRef, useEffect, useMemo, type FC } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronRight, AlertCircle, Pencil } from "lucide-react";
import type { Patient, LifecycleState, Clinician } from "@/types";
import { RiskScoreBadge } from "./RiskScoreBadge";
import { LifecycleStateBadge } from "./LifecycleStateBadge";
import { RiskFactorPanel } from "./RiskFactorPanel";
import { PatientEditModal } from "./PatientEditModal";
import EmptyState from "@/components/ui/EmptyState";
import { daysSince } from "@/lib/utils";
import { useInsightEvents } from "@/hooks/useInsightEvents";
import { brand } from "@/lib/brand";
import type { InsightEvent } from "@/types/insight-events";

interface Props {
  patients: Patient[];
  clinicianMap: Record<string, Clinician>;
  clinicId: string | null;
  visibleSegments: LifecycleState[];
  visibleMetrics: string[];
  onSendReminder: (patientId: string) => void;
}

const SEGMENT_ORDER: LifecycleState[] = [
  "ONBOARDING", "ACTIVE", "AT_RISK", "LAPSED", "RE_ENGAGED", "NEW", "DISCHARGED", "CHURNED",
];

export const PatientBoard: FC<Props> = ({
  patients,
  clinicianMap,
  clinicId,
  visibleSegments,
  visibleMetrics,
  onSendReminder,
}) => {
  const [collapsed, setCollapsed] = useState<Set<LifecycleState>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { activeEvents } = useInsightEvents();

  // Close dropdown on click outside
  useEffect(() => {
    if (!activeDropdown) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

  const grouped = SEGMENT_ORDER
    .filter((s) => visibleSegments.includes(s))
    .map((state) => ({
      state,
      patients: patients.filter((p) => (p.lifecycleState ?? "ACTIVE") === state),
    }))
    .filter((g) => g.patients.length > 0);

  if (grouped.length === 0) {
    return (
      <EmptyState
        module="pulse"
        heading="No patients match your filters"
        subtext="Adjust your segment filters in Customise View."
      />
    );
  }

  return (
    <>
      <div className="space-y-4">
        {grouped.map(({ state, patients: group }) => {
          const isCollapsed = collapsed.has(state);
          const avgRisk = group
            .filter((p) => p.riskScore !== undefined)
            .reduce((acc, p, _, arr) => acc + (p.riskScore ?? 0) / arr.length, 0);

          return (
            <div key={state} className="rounded-[12px] border border-border bg-white shadow-sm overflow-hidden">
              <button
                onClick={() => setCollapsed((prev) => {
                  const next = new Set(prev);
                  isCollapsed ? next.delete(state) : next.add(state);
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
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="divide-y divide-gray-100">
                      {group.map((p) => {
                        const clinician = clinicianMap[p.clinicianId];
                        const isExpanded = expanded.has(p.id);
                        const lastSeen = p.lastSessionDate ? daysSince(p.lastSessionDate) : null;
                        const isDropdownOpen = activeDropdown === p.id;

                        return (
                          <div key={p.id} className="px-4 py-3">
                            <div
                              className="flex items-center gap-3 cursor-pointer"
                              onClick={() => setExpanded((prev) => {
                                const next = new Set(prev);
                                isExpanded ? next.delete(p.id) : next.add(p.id);
                                return next;
                              })}
                            >
                              <div className="w-8 h-8 rounded-full bg-blue/10 flex items-center justify-center text-[10px] font-bold text-blue shrink-0">
                                {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                              </div>
                              <div className="flex-1 min-w-0 relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveDropdown(isDropdownOpen ? null : p.id);
                                  }}
                                  className="text-sm font-semibold text-navy truncate hover:text-teal transition-colors text-left"
                                >
                                  {p.name}
                                </button>
                                <p className="text-[11px] text-gray-400">
                                  {visibleMetrics.includes("sessions") && `${p.sessionCount}/${p.courseLength} sessions`}
                                  {visibleMetrics.includes("clinician") && clinician ? ` · ${clinician.name}` : ""}
                                  {visibleMetrics.includes("lastVisit") && lastSeen !== null ? ` · Last ${lastSeen}d ago` : ""}
                                </p>

                                {/* Action dropdown */}
                                {isDropdownOpen && (
                                  <div
                                    ref={dropdownRef}
                                    className="absolute left-0 top-full mt-1 z-30 min-w-[160px] rounded-[8px] border border-border bg-white shadow-[var(--shadow-elevated)] py-1"
                                  >
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveDropdown(null);
                                        setEditingPatient(p);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-navy hover:bg-cloud-light transition-colors text-left"
                                    >
                                      <Pencil size={13} style={{ color: brand.teal }} />
                                      Edit patient
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {/* Intelligence flag badge */}
                                {patientInsightMap.has(p.id) && (() => {
                                  const evt = patientInsightMap.get(p.id)!;
                                  const days = (evt.metadata?.daysSinceLastSession as number) ?? "?";
                                  return (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                      style={{ background: `${brand.purple}12`, color: brand.purple }}
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
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

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
