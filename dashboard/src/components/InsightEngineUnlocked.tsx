"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useInsightEngineUnlock } from "@/hooks/useInsightEngineUnlock";
import { brand } from "@/lib/brand";
import { GlassCard } from "@/components/ui/GlassCard";

const STEPS = [
  {
    module: "INTELLIGENCE" as const,
    color: brand.purple,
    emoji: "🔍",
    title: "Pattern detected",
    detailKey: "detect" as const,
  },
  {
    module: "INTELLIGENCE" as const,
    color: brand.purple,
    emoji: "📊",
    title: "Impact calculated",
    detailKey: "calculate" as const,
  },
  {
    module: "PULSE" as const,
    color: brand.teal,
    emoji: "⚡",
    title: "Nudge sent automatically",
    detailKey: "nudge" as const,
  },
  {
    module: "PULSE" as const,
    color: brand.teal,
    emoji: "✅",
    title: "Loop closed",
    detailKey: "close" as const,
  },
];

// Timing constants (ms)
const FLASH_DELAY = 0;
const CARD_DELAY = 400;
const BADGE_DELAY = 600;
const TITLE_DELAY = 800;
const STEP_BASE_DELAY = 1600;
const STEP_INTERVAL = 1200;
const REVENUE_DELAY = STEP_BASE_DELAY + STEP_INTERVAL * 4;
const CTA_DELAY = REVENUE_DELAY;

