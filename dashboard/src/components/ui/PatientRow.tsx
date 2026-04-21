"use client";

import Link from "next/link";
import type { Patient, Clinician } from "@/types";
import { getInitials, daysSince } from "@/lib/utils";

interface PatientRowProps {
  patient: Patient;
  clinician?: Clinician;
  onSendReminder?: (patientId: string) => void;
}

export default function PatientRow({
  patient,
  clinician,
  onSendReminder,
}: PatientRowProps) {
  const progress = Math.round((patient.sessionCount / patient.treatmentLength) * 100);
  const daysSinceLast = patient.lastSessionDate ? daysSince(patient.lastSessionDate) : 0;

  return (
    <Link
      href={`/patients/${patient.id}`}
      className="block rounded-xl bg-white border border-border p-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-navy flex items-center justify-center text-[11px] font-bold text-white shrink-0">
          {getInitials(patient.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-navy truncate">
            {patient.name}
          </p>
          {clinician && (
            <p className="text-[11px] text-muted">{clinician.name}</p>
          )}
        </div>
        {patient.churnRisk && (
          <span className="text-[10px] font-semibold bg-warn/10 text-warn px-2 py-0.5 rounded-full border border-warn/20 shrink-0">
            No rebook · {daysSinceLast}d
          </span>
        )}
      </div>

      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[11px] text-muted">
            {patient.sessionCount} of {patient.treatmentLength} sessions
          </span>
          <span className="text-[11px] font-semibold text-navy">{progress}%</span>
        </div>
        <div className="h-1.5 bg-cloud-dark rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: "var(--color-blue-glow)",
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted">
          Last session: {daysSinceLast}d ago
        </span>
        {onSendReminder && !patient.discharged && (
          <button
            onClick={(e) => { e.preventDefault(); onSendReminder(patient.id); }}
            className="text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors"
          >
            Send reminder
          </button>
        )}
      </div>
    </Link>
  );
}
