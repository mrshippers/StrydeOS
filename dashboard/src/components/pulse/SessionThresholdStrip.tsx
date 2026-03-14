"use client";

import type { FC } from "react";
import { Zap } from "lucide-react";
import type { Patient, Clinician } from "@/types";
import { daysSince } from "@/lib/utils";

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
    <div className="rounded-[12px] border-l-4 border-[#0891B2] bg-[#0891B2]/5 border border-[#0891B2]/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} className="text-[#0891B2]" />
        <h3 className="text-sm font-semibold text-[#0891B2]">
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
                <div className="w-7 h-7 rounded-full bg-[#0891B2]/15 flex items-center justify-center text-[10px] font-bold text-[#0891B2] shrink-0">
                  {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0B2545] truncate">{p.name}</p>
                  <p className="text-[11px] text-muted">
                    Session {p.sessionCount} of {p.courseLength}
                    {clinician ? ` · ${clinician.name}` : ""}
                    {lastSeen !== null ? ` · Last seen ${lastSeen}d ago` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onSendEarlyIntervention(p.id)}
                className="text-[11px] font-semibold text-[#0891B2] hover:text-[#0670A0] transition-colors whitespace-nowrap shrink-0"
              >
                Send intervention →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
