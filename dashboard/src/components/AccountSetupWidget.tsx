"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Circle, X, ChevronDown, ChevronUp, User, Building2, Link2, Users, Target } from "lucide-react";
import { collection, query, where, limit, getDocs, getFirestore } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { brand } from "@/lib/brand";

const DISMISSED_KEY = "strydeos_account_setup_dismissed";
const CLOSED_KEY = "strydeos_account_setup_closed";

interface SetupStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

function CircularProgress({ completed, total, size = 32 }: { completed: number; total: number; size?: number }) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const offset = circumference - progress * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={brand.blueGlow}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/80"
      >
        {completed}/{total}
      </span>
    </div>
  );
}

export default function AccountSetupWidget() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [closed, setClosed] = useState(true);

  const cp = user?.clinicProfile;
  const clinicId = cp?.id ?? null;
  const onboarding = cp?.onboarding ?? {
    pmsConnected: false,
    cliniciansConfirmed: false,
    targetsSet: false,
  };

  // Verify clinician flag against real data — flag can be stale
  const [hasClinicians, setHasClinicians] = useState(false);
  useEffect(() => {
    if (!clinicId) return;
    const db = getFirestore();
    const q = query(
      collection(db, "clinics", clinicId, "clinicians"),
      where("active", "==", true),
      limit(1),
    );
    getDocs(q).then((snap) => setHasClinicians(!snap.empty)).catch(() => {});
  }, [clinicId]);

  const steps: SetupStep[] = useMemo(() => {
    if (!user || !cp) return [];

    const hasProfile = !!(user.firstName?.trim() && user.lastName?.trim());
    const hasClinicDetails = !!(cp.address?.trim() && cp.phone?.trim());

    return [
      {
        key: "profile",
        label: "Complete your profile",
        description: "Add your first and last name",
        done: hasProfile,
        href: "/settings",
        icon: User,
      },
      {
        key: "clinic",
        label: "Add clinic details",
        description: "Address and phone number",
        done: hasClinicDetails,
        href: "/settings",
        icon: Building2,
      },
      {
        key: "pms",
        label: "Connect your PMS",
        description: "Link WriteUpp, Cliniko, or another provider",
        done: onboarding.pmsConnected,
        href: "/settings",
        icon: Link2,
      },
      {
        key: "clinicians",
        label: "Add your clinicians",
        description: "Confirm the team in your practice",
        done: onboarding.cliniciansConfirmed && hasClinicians,
        href: "/settings",
        icon: Users,
      },
      {
        key: "targets",
        label: "Set KPI targets",
        description: "Define follow-up, HEP, and utilisation goals",
        done: onboarding.targetsSet,
        href: "/settings",
        icon: Target,
      },
    ];
  }, [user, cp, onboarding.pmsConnected, onboarding.cliniciansConfirmed, onboarding.targetsSet, hasClinicians]);

  const completedCount = steps.filter((s) => s.done).length;
  const allComplete = steps.length > 0 && completedCount === steps.length;
  const isOnboarding = cp?.status === "onboarding";

  // Determine visibility on mount
  useEffect(() => {
    // Only show for onboarding clinics that haven't completed everything
    if (!isOnboarding || allComplete || !user) {
      setDismissed(true);
      return;
    }
    try {
      const wasDismissed = localStorage.getItem(DISMISSED_KEY);
      if (wasDismissed === cp?.id) {
        setDismissed(true);
        return;
      }
      const wasClosed = localStorage.getItem(CLOSED_KEY);
      if (wasClosed === cp?.id) {
        setClosed(true);
      } else {
        setClosed(false);
      }
      setDismissed(false);
    } catch {
      setDismissed(false);
      setClosed(false);
    }
  }, [isOnboarding, allComplete, user, cp?.id]);

  if (!user || !cp || dismissed || allComplete || !isOnboarding) return null;

  function handleClose() {
    setOpen(false);
    setClosed(true);
    try {
      localStorage.setItem(CLOSED_KEY, cp?.id ?? "");
    } catch {
      // localStorage unavailable
    }
  }

  function handleDismissPermanently() {
    setOpen(false);
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, cp?.id ?? "");
    } catch {
      // localStorage unavailable
    }
  }

  function handleStepClick(href: string) {
    setOpen(false);
    router.push(href);
  }

  function handleReopen() {
    setClosed(false);
    setOpen(true);
    try {
      localStorage.removeItem(CLOSED_KEY);
    } catch {
      // localStorage unavailable
    }
  }

  return (
    <>
      {/* Collapsed pill — shows when closed but not permanently dismissed */}
      <AnimatePresence>
        {closed && !dismissed && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -8 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={handleReopen}
            className="fixed top-4 right-4 z-50 flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
            style={{
              background: brand.navy,
              border: `1px solid rgba(255,255,255,0.1)`,
            }}
            title="Complete your account setup"
          >
            <CircularProgress completed={completedCount} total={steps.length} size={28} />
            <span className="text-[11px] font-semibold text-white/70">Setup</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Expanded floating menu */}
      <AnimatePresence>
        {!closed && !dismissed && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed top-4 right-4 z-50 w-[320px] rounded-2xl overflow-hidden shadow-xl"
            style={{
              background: brand.navy,
              border: `1px solid rgba(255,255,255,0.08)`,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-3">
                <CircularProgress completed={completedCount} total={steps.length} size={36} />
                <div>
                  <p className="text-sm font-semibold text-white leading-tight">
                    Complete your account
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {completedCount} of {steps.length} done
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setOpen(!open)}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
                >
                  {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button
                  onClick={handleClose}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-4 pb-3">
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: brand.blueGlow }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(completedCount / steps.length) * 100}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* Collapsed: show next incomplete step */}
            {!open && (
              <div className="px-4 pb-4">
                {(() => {
                  const next = steps.find((s) => !s.done);
                  if (!next) return null;
                  const Icon = next.icon;
                  return (
                    <button
                      onClick={() => handleStepClick(next.href)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5"
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(75, 139, 245, 0.15)" }}>
                        <Icon size={14} className="text-blue-glow" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-white/80">{next.label}</p>
                        <p className="text-[10px] text-white/30">{next.description}</p>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(75, 139, 245, 0.15)", color: brand.blueGlow }}>
                        Next
                      </span>
                    </button>
                  );
                })()}
              </div>
            )}

            {/* Expanded: show all steps */}
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-3 space-y-1">
                    {steps.map((step, i) => {
                      const Icon = step.icon;
                      return (
                        <motion.button
                          key={step.key}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04, duration: 0.2 }}
                          onClick={() => !step.done && handleStepClick(step.href)}
                          disabled={step.done}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                            step.done
                              ? "opacity-60 cursor-default"
                              : "hover:bg-white/5 cursor-pointer"
                          }`}
                        >
                          {step.done ? (
                            <CheckCircle2 size={16} className="shrink-0" style={{ color: brand.success }} />
                          ) : (
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(75, 139, 245, 0.15)" }}>
                              <Icon size={14} className="text-blue-glow" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-[12px] font-medium ${step.done ? "text-white/40 line-through" : "text-white/80"}`}>
                              {step.label}
                            </p>
                            {!step.done && (
                              <p className="text-[10px] text-white/30">{step.description}</p>
                            )}
                          </div>
                          {step.done && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: `${brand.success}15`, color: brand.success }}>
                              Done
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Dismiss permanently */}
                  <div className="px-4 pb-4 pt-1">
                    <button
                      onClick={handleDismissPermanently}
                      className="w-full text-center text-[10px] text-white/20 hover:text-white/40 transition-colors py-1"
                    >
                      Don't show this again
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
