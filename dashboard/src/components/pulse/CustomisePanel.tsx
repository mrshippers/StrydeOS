"use client";

import { type FC } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { LifecycleState, SequenceType } from "@/types";
import type { UserPreferences } from "@/hooks/useUserPreferences";

interface Props {
  open: boolean;
  onClose: () => void;
  preferences: UserPreferences;
  onUpdate: (partial: Partial<UserPreferences>) => void;
}

const SEGMENTS: { value: LifecycleState; label: string }[] = [
  { value: "ONBOARDING",  label: "Onboarding (sessions 1–3)" },
  { value: "ACTIVE",      label: "Active" },
  { value: "AT_RISK",     label: "At Risk" },
  { value: "LAPSED",      label: "Lapsed" },
  { value: "RE_ENGAGED",  label: "Re-engaged" },
  { value: "DISCHARGED",  label: "Discharged" },
  { value: "CHURNED",     label: "Churned" },
  { value: "NEW",         label: "New (no sessions yet)" },
];

const METRICS: { value: string; label: string }[] = [
  { value: "riskScore",        label: "Risk Score" },
  { value: "lifecycleState",   label: "Lifecycle State" },
  { value: "sessions",         label: "Session Count" },
  { value: "lastVisit",        label: "Last Visit" },
  { value: "nextAppointment",  label: "Next Appointment" },
  { value: "hepStatus",        label: "HEP Status" },
  { value: "followUpBooked",   label: "Follow-up Booked" },
  { value: "clinician",        label: "Clinician" },
];

const SEQUENCES: { value: SequenceType; label: string }[] = [
  { value: "early_intervention", label: "Early Intervention" },
  { value: "rebooking_prompt",   label: "Re-booking Prompt" },
  { value: "hep_reminder",       label: "HEP Reminder" },
  { value: "review_prompt",      label: "Review Prompt" },
  { value: "reactivation_90d",   label: "90-Day Reactivation" },
  { value: "reactivation_180d",  label: "180-Day Reactivation" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${checked ? "bg-[#0891B2]" : "bg-gray-200"}`}
    >
      <div
        className="w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all"
        style={{ left: checked ? "1.25rem" : "0.125rem" }}
      />
    </button>
  );
}

function ToggleGroup<T extends string>({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T, checked: boolean) => void;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-[#0B2545] uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-2.5">
        {items.map(({ value, label }) => (
          <div key={value} className="flex items-center justify-between gap-3">
            <span className="text-sm text-[#0B2545]">{label}</span>
            <Toggle
              checked={selected.includes(value)}
              onChange={(v) => onToggle(value, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export const CustomisePanel: FC<Props> = ({ open, onClose, preferences, onUpdate }) => {
  function toggleSegment(value: LifecycleState, checked: boolean) {
    const next = checked
      ? [...preferences.visibleSegments, value]
      : preferences.visibleSegments.filter((s) => s !== value);
    onUpdate({ visibleSegments: next });
  }

  function toggleMetric(value: string, checked: boolean) {
    const next = checked
      ? [...preferences.visibleMetrics, value]
      : preferences.visibleMetrics.filter((m) => m !== value);
    onUpdate({ visibleMetrics: next });
  }

  function toggleSequenceType(value: SequenceType, checked: boolean) {
    const next = checked
      ? [...preferences.visibleSequenceTypes, value]
      : preferences.visibleSequenceTypes.filter((s) => s !== value);
    onUpdate({ visibleSequenceTypes: next });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-[#0B2545]/20 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white shadow-xl overflow-y-auto"
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={15} className="text-[#0891B2]" />
                <h2 className="text-sm font-semibold text-[#0B2545]">Customise View</h2>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-[#0B2545] transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-7">
              <ToggleGroup
                title="Patient Segments"
                items={SEGMENTS}
                selected={preferences.visibleSegments}
                onToggle={toggleSegment}
              />
              <div className="border-t border-gray-100" />
              <ToggleGroup
                title="Metric Columns"
                items={METRICS}
                selected={preferences.visibleMetrics}
                onToggle={toggleMetric}
              />
              <div className="border-t border-gray-100" />
              <ToggleGroup
                title="Sequence Types"
                items={SEQUENCES}
                selected={preferences.visibleSequenceTypes}
                onToggle={toggleSequenceType}
              />
              <div className="border-t border-gray-100" />
              <div>
                <h3 className="text-xs font-semibold text-[#0B2545] uppercase tracking-wide mb-3">Revenue</h3>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[#0B2545]">Show attributed revenue</span>
                  <Toggle
                    checked={preferences.showRevenue}
                    onChange={(v) => onUpdate({ showRevenue: v })}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
