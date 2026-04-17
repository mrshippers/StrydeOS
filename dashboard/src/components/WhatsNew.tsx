"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ArrowRight, ArrowLeft, ChevronRight, Activity, Users, TrendingUp, MessageSquare, PhoneCall, Brain, Calendar, Shield } from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import PulseMark from "@/components/PulseMark";

/**
 * Bump CURRENT_VERSION each time you add new entries to UPDATES.
 * Dismissal is tracked in Firestore (users/{uid}.whatsNewSeenVersion)
 * so it works cross-device for ALL clinic users.
 *
 * Show logic: modal appears once per version bump, on next login after
 * the version changes. Once dismissed it stays dismissed until the next bump.
 */
const CURRENT_VERSION = "2026-04-17-ava";

const TOTAL_CARDS = 3;

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

  const [card, setCard] = useState(0);

  const next = useCallback(() => setCard((c) => Math.min(c + 1, TOTAL_CARDS - 1)), []);
  const prev = useCallback(() => setCard((c) => Math.max(c - 1, 0)), []);
  const isLast = card === TOTAL_CARDS - 1;

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
            {/* Close */}
            <button
              type="button"
              onClick={dismiss}
              className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
              aria-label="Close what's new"
            >
              <X size={16} />
            </button>

            {/* Carousel body */}
            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                {card === 0 && (
                  <motion.div
                    key="ava"
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* ── Card 0: Ava improvements ── */}
                    <div
                      className="px-8 pt-7 pb-6 relative"
                      style={{
                        background:
                          "linear-gradient(135deg, #0B2545 0%, #132D5E 50%, #1C54F2 100%)",
                      }}
                    >
                      <div className="flex items-center gap-3.5 mb-3">
                        <div
                          className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(255,255,255,0.10)" }}
                        >
                          <PhoneCall size={22} className="text-white" />
                        </div>
                        <div>
                          <h2 id="whats-new-title" className="font-display text-[22px] text-white leading-tight">
                            Ava is fully live
                          </h2>
                          <p className="text-[12px] text-white/50 mt-0.5">
                            AI receptionist — end-to-end
                          </p>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/70 leading-relaxed">
                        The full call pipeline is now wired up — from first ring
                        to booking confirmation. Every fix from this sprint is
                        live at Spires.
                      </p>
                    </div>

                    <div className="px-8 py-5 space-y-3.5">
                      {[
                        {
                          icon: Brain,
                          color: "#1C54F2",
                          label: "LangGraph router live",
                          detail: "Intent classification and guardrail gates are routing every call correctly — model ID fix applied",
                        },
                        {
                          icon: Calendar,
                          color: "#1C54F2",
                          label: "Live booking tools",
                          detail: "Ava checks availability, books, and updates appointments in real time during the call",
                        },
                        {
                          icon: Shield,
                          color: "#1C54F2",
                          label: "Insurance pre-auth flow",
                          detail: "Insured callers are guided through pre-authorisation — with a fallback if they don\u2019t have the reference to hand",
                        },
                        {
                          icon: MessageSquare,
                          color: "#1C54F2",
                          label: "Transfer + SMS confirmation",
                          detail: "Warm transfers work even with withheld numbers. Booking confirmations SMS\u2019d to patients automatically",
                        },
                      ].map((item) => (
                        <div key={item.label} className="flex items-start gap-3">
                          <div
                            className="mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${item.color}14` }}
                          >
                            <item.icon size={14} style={{ color: item.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-navy leading-snug">
                              {item.label}
                            </p>
                            <p className="text-[12px] text-muted leading-relaxed mt-0.5">
                              {item.detail}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {card === 1 && (
                  <motion.div
                    key="pulse"
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* ── Card 1: Pulse ── */}
                    <div
                      className="px-8 pt-7 pb-6 relative"
                      style={{
                        background:
                          "linear-gradient(135deg, #053B47 0%, #0A5C6B 40%, #0891B2 100%)",
                      }}
                    >
                      <div className="flex items-center gap-3.5 mb-3">
                        <PulseMark size={48} />
                        <div>
                          <h2 className="font-display text-[22px] text-white leading-tight">
                            Pulse is live
                          </h2>
                          <p className="text-[12px] text-white/50 mt-0.5">
                            Your patient retention engine
                          </p>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/70 leading-relaxed">
                        Pulse automatically reduces drop-off between sessions.
                        It scores risk, triggers outreach, and tracks every
                        patient from first appointment to discharge.
                      </p>
                    </div>

                    <div className="px-8 py-5 space-y-3.5">
                      {[
                        {
                          icon: Activity,
                          color: "#0891B2",
                          label: "Risk scoring",
                          detail: "Composite 0\u2013100 churn risk from attendance, progress, HEP engagement, and sentiment",
                        },
                        {
                          icon: Users,
                          color: "#0891B2",
                          label: "Lifecycle tracking",
                          detail: "Eight-state patient journey \u2014 from onboarding through active, at-risk, and re-engaged",
                        },
                        {
                          icon: MessageSquare,
                          color: "#0891B2",
                          label: "Automated sequences",
                          detail: "Escalating SMS and email cadences for rebooking, HEP reminders, and reactivation",
                        },
                        {
                          icon: TrendingUp,
                          color: "#0891B2",
                          label: "Revenue attribution",
                          detail: "Last-touch model ties every retained session back to the sequence that saved it",
                        },
                      ].map((item) => (
                        <div key={item.label} className="flex items-start gap-3">
                          <div
                            className="mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${item.color}14` }}
                          >
                            <item.icon size={14} style={{ color: item.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-navy leading-snug">
                              {item.label}
                            </p>
                            <p className="text-[12px] text-muted leading-relaxed mt-0.5">
                              {item.detail}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {card === 2 && (
                  <motion.div
                    key="platform"
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* ── Card 2: Platform updates ── */}
                    <div
                      className="px-8 pt-7 pb-5 relative"
                      style={{
                        background:
                          "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)",
                      }}
                    >
                      <h2 className="font-display text-[20px] text-white leading-tight">
                        Platform updates
                      </h2>
                      <p className="text-[12px] text-white/40 mt-0.5">
                        What else shipped this month
                      </p>
                    </div>

                    <div className="px-8 py-5 space-y-4" role="list">
                      {[
                        {
                          tag: "Ava",
                          tagColor: "#1C54F2",
                          title: "Full call pipeline live at Spires",
                          description:
                            "End-to-end booking verified on the live number. Appointments standardised to 45 minutes — initial and follow-up.",
                        },
                        {
                          tag: "Ava",
                          tagColor: "#1C54F2",
                          title: "LangGraph call routing + phone provisioning",
                          description:
                            "Context-aware transfers, holds, and voicemail. Phone numbers auto-provision per clinic.",
                        },
                        {
                          tag: "Ava",
                          tagColor: "#1C54F2",
                          title: "Insurance pre-auth + out-of-hours",
                          description:
                            "Pre-authorisation checks during booking. After-hours calls route with callback SMS.",
                        },
                        {
                          tag: "Intelligence",
                          tagColor: "#8B5CF6",
                          title: "Live benchmarks + data freshness",
                          description:
                            "KPIs pull from live clinic data with week-by-week breakdowns and freshness indicators.",
                        },
                        {
                          tag: "Security",
                          tagColor: "#EF4444",
                          title: "Production hardening — 492 tests",
                          description:
                            "Encrypted PMS credentials, superadmin controls, and expanded test coverage.",
                        },
                      ].map((entry) => (
                        <div key={entry.title} className="flex items-start gap-3" role="listitem">
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer: dots + action */}
            <div className="px-8 py-5 border-t border-border flex items-center gap-4">
              {/* Back arrow */}
              <button
                type="button"
                onClick={prev}
                disabled={card === 0}
                className="p-2 rounded-lg text-muted hover:text-navy hover:bg-navy/5 transition-colors disabled:opacity-0 disabled:pointer-events-none"
                aria-label="Previous"
              >
                <ArrowLeft size={16} />
              </button>

              {/* Dots */}
              <div className="flex items-center gap-2 flex-1 justify-center">
                {Array.from({ length: TOTAL_CARDS }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCard(i)}
                    className="transition-all duration-200"
                    aria-label={`Go to card ${i + 1}`}
                  >
                    <div
                      className="rounded-full transition-all duration-200"
                      style={{
                        width: card === i ? 20 : 6,
                        height: 6,
                        background: card === i ? "#1C54F2" : "#0B254520",
                      }}
                    />
                  </button>
                ))}
              </div>

              {/* Next / Got it */}
              <button
                type="button"
                onClick={isLast ? dismiss : next}
                data-autofocus
                className="btn-primary"
              >
                {isLast ? "Got it" : "Next"}
                {isLast ? <ArrowRight size={14} /> : <ChevronRight size={14} />}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
