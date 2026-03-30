"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Bump CURRENT_VERSION each time you add new entries to UPDATES.
 * Users see the modal once per version, stored in localStorage.
 */
const CURRENT_VERSION = "2026-03-30";
const STORAGE_KEY = "strydeos_whats_new_seen";

interface UpdateEntry {
  tag: string;
  tagColor: string;
  title: string;
  description: string;
}

const UPDATES: UpdateEntry[] = [
  {
    tag: "Intelligence",
    tagColor: "#8B5CF6",
    title: "Clinician engagement nudges",
    description:
      "Today's Focus cards now appear on each clinician's dashboard with their top priority action for the day — based on live KPI data.",
  },
  {
    tag: "Pulse",
    tagColor: "#0891B2",
    title: "Rebooking prompt sequences",
    description:
      "Automated SMS and email sequences now trigger when a patient hasn't rebooked within 72 hours of their last session.",
  },
  {
    tag: "Platform",
    tagColor: "#1C54F2",
    title: "CSV import for WriteUpp & TM3",
    description:
      "Clinics using WriteUpp or TM3 can now import appointment and programme data via a guided CSV upload in Settings.",
  },
];

function hasSeenVersion(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === CURRENT_VERSION;
  } catch {
    return true;
  }
}

function markVersionSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
  } catch {
    // ignore
  }
}

export default function WhatsNew() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Only show to returning users (not first login, not demo)
    if (user.uid === "demo") return;
    if (user.firstLogin) return;
    if (hasSeenVersion()) return;

    // Delay so it appears after the splash screen exits
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, [user]);

  const dismiss = useCallback(() => {
    setVisible(false);
    markVersionSeen();
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          style={{
            background: "rgba(11, 37, 69, 0.55)",
            backdropFilter: "blur(6px)",
          }}
          onClick={dismiss}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{
              duration: 0.45,
              delay: 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="w-full max-w-lg rounded-2xl overflow-hidden bg-cream"
            style={{ boxShadow: "0 32px 80px rgba(0, 0, 0, 0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="px-8 pt-7 pb-5 relative"
              style={{
                background:
                  "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)",
              }}
            >
              <button
                onClick={dismiss}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-2">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <Sparkles size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="font-display text-[20px] text-white leading-tight">
                    What&apos;s new
                  </h2>
                  <p className="text-[12px] text-white/40 mt-0.5">
                    Latest updates to StrydeOS
                  </p>
                </div>
              </div>
            </div>

            {/* Updates list */}
            <div className="px-8 py-5 space-y-4 max-h-[340px] overflow-y-auto">
              {UPDATES.map((entry) => (
                <div
                  key={entry.title}
                  className="flex items-start gap-3"
                >
                  <div
                    className="mt-1 w-2 h-2 rounded-full shrink-0"
                    style={{ background: entry.tagColor }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          color: entry.tagColor,
                          background: `${entry.tagColor}12`,
                        }}
                      >
                        {entry.tag}
                      </span>
                    </div>
                    <p className="text-[13px] font-semibold text-navy leading-snug">
                      {entry.title}
                    </p>
                    <p className="text-[12px] text-muted leading-relaxed mt-0.5">
                      {entry.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-border">
              <button
                onClick={dismiss}
                className="btn-primary w-full justify-center"
              >
                Got it
                <ArrowRight size={14} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
