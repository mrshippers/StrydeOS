"use client";

import { useState, type FC } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Patient, LifecycleState, Clinician } from "@/types";
import { RiskScoreBadge } from "./RiskScoreBadge";
import { LifecycleStateBadge } from "./LifecycleStateBadge";
import { RiskFactorPanel } from "./RiskFactorPanel";
import EmptyState from "@/components/ui/EmptyState";
import { daysSince } from "@/lib/utils";

interface Props {
  patients: Patient[];
  clinicianMap: Record<string, Clinician>;
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
  visibleSegments,
  visibleMetrics,
  onSendReminder,
}) => {
  const [collapsed, setCollapsed] = useState<Set<LifecycleState>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
                            <div className="w-8 h-8 rounded-full bg-[#1C54F2]/10 flex items-center justify-center text-[10px] font-bold text-[#1C54F2] shrink-0">
                              {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[#0B2545] truncate">{p.name}</p>
                              <p className="text-[11px] text-gray-400">
                                {visibleMetrics.includes("sessions") && `${p.sessionCount}/${p.courseLength} sessions`}
                                {visibleMetrics.includes("clinician") && clinician ? ` · ${clinician.name}` : ""}
                                {visibleMetrics.includes("lastVisit") && lastSeen !== null ? ` · Last ${lastSeen}d ago` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {visibleMetrics.includes("riskScore") && p.riskScore !== undefined && (
                                <RiskScoreBadge score={p.riskScore} />
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); onSendReminder(p.id); }}
                                className="text-[11px] font-semibold text-[#1C54F2] hover:text-[#2E6BFF] transition-colors"
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
  );
};
