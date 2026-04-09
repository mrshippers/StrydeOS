"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Sparkles, ArrowRight } from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

/**
 * Bump CURRENT_VERSION each time you add new entries to UPDATES.
 * Dismissal is tracked in Firestore (users/{uid}.whatsNewSeenVersion)
 * so it works cross-device for ALL clinic users.
 *
 * Show logic: modal appears once per version bump, on next login after
 * the version changes. Once dismissed it stays dismissed until the next bump.
 */
const CURRENT_VERSION = "2026-04-09-v2";

interface UpdateEntry {
  tag: string;
  tagColor: string;
  title: string;
  description: string;
}

const UPDATES: UpdateEntry[] = [
  {
    tag: "Ava",
    tagColor: "#1C54F2",
    title: "LangGraph call routing + phone provisioning",
    description:
      "Ava now uses a LangGraph state machine for intelligent call routing — transfers, holds, and voicemail are context-aware. Phone numbers auto-provision when you enable Ava for a clinic.",
  },
  {
    tag: "Ava",
    tagColor: "#1C54F2",
    title: "Insurance pre-auth + out-of-hours transfers",
    description:
      "Ava can run insurance pre-authorisation checks during booking and route calls outside clinic hours with callback SMS notifications.",
  },
  {
    tag: "Intelligence",
    tagColor: "#8B5CF6",
    title: "Live benchmarks + data freshness indicators",
    description:
      "Intelligence KPIs now pull from live clinic data with week-by-week breakdowns. A freshness bar shows exactly how current your numbers are.",
  },
  {
    tag: "Security",
    tagColor: "#EF4444",
    title: "Production hardening — 492 tests, PMS encryption",
    description:
      "Full security audit pass with encrypted PMS credentials, superadmin account controls, and a new comms engine. Test coverage expanded to 492 tests across the platform.",
  },
  {
    tag: "Pulse",
    tagColor: "#0891B2",
    title: "Honest empty states + setup guidance",
    description:
      "Pulse pages now show clear setup prompts instead of misleading zeros. Patient sync refreshes names and contacts from your PMS on every run.",
  },
];

export default function WhatsNew() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (user.uid === "demo") { setChecking(false); return; }
    if (user.firstLogin && !user.tourCompleted) { setChecking(false); return; }

    // Check localStorage first (fast, covers Firestore-write-failure fallback)
    try {
      if (localStorage.getItem("strydeos_whats_new_seen") === CURRENT_VERSION) {
        setChecking(false);
        return;
      }
    } catch { /* ignore */ }

    if (!db) {
      const t = setTimeout(() => { setVisible(true); setChecking(false); }, 800);
      return () => clearTimeout(t);
    }

    // Then check Firestore for cross-device dismissal
    const userRef = doc(db, "users", user.uid);
    getDoc(userRef).then((snap) => {
      const seenVersion = snap.data()?.whatsNewSeenVersion;
      if (seenVersion === CURRENT_VERSION) {
        // Sync localStorage so future checks are instant
        try { localStorage.setItem("strydeos_whats_new_seen", CURRENT_VERSION); } catch { /* ignore */ }
        setChecking(false);
        return;
      }
      // Show after splash screen exits
      setTimeout(() => { setVisible(true); setChecking(false); }, 800);
    }).catch(() => {
      setChecking(false);
    });
  }, [user]);

  const dismiss = useCallback(() => {
    setVisible(false);

    if (!user || user.uid === "demo") return;

    // Always write localStorage (instant on next load, survives Firestore failures)
    try { localStorage.setItem("strydeos_whats_new_seen", CURRENT_VERSION); } catch { /* ignore */ }

    // Also persist to Firestore for cross-device dismissal
    if (db) {
      const userRef = doc(db, "users", user.uid);
      updateDoc(userRef, { whatsNewSeenVersion: CURRENT_VERSION }).catch(() => { /* localStorage already set */ });
    }
  }, [user]);

  // Focus trap: keep Tab/Shift+Tab inside modal, Escape to dismiss
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!visible) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const timer = setTimeout(() => {
      const gotItBtn = dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      gotItBtn?.focus();
    }, 100);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { dismiss(); return; }
      if (e.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [visible, dismiss]);

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
          role="presentation"
          onClick={dismiss}
        >
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{
              duration: 0.45,
              delay: 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
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
                type="button"
                onClick={dismiss}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                aria-label="Close what's new"
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
                  aria-hidden="true"
                >
                  <Sparkles size={18} className="text-white" />
                </div>
                <div>
                  <h2 id="whats-new-title" className="font-display text-[20px] text-white leading-tight">
                    What&apos;s new
                  </h2>
                  <p className="text-[12px] text-white/40 mt-0.5">
                    Latest updates to StrydeOS
                  </p>
                </div>
              </div>
            </div>

            {/* Updates list */}
            <div className="px-8 py-5 space-y-4 max-h-[340px] overflow-y-auto" role="list">
              {UPDATES.map((entry) => (
                <div
                  key={entry.title}
                  className="flex items-start gap-3"
                  role="listitem"
                >
                  <div
                    className="mt-1 w-2 h-2 rounded-full shrink-0"
                    style={{ background: entry.tagColor }}
                    aria-hidden="true"
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
                type="button"
                onClick={dismiss}
                data-autofocus
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
