"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CheckCircle2, Circle, X, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const DISMISSED_KEY = "strydeos_onboarding_dismissed";

interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
}

function ProgressRing({ progress, size = 28, stroke = 3 }: { progress: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - progress * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#4B8BF5"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
}

export default function OnboardingWidget() {
  const { user } = useAuth();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  const cp = user?.clinicProfile;
  const onboarding = cp?.onboarding ?? {
    pmsConnected: false,
    cliniciansConfirmed: false,
    targetsSet: false,
  };
  const isOnboarding = cp?.status === "onboarding";
  const allComplete =
    onboarding.pmsConnected &&
    onboarding.cliniciansConfirmed &&
    onboarding.targetsSet;

  useEffect(() => {
    if (!isOnboarding || allComplete) {
      setDismissed(true);
      return;
    }
    try {
      const wasDismissed = localStorage.getItem(DISMISSED_KEY);
      if (wasDismissed === cp?.id) {
        setDismissed(true);
      } else {
        setDismissed(false);
        setModalOpen(true);
      }
    } catch {
      setDismissed(false);
      setModalOpen(true);
    }
  }, [isOnboarding, allComplete, cp?.id]);

  if (!isOnboarding || allComplete) return null;

  const steps: OnboardingStep[] = [
    {
      key: "pms",
      label: "Connect your PMS",
      description: "Link WriteUpp, Cliniko, Halaxy, or Zanda to sync patient data",
      done: onboarding.pmsConnected,
    },
    {
      key: "clinicians",
      label: "Confirm your clinicians",
      description: "Add or verify the clinicians in your practice",
      done: onboarding.cliniciansConfirmed,
    },
    {
      key: "targets",
      label: "Set your KPI targets",
      description: "Define follow-up rate, physitrack, and utilisation targets",
      done: onboarding.targetsSet,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progress = completedCount / steps.length;

  function handleDismissModal() {
    setModalOpen(false);
    try {
      localStorage.setItem(DISMISSED_KEY, cp?.id ?? "");
    } catch {
      // localStorage unavailable
    }
  }

  function handleGoToSettings() {
    setModalOpen(false);
    router.push("/onboarding");
  }

  return (
    <>
      {/* Floating pill */}
      <AnimatePresence>
        {!modalOpen && !dismissed && (
          <motion.button
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={() => setModalOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-full shadow-[var(--shadow-elevated)] hover:shadow-lg transition-shadow"
            style={{
              background: "#0B2545",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <ProgressRing progress={progress} />
            <span className="text-xs font-semibold text-white/80">
              Setup: {completedCount}/{steps.length} complete
            </span>
            <Zap size={12} className="text-blue-glow" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Modal overlay */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-4"
            style={{ background: "rgba(11, 37, 69, 0.6)", backdropFilter: "blur(4px)" }}
            onClick={handleDismissModal}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl p-0 overflow-hidden"
              style={{
                background: "#fff",
                boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
              }}
            >
              {/* Header */}
              <div className="relative px-6 pt-6 pb-4" style={{ background: "linear-gradient(135deg, #0B2545, #132D5E)" }}>
                <button
                  onClick={handleDismissModal}
                  className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={14} />
                </button>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #1C54F2, #4B8BF5)" }}
                  >
                    <Zap size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl text-white leading-tight">
                      Welcome to StrydeOS
                    </h2>
                    <p className="text-xs text-white/40 mt-0.5">
                      {cp?.name ? `Let's get ${cp.name} set up` : "Let's get your clinic set up"}
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "#4B8BF5" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Steps */}
              <div className="px-6 py-4 space-y-3">
                {steps.map((step, i) => (
                  <motion.div
                    key={step.key}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                      step.done
                        ? "border-success/20 bg-success/5"
                        : "border-border bg-cloud-light/50"
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
                      <p className="text-[11px] text-muted">{step.description}</p>
                    </div>
                    {step.done && (
                      <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">
                        Done
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* CTA */}
              <div className="px-6 pb-6 pt-2">
                <button
                  onClick={handleGoToSettings}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:opacity-90"
                  style={{ background: "#1C54F2" }}
                >
                  {completedCount === 0 ? "Let's get started" : "Continue setup"}
                  <ArrowRight size={14} />
                </button>
                <button
                  onClick={handleDismissModal}
                  className="w-full mt-2 py-2 text-xs text-muted hover:text-navy transition-colors text-center"
                >
                  I'll do this later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
