"use client";

import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

interface OnboardingChecklistProps {
  pmsConnected: boolean;
  cliniciansConfirmed: boolean;
  targetsSet: boolean;
}

export default function OnboardingChecklist({
  pmsConnected,
  cliniciansConfirmed,
  targetsSet,
}: OnboardingChecklistProps) {
  const steps = [
    { key: "pmsConnected", label: "Connect your PMS", desc: "Link WriteUpp or Cliniko to sync patient data", done: pmsConnected },
    { key: "cliniciansConfirmed", label: "Confirm your clinicians", desc: "Add or verify the clinicians in your practice", done: cliniciansConfirmed },
    { key: "targetsSet", label: "Set your KPI targets", desc: "Define follow-up rate, physitrack, and utilisation targets", done: targetsSet },
  ];

  return (
    <div className="rounded-[var(--radius-card)] border-2 border-blue/30 bg-blue/5 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-9 w-9 rounded-xl bg-blue/10 flex items-center justify-center">
          <ArrowRight size={16} className="text-blue" />
        </div>
        <div>
          <h3 className="font-display text-lg text-navy">Get started</h3>
          <p className="text-xs text-muted">Complete these steps to activate your dashboard</p>
        </div>
      </div>
      <div className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.key}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              step.done
                ? "border-success/20 bg-success/5"
                : "border-border bg-white"
            }`}
          >
            {step.done ? (
              <CheckCircle2 size={18} className="text-success shrink-0" />
            ) : (
              <Circle size={18} className="text-muted/70 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.done ? "text-success" : "text-navy"}`}>
                {step.label}
              </p>
              <p className="text-[11px] text-muted">{step.desc}</p>
            </div>
            {step.done && (
              <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">
                Done
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
