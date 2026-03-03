"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AlertCircle, Loader2, ArrowRight, Check } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

const LAST_EMAIL_KEY = "strydeos_last_email";

function LoginHeader({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <header
      className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-10"
      style={{ background: "#0B2545" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-[10px] flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #0B2545, #1A5CDB)" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 13L8 3l5 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 9h5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-[18px] font-bold tracking-tight text-white">
          Stryde<span style={{ color: "#3B90FF" }}>OS</span>
        </span>
      </div>
      <button
        type="button"
        onClick={onTryDemo}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white/90 hover:text-white transition-colors border border-white/20 hover:border-white/40"
      >
        Try demo
        <ArrowRight size={14} />
      </button>
    </header>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, signIn, enterDemoMode, isFirebaseConfigured } = useAuth();
  const shouldReduce = useReducedMotion();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(null);

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
      router.replace(user.role === "superadmin" ? "/admin" : "/dashboard");
    }
  }, [authLoading, user, router]);

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

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#0B2545" }}>
        <LoginHeader onTryDemo={enterDemoMode} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-white/40" />
        </div>
      </div>
    );
  }

  if (user) return null;

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen flex flex-col px-4" style={{ background: "#0B2545" }}>
        <LoginHeader onTryDemo={enterDemoMode} />
        <div className="flex-1 flex items-center justify-center pt-4">
          <div className="w-full max-w-[400px]">
            <div
              className="rounded-2xl p-8 text-center"
              style={{
                background: "#132D5E",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              }}
            >
              <h1 className="font-display text-[24px] text-white leading-tight mb-2">
                No Firebase config
              </h1>
              <p className="text-sm text-white/50 mb-6">
                Add your Firebase keys to <code className="text-white/70">.env.local</code> to sign in. Or try the dashboard with demo data.
              </p>
              <button
                type="button"
                onClick={enterDemoMode}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:opacity-90"
                style={{ background: "#1A5CDB" }}
              >
                Enter dashboard (demo)
                <ArrowRight size={14} />
              </button>
            </div>
            <p className="text-center text-[11px] text-white/20 mt-6">
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
          className="min-h-screen flex flex-col px-4"
          style={{ background: "#0B2545" }}
          exit={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <LoginHeader onTryDemo={enterDemoMode} />
          <div className="flex-1 flex items-center justify-center pt-4">
            <div className="w-full max-w-[400px]">
              {/* Card */}
              <motion.div
              className="rounded-2xl p-8"
              style={{
                background: "#132D5E",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              }}
              {...fadeUp}
              transition={{ duration: 0.4, delay: stagger * 1, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="text-center mb-8">
                <h1 className="font-display text-[24px] text-white leading-tight">
                  {isReturning ? "Welcome back" : "Sign in"}
                </h1>
                <p className="text-sm text-white/40 mt-1.5">
                  {isReturning
                    ? `Signing in as ${rememberedEmail}`
                    : "Sign in to your clinic dashboard"}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus={!isReturning}
                    autoComplete="email"
                    placeholder="you@clinic.com"
                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-blue-glow/40 transition-all"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus={isReturning}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-blue-glow/40 transition-all"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
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
                      <div className="flex items-start gap-2.5 p-3.5 rounded-xl" style={{ background: "rgba(220,38,38,0.12)" }}>
                        <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
                        <p className="text-[13px] text-danger/90">{error}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-colors duration-200 hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#1A5CDB" }}
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
                className="text-center text-[11px] text-white/20 mt-6"
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
          className="min-h-screen flex items-center justify-center"
          style={{ background: "#0B2545" }}
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
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#059669" }}>
              <Check size={22} className="text-white" strokeWidth={3} />
            </div>
            <p className="text-sm font-medium text-white/60">Signing you in...</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
