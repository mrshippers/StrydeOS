"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { X, Mail, ArrowRight, Upload, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const DISMISS_KEY = "strydeos_writeupp_sync_remind_at";
const REMIND_MS = 7 * 24 * 60 * 60 * 1000;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() < parseInt(raw, 10);
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + REMIND_MS));
  } catch { /* ignore */ }
}

export default function WriteUppSyncModal() {
  const { user } = useAuth();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!user?.clinicProfile) return;
    const { pmsType, pmsLastSyncAt, dataMode } = user.clinicProfile;

    if (pmsType !== "writeupp") return;
    if (isDismissed()) return;

    const neverSynced = !pmsLastSyncAt;
    const isSample = dataMode === "sample";
    const daysSince = pmsLastSyncAt
      ? Math.floor((Date.now() - new Date(pmsLastSyncAt).getTime()) / 86_400_000)
      : null;
    const isStale = daysSince !== null && daysSince > 7;

    if (neverSynced || isSample || isStale) {
      // Small delay so it renders after splash/tour modals
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, [user]);

  const dismiss = useCallback(() => {
    snooze();
    setVisible(false);
  }, []);

  const goSetup = useCallback(() => {
    snooze();
    setVisible(false);
    router.push("/onboarding/writeupp");
  }, [router]);

  const goManualUpload = useCallback(() => {
    snooze();
    setVisible(false);
    router.push("/settings#csv-import-section");
  }, [router]);

  // Focus trap
  useEffect(() => {
    if (!visible) return;
    previousFocusRef.current = document.activeElement as HTMLElement;

    const timer = setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, 100);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { dismiss(); return; }
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKey);
      previousFocusRef.current?.focus();
    };
  }, [visible, dismiss]);

  // Derive status copy from profile
  const profile = user?.clinicProfile;
  const pmsLastSyncAt = profile?.pmsLastSyncAt ?? null;
  const dataMode = profile?.dataMode;
  const daysSince = pmsLastSyncAt
    ? Math.floor((Date.now() - new Date(pmsLastSyncAt).getTime()) / 86_400_000)
    : null;

  let statusLine: string;
  if (!pmsLastSyncAt) {
    statusLine = "Your WriteUpp data hasn\u2019t been imported yet.";
  } else if (dataMode === "sample") {
    statusLine = "You\u2019re currently viewing sample data, not your real clinic.";
  } else {
    statusLine = `Last import was ${daysSince} day${daysSince !== 1 ? "s" : ""} ago \u2014 your KPIs may be out of date.`;
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          style={{ background: "rgba(11, 37, 69, 0.6)", backdropFilter: "blur(6px)" }}
          role="presentation"
          onClick={dismiss}
        >
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.45, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="writeupp-sync-title"
            className="w-full max-w-md rounded-2xl overflow-hidden bg-cream"
            style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="relative px-8 pt-7 pb-6"
              style={{
                background: "linear-gradient(135deg, #0B2545 0%, #132D5E 55%, #1C54F2 100%)",
              }}
            >
              <button
                type="button"
                onClick={dismiss}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X size={15} />
              </button>

              <div className="flex items-center gap-3.5 mb-3">
                <div
                  className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255,255,255,0.10)" }}
                >
                  <Mail size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-0.5">
                    WriteUpp sync
                  </p>
                  <h2
                    id="writeupp-sync-title"
                    className="font-display text-[20px] text-white leading-tight"
                  >
                    Connect your data
                  </h2>
                </div>
              </div>

              <p className="text-[13px] text-white/65 leading-relaxed">
                {statusLine}
              </p>
            </div>

            {/* Flow diagram */}
            <div className="px-8 pt-5 pb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-4">
                How it works
              </p>
              <div className="flex items-center gap-2">
                {[
                  { label: "WriteUpp", sub: "emails a CSV report" },
                  { label: "Stryde inbox", sub: "receives & parses it" },
                  { label: "Your dashboard", sub: "updates automatically" },
                ].map((step, i, arr) => (
                  <div key={step.label} className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-navy truncate">{step.label}</p>
                      <p className="text-[11px] text-muted leading-tight mt-0.5">{step.sub}</p>
                    </div>
                    {i < arr.length - 1 && (
                      <ArrowRight size={13} className="text-muted shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="mx-8 my-4 border-t border-border" />

            {/* Actions */}
            <div className="px-8 pb-7 space-y-2.5">
              <button
                type="button"
                data-autofocus
                onClick={goSetup}
                className="btn-primary w-full justify-center"
              >
                Set up email sync
                <ArrowRight size={14} />
              </button>

              <button
                type="button"
                onClick={goManualUpload}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-2.5 text-[13px] font-medium text-navy transition-colors hover:bg-navy/5"
              >
                <Upload size={14} />
                Upload a CSV manually
              </button>

              <button
                type="button"
                onClick={dismiss}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] text-muted hover:text-navy transition-colors"
              >
                <Clock size={12} />
                Remind me in 7 days
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
