"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { brand } from "@/lib/brand";
import { MonolithMark } from "@/components/MonolithLogo";

const STORAGE_KEY = "strydeos_changelog_v2025_03_29";
const GATED_EMAIL = "jamal@spiresphysiotherapy.com";

interface ChangeCard {
  tag: string;
  tagColor: string;
  title: string;
  description: string;
  detail: string;
}

const CARDS: ChangeCard[] = [
  {
    tag: "FIX",
    tagColor: brand.success,
    title: "Errors don't break the screen anymore",
    description:
      "If metrics fail to load, every card now shows —— dashes with an amber warning triangle. The layout stays intact — no fake stats, no white screens.",
    detail: "Dashboard, Intelligence, Pulse — all covered.",
  },
  {
    tag: "UPGRADE",
    tagColor: brand.blue,
    title: "Error pages with personality",
    description:
      "\"Dashboard took an unscheduled break.\" \"Pulse skipped a beat.\" \"Ava's taking a breather.\" Every error page now feels like StrydeOS, not a broken app.",
    detail: "Monolith mark + module-coloured retry button on every route.",
  },
  {
    tag: "UPGRADE",
    tagColor: brand.blue,
    title: "404 page redesigned",
    description:
      "\"Nothing here — this page doesn't exist, or it moved and forgot to leave a forwarding address.\" Clean, on-brand, no stack traces.",
    detail: "Navy gradient, Monolith mark, big faded 404.",
  },
  {
    tag: "NEW",
    tagColor: brand.purple,
    title: "Notification slide-out panel",
    description:
      "Bell button now opens a proper slide-out panel from the right. Smooth 550ms reveal — like holding the PS button. No more broken dropdown.",
    detail: "3 tiers: Alerts → Intelligence → Quick Actions.",
  },
  {
    tag: "FIX",
    tagColor: brand.teal,
    title: "Pulse error handling",
    description:
      "Patient and comms hooks were silently failing with no warning. Now surfaces inline banners when data can't load instead of showing empty/broken cards.",
    detail: "usePatients + useCommsLog errors now visible.",
  },
];

export default function ChangelogSplash() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    if (user.email !== GATED_EMAIL) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, [user?.email]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    } catch {
      // localStorage unavailable
    }
  }, []);

  const next = () => setActiveIndex((i) => Math.min(i + 1, CARDS.length - 1));
  const prev = () => setActiveIndex((i) => Math.max(i - 1, 0));
  const isLast = activeIndex === CARDS.length - 1;

  if (!visible || dismissed) return null;

  const card = CARDS[activeIndex];

  return (
    <AnimatePresence>
      {!dismissed && (
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
          />

          {/* Card */}
          <motion.div
            className="relative w-full max-w-[480px] overflow-hidden"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{
              duration: 0.55,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              background: `linear-gradient(165deg, ${brand.navyMid} 0%, ${brand.navy} 100%)`,
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: `0 0 80px ${brand.blue}15, 0 0 160px ${brand.purple}08`,
            }}
          >
            {/* Top accent bar */}
            <div
              className="h-[3px] w-full"
              style={{
                background: `linear-gradient(90deg, ${brand.blue}, ${brand.purple}, ${brand.teal})`,
              }}
            />

            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/5 transition-colors z-10"
            >
              <X size={14} />
            </button>

            <div className="p-6 pb-5">
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <MonolithMark size={28} />
                <div>
                  <p className="text-[14px] font-semibold text-white">
                    What&apos;s new in StrydeOS
                  </p>
                  <p className="text-[11px] text-white/30">
                    Latest updates — 29 March 2025
                  </p>
                </div>
              </div>

              {/* Card content area */}
              <div className="relative min-h-[200px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeIndex}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* Tag */}
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[1.5px] mb-3"
                      style={{
                        background: `${card.tagColor}18`,
                        color: card.tagColor,
                        border: `1px solid ${card.tagColor}25`,
                      }}
                    >
                      {card.tag}
                    </span>

                    {/* Title */}
                    <h3
                      className="font-display text-[22px] text-white leading-tight mb-2"
                      style={{ fontWeight: 400 }}
                    >
                      {card.title}
                    </h3>

                    {/* Description */}
                    <p className="text-[13px] leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
                      {card.description}
                    </p>

                    {/* Detail */}
                    <p className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {card.detail}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Progress dots + navigation */}
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/6">
                {/* Dots */}
                <div className="flex items-center gap-2">
                  {CARDS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveIndex(i)}
                      className="transition-all duration-300"
                      style={{
                        width: i === activeIndex ? 20 : 6,
                        height: 6,
                        borderRadius: 3,
                        background: i === activeIndex ? brand.blue : "rgba(255,255,255,0.15)",
                      }}
                    />
                  ))}
                </div>

                {/* Arrows / CTA */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={prev}
                    disabled={activeIndex === 0}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  {isLast ? (
                    <button
                      onClick={handleDismiss}
                      className="px-5 py-2 rounded-xl text-[13px] font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
                      style={{
                        background: `linear-gradient(135deg, ${brand.blue}, ${brand.blueBright})`,
                        boxShadow: `0 4px 16px ${brand.blue}30`,
                      }}
                    >
                      Let&apos;s go
                    </button>
                  ) : (
                    <button
                      onClick={next}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
