"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { AlertCircle, ArrowRight, Loader2, MailCheck, X, KeyRound } from "lucide-react";

interface ForgotPasswordDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fills the email field — typically whatever the user already typed on the sign-in form. */
  initialEmail?: string;
}

/**
 * ForgotPasswordDialog — the StrydeOS-skinned password reset modal.
 *
 * Replaces the prior inline flow that silently reused the sign-in email field
 * (which read as broken — no input, no acknowledgement). Renders as a portalled
 * overlay so it floats above the login shell, owns its own email input, and
 * carries the full dark-navy surface treatment (surface-tile + emboss +
 * elevated shadow). Esc / backdrop-click close; focus lands on the input.
 */
export default function ForgotPasswordDialog({ open, onClose, initialEmail = "" }: ForgotPasswordDialogProps) {
  const shouldReduce = useReducedMotion();
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  // Re-sync from the sign-in field and clear transient state every time it opens.
  useEffect(() => {
    if (!open) return;
    setEmail(initialEmail);
    setSent(false);
    setError(null);
    setLoading(false);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open, initialEmail]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter the email address for your account.");
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      setError("Sign-in is not configured.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setSent(true);
    } catch (err: unknown) {
      const code = err instanceof Error && "code" in err ? (err as { code: string }).code : "";
      if (code === "auth/user-not-found") {
        setError("No account found with that email.");
      } else if (code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a moment and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Could not send reset email. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="forgot-overlay"
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: "rgba(6,24,46,0.55)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Reset your password"
            className="surface-emboss relative w-full max-w-[400px] overflow-hidden rounded-[24px] border border-border p-6 shadow-[var(--shadow-elevated)]"
            style={{ background: "var(--surface-tile)" }}
            initial={shouldReduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-cloud-light hover:text-navy"
            >
              <X size={15} />
            </button>

            {!sent ? (
              <>
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue/10">
                    <KeyRound size={22} className="text-blue" />
                  </div>
                  <h2 className="font-display text-[24px] leading-tight text-navy">Reset your password</h2>
                  <p className="mt-1.5 text-sm text-navy/60">
                    Enter your account email and we&apos;ll send a secure link to set a new password.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-navy/80">
                      Email
                    </label>
                    <input
                      ref={inputRef}
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(null); }}
                      required
                      autoComplete="email"
                      placeholder="you@clinic.com"
                      className="w-full rounded-xl border border-border bg-cloud-light px-4 py-3 text-sm text-navy placeholder-muted transition-all focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/30"
                    />
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger/10 p-3.5">
                          <AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" />
                          <p className="text-[13px] text-danger">{error}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue py-3 text-sm font-semibold text-navy transition-colors duration-200 hover:opacity-90 disabled:opacity-50 dark:text-white"
                    whileTap={shouldReduce ? {} : { scale: 0.97 }}
                  >
                    {loading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        Send reset link
                        <ArrowRight size={14} />
                      </>
                    )}
                  </motion.button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full text-sm text-muted transition-colors hover:text-navy"
                  >
                    Back to sign in
                  </button>
                </form>
              </>
            ) : (
              <div className="py-2 text-center">
                <motion.div
                  className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/15"
                  initial={shouldReduce ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <MailCheck size={24} className="text-success" />
                </motion.div>
                <h2 className="font-display text-[24px] leading-tight text-navy">Check your inbox</h2>
                <p className="mx-auto mt-1.5 max-w-[300px] text-sm text-navy/60">
                  A secure link to reset your password is on its way to{" "}
                  <span className="font-semibold text-navy">{email.trim()}</span>. It can take a minute — remember to check spam.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue py-3 text-sm font-semibold text-navy transition-colors duration-200 hover:opacity-90 dark:text-white"
                >
                  Done
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
