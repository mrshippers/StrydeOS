"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { MonolithHero } from "@/components/MonolithLogo";

const SPLASH_SEEN_KEY = "strydeos_splash_seen";
const DISPLAY_MS = 1500;
const FADE_IN_MS = 300;
const FADE_OUT_MS = 300;

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
    }, DISPLAY_MS);
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

  const fadeInDuration = prefersReducedMotion ? 0 : FADE_IN_MS / 1000;
  const fadeOutDuration = prefersReducedMotion ? 0 : FADE_OUT_MS / 1000;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-navy)]"
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{
        duration: fadeOutDuration,
        ease: "easeOut",
      }}
      onAnimationComplete={() => {
        if (exiting) handleExitComplete();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: fadeInDuration,
          ease: "easeOut",
        }}
        className="flex items-center justify-center"
      >
        <MonolithHero />
      </motion.div>
    </motion.div>
  );
}
