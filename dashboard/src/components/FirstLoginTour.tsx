"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Compass } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useSidebar } from "@/context/SidebarContext";
import TourStep, { type TourStepDef } from "./TourStep";

const TOUR_STEPS: TourStepDef[] = [
  {
    target: "[data-tour='sidebar-nav']",
    title: "Your navigation",
    body: "Everything lives here — Dashboard, Clinicians, Pulse, Ava, and Intelligence. Each module tracks a different dimension of your practice.",
    placement: "right",
  },
  {
    target: "[data-tour='stat-cards']",
    title: "Your clinical metrics",
    body: "These cards show your key performance indicators in real time. Green means on target, amber means approaching threshold, red needs attention.",
    placement: "bottom",
  },
  {
    target: "[data-tour='clinician-filter']",
    title: "Filter by clinician",
    body: "Switch between individual clinicians or view the whole clinic at a glance. Navigate weeks using the arrow buttons.",
    placement: "bottom",
  },
  {
    target: "[data-tour='notification-bell']",
    title: "Alerts & notifications",
    body: "When any metric drops below target, you'll see a badge here. Click to review which clinicians need support and on which KPIs.",
    placement: "bottom",
  },
  {
    target: "[data-tour='settings-link']",
    title: "Settings & configuration",
    body: "Connect your PMS, manage clinicians, and set your KPI targets. This is where you configure StrydeOS to match your practice.",
    placement: "right",
  },
  {
    target: "[data-tour='command-palette']",
    title: "Quick search",
    body: "Press \u2318K anytime to jump to any page, search patients, or run a quick action. Power-user shortcut — once you use it, you won't stop.",
    placement: "right",
  },
];

const DEMO_TOUR_COMPLETED_KEY = "strydeos_demo_tour_completed";

type Phase = "welcome" | "touring" | "done";

function isDemoTourCompleted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(DEMO_TOUR_COMPLETED_KEY) === "true";
  } catch {
    return true;
  }
}

function setDemoTourCompleted(): void {
  try {
    localStorage.setItem(DEMO_TOUR_COMPLETED_KEY, "true");
  } catch {
    // ignore
  }
}

export function clearDemoTourCompleted(): void {
  try {
    localStorage.removeItem(DEMO_TOUR_COMPLETED_KEY);
  } catch {
    // ignore
  }
}

export default function FirstLoginTour() {
  const { user, firebaseUser, refreshClinicProfile } = useAuth();
  const { setCollapsed } = useSidebar();
  const [phase, setPhase] = useState<Phase>("welcome");
  const [currentStep, setCurrentStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const isDemo = user?.uid === "demo";
  // Demo users get the DemoBanner instead — no tour overlay that flashes and disappears
  const demoFirstTime = false;
  // Show tour for first-time users who haven't completed it yet (firstLogin=true and tourCompleted=false)
  const realUserFirstTime = user && !isDemo && user.firstLogin === true && !user.tourCompleted && !dismissed;
  const shouldShow = demoFirstTime || realUserFirstTime;

  // For first-time demo visitors, auto-start the step tour after a short delay so they get the walkthrough without clicking.
  useEffect(() => {
    if (!demoFirstTime || phase !== "welcome") return;
    const t = setTimeout(() => {
      setPhase("touring");
      setCurrentStep(0);
    }, 1500);
    return () => clearTimeout(t);
  }, [demoFirstTime, phase]);

  // Keep sidebar expanded while the tour is active so highlighted items are visible
  useEffect(() => {
    if (phase === "touring") {
      setCollapsed(false);
    }
  }, [phase, currentStep, setCollapsed]);

  const finishTour = useCallback(
    async (tourCompleted: boolean) => {
      setDismissed(true);
      setCollapsed(true);

      if (user?.uid === "demo") {
        setDemoTourCompleted();
        return;
      }

      if (!db || !user?.uid) return;

      try {
        await updateDoc(doc(db, "users", user.uid), {
          firstLogin: false,
          tourCompleted,
          status: "registered",
          updatedAt: new Date().toISOString(),
          updatedBy: user.uid,
        });

        if (firebaseUser) {
          const token = await firebaseUser.getIdToken();
          const base = typeof window !== "undefined" ? window.location.origin : "";
          await fetch(`${base}/api/clinic/check-go-live`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        await refreshClinicProfile();
      } catch (err) {
        console.error("[FirstLoginTour] Failed to update user:", err);
      }
    },
    [user, firebaseUser, refreshClinicProfile, setCollapsed]
  );

  const handleStartTour = useCallback(() => {
    setPhase("touring");
    setCurrentStep(0);
  }, []);

  const handleExplore = useCallback(() => {
    finishTour(false);
  }, [finishTour]);

  const handleTourNext = useCallback(() => {
    if (currentStep >= TOUR_STEPS.length - 1) {
      finishTour(true);
    } else {
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep, finishTour]);

  const handleTourPrev = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const handleTourSkip = useCallback(() => {
    finishTour(false);
  }, [finishTour]);

  if (!shouldShow || !user) return null;

  const firstName = user.firstName || user.email.split("@")[0];
  const clinicName = user.clinicProfile?.name || "your clinic";

  return (
    <>
      {/* Welcome overlay */}
      <AnimatePresence>
        {phase === "welcome" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="fixed inset-0 z-[90] flex items-center justify-center px-4"
            style={{
              background: "rgba(11, 37, 69, 0.65)",
              backdropFilter: "blur(6px)",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={{
                duration: 0.5,
                delay: 0.12,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="w-full max-w-lg rounded-2xl overflow-hidden bg-cream"
              style={{
                boxShadow: "0 32px 80px rgba(0, 0, 0, 0.25)",
              }}
            >
              {/* Gradient header */}
              <div
                className="px-8 pt-8 pb-6"
                style={{
                  background: "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)",
                }}
              >
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <Sparkles size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="font-display text-[22px] text-white leading-tight">
                      Welcome to StrydeOS
                    </h2>
                  </div>
                </div>

                <p className="text-[15px] text-white/80 leading-relaxed">
                  {isDemo ? (
                    <>You&apos;re viewing the demo. This is {clinicName}&apos;s clinical operating system — the same dashboard real clinics use to optimise performance.</>
                  ) : (
                    <>Welcome to StrydeOS, {firstName}. This is {clinicName}&apos;s unique clinical operating system, designed to optimise your practice from just &lsquo;good&rsquo; to industry-leading, whether big or small.</>
                  )}
                </p>
                <p className="text-[14px] text-white/50 mt-3">
                  Would you like a tour, or are you happy to explore on your own?
                </p>
              </div>

              {/* CTAs */}
              <div className="px-8 py-6 space-y-3">
                <button
                  onClick={handleStartTour}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-[14px] font-semibold text-white transition-all duration-200 hover:opacity-90"
                  style={{ background: "#1C54F2" }}
                >
                  <Compass size={16} />
                  Show me around
                </button>
                <button
                  onClick={handleExplore}
                  className="w-full py-3 text-[13px] font-medium text-muted hover:text-navy transition-colors text-center"
                >
                  I&apos;ll explore
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step-based tour */}
      {phase === "touring" && currentStep < TOUR_STEPS.length && (
        <TourStep
          step={TOUR_STEPS[currentStep]}
          stepIndex={currentStep}
          totalSteps={TOUR_STEPS.length}
          onNext={handleTourNext}
          onPrev={handleTourPrev}
          onSkip={handleTourSkip}
          isLast={currentStep === TOUR_STEPS.length - 1}
        />
      )}
    </>
  );
}
