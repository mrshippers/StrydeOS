"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendPasswordResetEmail } from "firebase/auth";
import { useAuth } from "@/hooks/useAuth";
import { getFirebaseAuth } from "@/lib/firebase";
import { AlertCircle, Loader2, ArrowRight, Check } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { StrydeOSLogo } from "@/components/MonolithLogo";

const LAST_EMAIL_KEY = "strydeos_last_email";

function LoginHeader({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-10 bg-cloud-dancer">
      <StrydeOSLogo size={34} fontSize={17} theme="light" gap={10} />
      <button
        type="button"
        onClick={onTryDemo}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-navy border border-border hover:border-navy/30 hover:bg-cloud-light transition-colors"
      >
        Try demo
        <ArrowRight size={14} />
      </button>
    </header>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, signIn, enterDemoMode, isFirebaseConfigured } = useAuth();
  const shouldReduce = useReducedMotion();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LAST_EMAIL_KEY);
      if (stored) {
        setEmail(stored);
        setRememberedEmail(stored);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      const next = searchParams.get("next");
      const dest = next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : user.role === "superadmin" ? "/admin" : "/dashboard";
      router.replace(dest);
    }
  }, [authLoading, user, router, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signIn(email.trim(), password);
      try {
        localStorage.setItem(LAST_EMAIL_KEY, email.trim());
      } catch {
        // localStorage unavailable
      }
      setSuccess(true);
    } catch (err: unknown) {
      const code =
        err instanceof Error && "code" in err
          ? (err as { code: string }).code
          : "";
      const message = err instanceof Error ? err.message : String(err);
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("Invalid email or password.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a moment and try again.");
      } else if (code === "auth/operation-not-allowed") {
        setError("Email/password sign-in is not enabled. Check Firebase Console → Authentication → Sign-in method.");
      } else if (code === "auth/invalid-api-key" || code === "auth/api-key-not-valid") {
        setError("Firebase API key is invalid. Check your .env.local configuration.");
      } else {
        console.error("[Login]", code, message, err);
        setError(
          code ? `Sign-in failed: ${code}` : "Something went wrong. Please try again. Check the browser console for details."
        );
      }
      setSubmitting(false);
    }
  }

  async function handleForgotPassword(e: React.MouseEvent) {
    e.preventDefault();
    setError(null);
    setResetError(null);
    setResetSent(false);
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setResetError("Enter your email above, then click Forgot password.");
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      setResetError("Sign-in is not configured.");
      return;
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setResetSent(true);
    } catch (err: unknown) {
      const code = err instanceof Error && "code" in err ? (err as { code: string }).code : "";
      if (code === "auth/user-not-found") {
        setResetError("No account found with that email.");
      } else if (code === "auth/invalid-email") {
        setResetError("Please enter a valid email address.");
      } else {
        setResetError(err instanceof Error ? err.message : "Could not send reset email. Try again.");
      }
    } finally {
      setResetLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-cloud-dancer">
        <LoginHeader onTryDemo={enterDemoMode} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-muted" />
        </div>
      </div>
    );
  }

  if (user) return null;

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen flex flex-col px-4 bg-cloud-dancer">
        <LoginHeader onTryDemo={enterDemoMode} />
        <div className="flex-1 flex items-center justify-center pt-4">
          <div className="w-full max-w-[400px]">
            <div className="rounded-2xl p-8 text-center bg-white border border-border shadow-[var(--shadow-elevated)]">
              <h1 className="font-display text-[24px] text-navy leading-tight mb-2">
                No Firebase config
              </h1>
              <p className="text-sm text-muted mb-6">
                Add your Firebase keys to <code className="text-navy font-mono text-xs bg-cloud-light px-1.5 py-0.5 rounded">.env.local</code> to sign in. Or try the dashboard with demo data.
              </p>
              <button
                type="button"
                onClick={enterDemoMode}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 bg-blue"
              >
                Enter dashboard (demo)
                <ArrowRight size={14} />
              </button>
            </div>
            <p className="text-center text-[11px] text-muted mt-6">
              StrydeOS — Clinical Performance Platform
            </p>
          </div>
        </div>
      </div>
    );
  }

  const stagger = shouldReduce ? 0 : 0.1;
  const fadeUp = shouldReduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  const isReturning = rememberedEmail !== null;

  return (
    <AnimatePresence mode="wait">
      {!success ? (
        <motion.div
          key="login"
          className="min-h-screen flex flex-col px-4 bg-cloud-dancer"
          exit={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <LoginHeader onTryDemo={enterDemoMode} />
          <div className="flex-1 flex items-center justify-center pt-4">
            <div className="w-full max-w-[400px]">
              {/* Card */}
              <motion.div
                className="rounded-2xl p-8 bg-white border border-border shadow-[var(--shadow-elevated)]"
                {...fadeUp}
                transition={{ duration: 0.4, delay: stagger * 1, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div className="text-center mb-8">
                  <h1 className="font-display text-[24px] text-navy leading-tight">
                    {isReturning ? "Welcome back" : "Sign in"}
                  </h1>
                  <p className="text-sm text-muted mt-1.5">
                    {isReturning
                      ? `Signing in as ${rememberedEmail}`
                      : "Sign in to your clinic dashboard"}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase tracking-widest mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setResetError(null); setResetSent(false); }}
                      required
                      autoFocus={!isReturning}
                      autoComplete="email"
                      placeholder="you@clinic.com"
                      className="w-full px-4 py-3 rounded-xl text-sm text-navy placeholder-muted border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[11px] font-semibold text-muted uppercase tracking-widest">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={resetLoading}
                        className="text-[11px] font-semibold text-blue hover:underline disabled:opacity-50"
                      >
                        {resetLoading ? "Sending…" : "Forgot password?"}
                      </button>
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setResetError(null); setResetSent(false); }}
                      required
                      autoFocus={isReturning}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="w-full px-4 py-3 rounded-xl text-sm text-navy placeholder-muted border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                    />
                  </div>

                  {resetSent && (
                    <div className="p-3.5 rounded-xl bg-success/10 border border-success/20 text-[13px] text-success">
                      Check your email for a link to reset your password.
                    </div>
                  )}
                  {resetError && (
                    <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-danger/10 border border-danger/20">
                      <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
                      <p className="text-[13px] text-danger">{resetError}</p>
                    </div>
                  )}

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-danger/10 border border-danger/20">
                          <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
                          <p className="text-[13px] text-danger">{error}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white bg-blue transition-colors duration-200 hover:opacity-90 disabled:opacity-50"
                    whileTap={shouldReduce ? {} : { scale: 0.97 }}
                  >
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        Sign in
                        <ArrowRight size={14} />
                      </>
                    )}
                  </motion.button>
                </form>
              </motion.div>

              {/* Footer */}
              <motion.p
                className="text-center text-[11px] text-muted mt-6"
                {...fadeUp}
                transition={{ duration: 0.4, delay: stagger * 2, ease: [0.2, 0.8, 0.2, 1] }}
              >
                StrydeOS — Clinical Performance Platform
              </motion.p>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="login-success"
          className="min-h-screen flex items-center justify-center bg-cloud-dancer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="flex flex-col items-center gap-3"
            initial={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-success">
              <Check size={22} className="text-white" strokeWidth={3} />
            </div>
            <p className="text-sm font-medium text-muted">Signing you in...</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function LoginPage() {
  return <LoginPageInner />;
}
