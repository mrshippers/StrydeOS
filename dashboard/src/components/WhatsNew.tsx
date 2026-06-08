"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ArrowRight, ArrowLeft, ChevronRight, Activity, Users, TrendingUp, MessageSquare, PhoneCall, Brain, Calendar, Shield, Network, Lock } from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { GlassCard } from "@/components/ui/GlassCard";

/**
 * Bump CURRENT_VERSION each time you add new entries to UPDATES.
 * Dismissal is tracked in Firestore (users/{uid}.whatsNewSeenVersion)
 * so it works cross-device for ALL clinic users.
 *
 * Show logic: modal appears once per version bump, on next login after
 * the version changes. Once dismissed it stays dismissed until the next bump.
 */
const CURRENT_VERSION = "2026-05-26-pipeline-dashboard";

const TOTAL_CARDS = 5;

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
        try { localStorage.setItem("strydeos_whats_new_seen", CURRENT_VERSION); } catch { /* ignore */ }
        setChecking(false);
        return;
      }
      setTimeout(() => { setVisible(true); setChecking(false); }, 800);
    }).catch(() => {
      setChecking(false);
    });
  }, [user]);

  const dismiss = useCallback(() => {
    setVisible(false);

    if (!user || user.uid === "demo") return;

    try { localStorage.setItem("strydeos_whats_new_seen", CURRENT_VERSION); } catch { /* ignore */ }

    if (db) {
      const userRef = doc(db, "users", user.uid);
      updateDoc(userRef, { whatsNewSeenVersion: CURRENT_VERSION }).catch(() => { /* localStorage already set */ });
    }
  }, [user]);

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

  void checking;

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
            className="w-full max-w-lg relative"
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard variant="primary" tint="neutral" className="bg-cream">
            {/* Close */}
            <button
              type="button"
              onClick={dismiss}
              className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-navy/55 dark:text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
              aria-label="Close what's new"
            >
              <X size={16} />
            </button>

            {/* Carousel body */}
            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                {card === 0 && (
                  <motion.div
                    key="pipeline"
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* ── Card 0: Cliniko pipeline live ── */}
                    <div
                      className="px-8 pt-7 pb-6 relative"
                      style={{
                        background:
                          "linear-gradient(135deg, #053B47 0%, #0A5C6B 40%, #0891B2 100%)",
                      }}
                    >
                      <div className="flex items-center gap-3.5 mb-3">
                        <div
                          className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(255,255,255,0.10)" }}
                        >
                          <Network size={22} className="text-white" />
                        </div>
                        <div>
                          <h2 id="whats-new-title" className="font-display text-[22px] text-white leading-tight">
                            Your clinic data is live
                          </h2>
                          <p className="text-[12px] text-white/50 mt-0.5">
                            Pipeline fixed, history backfilled
                          </p>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/70 leading-relaxed">
                        Your Cliniko appointment history now syncs correctly.
                        First run pulls everything. Weekly runs keep it current without any manual work.
                      </p>
                    </div>

                    <div className="px-8 py-5 space-y-3.5">
                      {[
                        {
                          icon: Network,
                          color: "#0891B2",
                          label: "Full appointment history pulled on first run",
                          detail: "First sync backfills your entire Cliniko history. Every week before today counts in your KPIs.",
                        },
                        {
                          icon: Activity,
                          color: "#0891B2",
                          label: "Weekly runs keep it current automatically",
                          detail: "The pipeline runs on schedule. KPIs update without you doing anything manually.",
                        },
                        {
                          icon: Users,
                          color: "#0891B2",
                          label: "Retention alerts now show real patients",
                          detail: "The patients in your Pulse tile come from live PMS data, not placeholders.",
                        },
                        {
                          icon: TrendingUp,
                          color: "#0891B2",
                          label: "Pipeline failures surface on your dashboard",
                          detail: "If a sync run fails, the dashboard tells you. No more silently showing last week’s numbers.",
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
                    key="period"
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* ── Card 1: Period-aware dashboard cards ── */}
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
                          <Calendar size={22} className="text-white" />
                        </div>
                        <div>
                          <h2 className="font-display text-[22px] text-white leading-tight">
                            Today, 7d, 30d, 90d - all real
                          </h2>
                          <p className="text-[12px] text-white/50 mt-0.5">
                            Period selector queries actual records
                          </p>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/70 leading-relaxed">
                        Each period now re-queries your actual appointment records.
                        Revenue and session count match the date window you selected.
                      </p>
                    </div>

                    <div className="px-8 py-5 space-y-3.5">
                      {[
                        {
                          icon: Calendar,
                          color: "#1C54F2",
                          label: "Revenue matches the exact date window",
                          detail: "Selecting 30 days shows completed and booked revenue for those 30 days. Same logic applies for 7d, 90d, and today.",
                        },
                        {
                          icon: TrendingUp,
                          color: "#1C54F2",
                          label: "Session count comes from your actual diary",
                          detail: "Today’s count is today’s bookings, not a scaled estimate of a monthly figure.",
                        },
                        {
                          icon: Activity,
                          color: "#1C54F2",
                          label: "DNA rate calculated per window",
                          detail: "Did-not-attend rate is drawn from appointments within the selected period only.",
                        },
                        {
                          icon: Brain,
                          color: "#1C54F2",
                          label: "Session price used as revenue fallback",
                          detail: "If your PMS does not return a revenue figure, your clinic’s session price fills the gap automatically.",
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
                    key="trend"
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* ── Card 2: Clinic Pulse sparkline strip ── */}
                    <div
                      className="px-8 pt-7 pb-6 relative"
                      style={{
                        background:
                          "linear-gradient(135deg, #0B2545 0%, #2D1E5E 50%, #8B5CF6 100%)",
                      }}
                    >
                      <div className="flex items-center gap-3.5 mb-3">
                        <div
                          className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(255,255,255,0.10)" }}
                        >
                          <TrendingUp size={22} className="text-white" />
                        </div>
                        <div>
                          <h2 className="font-display text-[22px] text-white leading-tight">
                            12 weeks at a glance
                          </h2>
                          <p className="text-[12px] text-white/50 mt-0.5">
                            Clinic Pulse trend strip
                          </p>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/70 leading-relaxed">
                        Three key metrics as sparklines over the last 12 weeks,
                        sitting at the bottom of your dashboard. Fills in as weekly pipeline runs complete.
                      </p>
                    </div>

                    <div className="px-8 py-5 space-y-3.5">
                      {[
                        {
                          icon: TrendingUp,
                          color: "#8B5CF6",
                          label: "Follow-up rate over 12 weeks",
                          detail: "See whether your follow-up booking rate is heading up or down week on week.",
                        },
                        {
                          icon: Brain,
                          color: "#8B5CF6",
                          label: "HEP compliance trend",
                          detail: "Track how consistently your clinicians are assigning exercise programmes over time.",
                        },
                        {
                          icon: Activity,
                          color: "#8B5CF6",
                          label: "DNA rate history",
                          detail: "Spot patterns in no-shows. If a particular stretch of weeks spikes, the sparkline shows it.",
                        },
                        {
                          icon: MessageSquare,
                          color: "#8B5CF6",
                          label: "Delta badge vs 4 weeks ago",
                          detail: "Each sparkline shows how the latest week compares to where you were a month ago.",
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

                {card === 3 && (
                  <motion.div
                    key="ava"
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* ── Card 3: Ava pause/resume + call capture ── */}
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
                          <h2 className="font-display text-[22px] text-white leading-tight">
                            Ava handles interruptions properly
                          </h2>
                          <p className="text-[12px] text-white/50 mt-0.5">
                            Real pause/resume and full call capture
                          </p>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/70 leading-relaxed">
                        Pausing now physically detaches the phone from the agent.
                        And every call is logged, including ones that end before Ava says anything.
                      </p>
                    </div>

                    <div className="px-8 py-5 space-y-3.5">
                      {[
                        {
                          icon: PhoneCall,
                          color: "#1C54F2",
                          label: "Pause detaches the phone from the agent",
                          detail: "Previously, pausing was cosmetic. Now it physically removes the phone from the ElevenLabs agent. Resuming reattaches it.",
                        },
                        {
                          icon: Shield,
                          color: "#1C54F2",
                          label: "All calls logged, including instant hangups",
                          detail: "Calls that end before Ava speaks now appear in the log as zero-duration entries. Nothing goes missing.",
                        },
                        {
                          icon: MessageSquare,
                          color: "#1C54F2",
                          label: "Post-call summary for every call",
                          detail: "A summary is generated for every call, not just ones that resulted in a booking.",
                        },
                        {
                          icon: Brain,
                          color: "#1C54F2",
                          label: "Webhook catches all call outcomes",
                          detail: "The post-call webhook fires for short calls, missed calls, and hangups. All recorded correctly.",
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

                {card === 4 && (
                  <motion.div
                    key="ui"
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* ── Card 4: Dashboard UI uplift ── */}
                    <div
                      className="px-8 pt-7 pb-6 relative"
                      style={{
                        background:
                          "linear-gradient(135deg, #1C54F2 0%, #0891B2 50%, #8B5CF6 100%)",
                      }}
                    >
                      <div className="flex items-center gap-3.5 mb-3">
                        <div
                          className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(255,255,255,0.10)" }}
                        >
                          <Activity size={22} className="text-white" />
                        </div>
                        <div>
                          <h2 className="font-display text-[22px] text-white leading-tight">
                            Dashboard feels like it should
                          </h2>
                          <p className="text-[12px] text-white/60 mt-0.5">
                            Cleaner, sharper, more useful
                          </p>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/75 leading-relaxed">
                        Tiles render cleanly in both light and dark mode.
                        New controls in the header. A help button in the corner of every page.
                      </p>
                    </div>

                    <div className="px-8 py-5 space-y-3.5">
                      {[
                        {
                          icon: Activity,
                          color: "#0891B2",
                          label: "Glass card banding fixed in dark mode",
                          detail: "Stacked white overlays were creating visible bands on tile surfaces. Resolved across all dashboard tiles.",
                        },
                        {
                          icon: Shield,
                          color: "#0891B2",
                          label: "Notification bell redesigned",
                          detail: "Circular button with a glow ring on hover. Unread count shows as a small dot badge.",
                        },
                        {
                          icon: Brain,
                          color: "#0891B2",
                          label: "Aperture toggle next to the bell",
                          detail: "Switch between light and dark mode directly from the dashboard header, without going into settings.",
                        },
                        {
                          icon: Lock,
                          color: "#0891B2",
                          label: "Help orb in the bottom-right corner",
                          detail: "A small button sits fixed at the bottom right of every page. Click it for guidance without leaving the screen.",
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
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