export default function InsightEngineUnlocked() {
  const { shouldShow, data, markDisplayed, dismiss } = useInsightEngineUnlock();
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(-1);
  const [showRevenue, setShowRevenue] = useState(false);
  const [ctaActive, setCtaActive] = useState(false);
  const [sequenceStarted, setSequenceStarted] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Start sequence once popup is shown
  useEffect(() => {
    if (!shouldShow || !data || sequenceStarted) return;
    setSequenceStarted(true);
    markDisplayed();

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Activate steps one at a time
    for (let i = 0; i < 4; i++) {
      timers.push(
        setTimeout(() => setActiveStep(i), STEP_BASE_DELAY + STEP_INTERVAL * i)
      );
    }

    // Revenue callout + CTA
    timers.push(setTimeout(() => setShowRevenue(true), REVENUE_DELAY));
    timers.push(setTimeout(() => setCtaActive(true), CTA_DELAY));

    timersRef.current = timers;
    return () => timers.forEach(clearTimeout);
  }, [shouldShow, data, sequenceStarted, markDisplayed]);

  const handleDismiss = useCallback(() => {
    dismiss();
    router.push("/intelligence");
  }, [dismiss, router]);

  if (!shouldShow || !data) return null;

  const patientsNudged = data.patientsNudged ?? 0;
  const patientsRebooked = data.patientsRebooked ?? 0;
  const revenueRecovered = data.revenueRecovered ?? 0;
  const revenueAtRisk = data.revenueAtRisk ?? 0;

  function stepDetail(key: string): string {
    switch (key) {
      case "detect":
        return `${patientsNudged} patient${patientsNudged !== 1 ? "s" : ""} mid-programme with no rebooking`;
      case "calculate":
        return revenueAtRisk > 0
          ? `~£${revenueAtRisk.toLocaleString()} estimated revenue at risk`
          : "Revenue impact calculated from mid-programme dropouts";
      case "nudge":
        return `Rebooking prompt → ${patientsNudged} patient${patientsNudged !== 1 ? "s" : ""} via SMS`;
      case "close":
        return `${patientsRebooked} patient${patientsRebooked !== 1 ? "s" : ""} rebooked`;
      default:
        return "";
    }
  }

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
            onClick={ctaActive ? handleDismiss : undefined}
          />

          {/* Flash burst */}
          <motion.div
            className="absolute pointer-events-none"
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 1.2, delay: FLASH_DELAY / 1000, ease: "easeOut" }}
            style={{
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${brand.purple}40 0%, ${brand.blue}20 50%, transparent 70%)`,
            }}
          />

          {/* Card */}
          <motion.div
            className="relative w-full max-w-[420px]"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: 0.5,
              delay: CARD_DELAY / 1000,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <GlassCard
              variant="hero"
              tint="neutral"
              style={{
                background: `linear-gradient(165deg, ${brand.navyMid} 0%, ${brand.navy} 100%)`,
              }}
            >
            {/* Top accent bar */}
            <div
              className="h-[3px] w-full"
              style={{
                background: `linear-gradient(90deg, ${brand.purple}, ${brand.blue}, ${brand.teal})`,
              }}
            />

            <div className="p-6 pb-8">
              {/* Badge */}
              <motion.div
                className="flex items-center gap-2 mb-5"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: BADGE_DELAY / 1000, duration: 0.35 }}
              >
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
                  style={{
                    background: `${brand.blue}20`,
                    color: brand.blueGlow,
                    border: `1px solid ${brand.blue}30`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: brand.blueGlow }}
                  />
                  New Capability Unlocked
                </span>
              </motion.div>

              {/* Title */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: TITLE_DELAY / 1000, duration: 0.5 }}
              >
                <h2
                  className="font-display text-[28px] text-white leading-tight mb-2"
                  style={{ fontWeight: 400 }}
                >
                  The Insight Engine
                </h2>
                <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                  Intelligence spotted something. Pulse acted on it.
                  <br />
                  Here&rsquo;s what just happened in your clinic:
                </p>
              </motion.div>

              {/* Timeline */}
              <div className="mt-6 space-y-0">
                {STEPS.map((step, i) => {
                  const isActive = activeStep >= i;
                  const isLast = i === STEPS.length - 1;

                  return (
                    <div key={step.detailKey} className="flex gap-3">
                      {/* Timeline node + connector */}
                      <div className="flex flex-col items-center shrink-0">
                        <motion.div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-[16px]"
                          initial={{ opacity: 0.2, scale: 0.8 }}
                          animate={
                            isActive
                              ? { opacity: 1, scale: 1 }
                              : { opacity: 0.2, scale: 0.8 }
                          }
                          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                          style={{
                            border: `2px solid ${isActive ? step.color : "rgba(255,255,255,0.1)"}`,
                            background: isActive ? `${step.color}15` : "transparent",
                          }}
                        >
                          {step.emoji}
                        </motion.div>
                        {!isLast && (
                          <div
                            className="w-[2px] flex-1 min-h-[20px]"
                            style={{
                              background: isActive
                                ? `linear-gradient(to bottom, ${step.color}60, ${STEPS[i + 1].color}60)`
                                : "rgba(255,255,255,0.06)",
                            }}
                          />
                        )}
                      </div>

                      {/* Content */}
                      <motion.div
                        className="pb-4 min-w-0"
                        initial={{ opacity: 0, x: 12 }}
                        animate={
                          isActive
                            ? { opacity: 1, x: 0 }
                            : { opacity: 0.15, x: 12 }
                        }
                        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <span
                          className="text-[9px] font-bold uppercase tracking-[1.5px]"
                          style={{ color: step.color }}
                        >
                          {step.module}
                        </span>
                        <p className="text-[14px] font-semibold text-white mt-0.5">
                          {step.title}
                        </p>
                        <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                          {stepDetail(step.detailKey)}
                        </p>
                      </motion.div>
                    </div>
                  );
                })}
              </div>

              {/* Revenue callout */}
              <AnimatePresence>
                {showRevenue && revenueRecovered > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-4 rounded-xl p-4 flex items-center justify-between"
                    style={{
                      background: `${brand.teal}12`,
                      border: `1px solid ${brand.teal}25`,
                    }}
                  >
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: brand.teal }}>
                        Revenue recovered
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                        This happened without you lifting a finger.
                      </p>
                    </div>
                    <p
                      className="font-display text-[28px] text-white shrink-0 ml-4"
                      style={{ fontWeight: 400 }}
                    >
                      £{revenueRecovered.toLocaleString()}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CTA */}
              <motion.button
                onClick={ctaActive ? handleDismiss : undefined}
                className="w-full mt-5 py-3 rounded-xl text-[14px] font-semibold transition-all duration-300"
                animate={
                  ctaActive
                    ? { opacity: 1 }
                    : { opacity: 0.4 }
                }
                style={{
                  background: ctaActive
                    ? `linear-gradient(135deg, ${brand.blue}, ${brand.blueBright})`
                    : "rgba(255,255,255,0.08)",
                  color: ctaActive ? "#FFFFFF" : "rgba(255,255,255,0.35)",
                  cursor: ctaActive ? "pointer" : "default",
                  border: "none",
                }}
              >
                {ctaActive ? "Got it — take me to my insights" : "Running the loop…"}
              </motion.button>

              {/* Footer text */}
              <AnimatePresence>
                {showRevenue && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="mt-4 text-center"
                  >
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                      Intelligence detects. Pulse acts. You see results.
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>
                      This runs automatically from now on.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
