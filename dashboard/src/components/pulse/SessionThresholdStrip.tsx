"use client";

import type { FC } from "react";
import { Zap } from "lucide-react";
import type { Patient, Clinician } from "@/types";
import { daysSince } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";

interface Props {
  patients: Patient[];
  clinicianMap: Record<string, Clinician>;
  onSendEarlyIntervention: (patientId: string) => void;
}

export const SessionThresholdStrip: FC<Props> = ({
  patients,
  clinicianMap,
  onSendEarlyIntervention,
}) => {
  const onboarding = patients.filter((p) => p.sessionThresholdAlert);
  if (onboarding.length === 0) return null;

  return (
    <GlassCard variant="standard" tint="pulse" className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} className="text-teal" />
        <h3 className="text-sm font-semibold text-teal">
          Session 1–3 Early Intervention · {onboarding.length} patient{onboarding.length !== 1 ? "s" : ""}
        </h3>
        <span className="text-[10px] text-muted ml-1">Highest dropout risk window</span>
      </div>
      <div className="space-y-2">
        {onboarding.map((p) => {
          const clinician = clinicianMap[p.clinicianId];
          const lastSeen = p.lastSessionDate ? daysSince(p.lastSessionDate) : null;
          return (
            <div key={p.id} className="flex items-center justify-between gap-3 py-1.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-teal/15 flex items-center justify-center text-[10px] font-bold text-teal shrink-0">
                  {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy truncate">{p.name}</p>
                  <p className="text-[11px] text-muted">
                    Session {p.sessionCount} of {p.treatmentLength}
                    {clinician ? ` · ${clinician.name}` : ""}
                    {lastSeen !== null ? ` · Last seen ${lastSeen}d ago` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onSendEarlyIntervention(p.id)}
                className="text-[11px] font-semibold text-teal hover:text-blue-bright transition-colors whitespace-nowrap shrink-0"
              >
                Send intervention →
              </button>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};
