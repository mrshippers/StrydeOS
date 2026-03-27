"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { MonolithHero } from "@/components/MonolithLogo";

const SPLASH_SEEN_KEY = "strydeos_splash_seen";

const REVEAL_MS = 2500;
const HOLD_MS = 500;
const EXIT_MS = 500;
const TOTAL_MS = REVEAL_MS + HOLD_MS;

function getSplashSeen(): boolean {
  try {
    return !!localStorage.getItem(SPLASH_SEEN_KEY);
  } catch {
    return false;
  }
}

function setSplashSeen(): void {
  try {
    localStorage.setItem(SPLASH_SEEN_KEY, "1");
  } catch {
    // ignore
  }
}

export default function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const mounted = useRef(false);
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    if (getSplashSeen()) return;
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;

    timeoutId.current = setTimeout(() => {
      setExiting(true);
    }, TOTAL_MS);
    return () => {
      if (timeoutId.current) clearTimeout(timeoutId.current);
      timeoutId.current = null;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

  const handleExitComplete = () => {
    setSplashSeen();
    setVisible(false);
  };

  if (!visible) return null;

  const dur = prefersReducedMotion ? 0 : 1;
  const exitDur = prefersReducedMotion ? 0 : EXIT_MS / 1000;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-navy)] overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: exitDur, ease: "easeInOut" }}
      onAnimationComplete={() => {
        if (exiting) handleExitComplete();
      }}
    >
      {/* Phase 1: Radial glow bloom (0-800ms) — mirrors the SVG's radial light source #6AABFF */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 400,
          height: 400,
          background:
            "radial-gradient(circle, rgba(106,171,255,0.22) 0%, rgba(28,84,242,0.08) 50%, transparent 70%)",
          filter: "blur(40px)",
        }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: 0.8 * dur,
          ease: [0.2, 0.6, 0.3, 1],
        }}
      />

      {/* Glow breathing pulse (1.4s-2.5s) */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 400,
          height: 400,
          background:
            "radial-gradient(circle, rgba(106,171,255,0.15) 0%, transparent 65%)",
          filter: "blur(50px)",
        }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: [0, 0, 0.6, 0.3, 0.5, 0], scale: [0.9, 0.9, 1.05, 1, 1.03, 0.95] }}
        transition={{
          duration: 2.5 * dur,
          ease: "easeInOut",
          times: [0, 0.5, 0.65, 0.75, 0.85, 1],
        }}
      />

      {/* Phase 1: Monolith mark fade-in + scale (0-800ms with spring settle) */}
      <motion.div
        className="relative flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: 0.8 * dur,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        <MonolithHero />
      </motion.div>

      {/* Phase 2: Diagonal waveform sweep — staggered soft waves rolling corner to corner */}
      {[
        { delay: 0.5, duration: 1.2, peakOpacity: 0.10, width: "250%" },
        { delay: 0.7, duration: 1.2, peakOpacity: 0.07, width: "220%" },
        { delay: 0.6, duration: 1.4, peakOpacity: 0.05, width: "280%" },
      ].map((wave, i) => (
        <motion.div
          key={i}
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, wave.peakOpacity, wave.peakOpacity, 0] }}
          transition={{
            duration: wave.duration * dur,
            delay: wave.delay * dur,
            ease: "easeInOut",
            times: [0, 0.2, 0.7, 1],
          }}
        >
          <motion.div
            className="absolute"
            style={{
              width: wave.width,
              height: wave.width,
              top: "-75%",
              left: "-75%",
              background:
                "linear-gradient(135deg, transparent 30%, rgba(106,171,255,0.12) 42%, rgba(255,255,255,0.08) 50%, rgba(106,171,255,0.12) 58%, transparent 70%)",
            }}
            initial={{ x: "-50%", y: "-50%" }}
            animate={{ x: "50%", y: "50%" }}
            transition={{
              duration: wave.duration * dur,
              delay: wave.delay * dur,
              ease: [0.4, 0, 0.6, 1],
            }}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
