"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  multiFactor,
  PhoneMultiFactorGenerator,
  TotpMultiFactorGenerator,
  MultiFactorError,
  type MultiFactorResolver,
} from "firebase/auth";
import { useAuth } from "@/hooks/useAuth";
import { getFirebaseAuth } from "@/lib/firebase";
import { AlertCircle, Loader2, ArrowRight, Check, Building2, Shield, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { StrydeOSLogo } from "@/components/MonolithLogo";
import { trackCTAClick } from "@/lib/funnel-events";

const LAST_EMAIL_KEY = "strydeos_last_email";

type AuthMode = "signin" | "signup";

function LoginHeader({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <header className="fixed top-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-10 bg-cloud-dancer">
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

  const initialMode: AuthMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [fullName, setFullName] = useState("");
  const [profession, setProfession] = useState("");
  const [clinicSize, setClinicSize] = useState("");
  const [country, setCountry] = useState("uk");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaVerifying, setMfaVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  function switchMode(newMode: AuthMode) {
    setMode(newMode);
    setError(null);
    setResetSent(false);
    setResetError(null);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    trackCTAClick("Create account", "login_page");

    try {
      const res = await fetch("/api/clinic/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicName: clinicName.trim(),
          email: email.trim(),
          password,
          firstName: fullName.trim().split(" ")[0] || "",
          lastName: fullName.trim().split(" ").slice(1).join(" ") || "",
          profession,
          clinicSize,
          country,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      const auth = getFirebaseAuth();
      if (!auth) {
        setError("Firebase is not configured.");
        setSubmitting(false);
        return;
      }

      await signInWithEmailAndPassword(auth, email.trim(), password);
      try {
        localStorage.setItem(LAST_EMAIL_KEY, email.trim());
      } catch {
        // localStorage unavailable
      }
      setSuccess(true);
      const next = searchParams.get("next");
      const dest = next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/onboarding";
      setTimeout(() => router.push(dest), 800);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setSubmitting(false);
    }
  }

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const auth = getFirebaseAuth();
      if (!auth) {
        setError("Firebase is not configured.");
        setSubmitting(false);
        return;
      }

      await signInWithEmailAndPassword(auth, email.trim(), password);
      
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
      
      if (code === "auth/multi-factor-auth-required") {
        const mfaError = err as MultiFactorError;
        const resolver = (mfaError as any).resolver || (mfaError.customData as any)?.resolver;
        if (resolver) {
          setMfaResolver(resolver);
          setMfaRequired(true);
          setSubmitting(false);
          return;
        }
      }
      
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

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaResolver || mfaCode.length !== 6) return;

    setError(null);
    setMfaVerifying(true);

    try {
      const selectedFactor = mfaResolver.hints.find(
        (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID
      );

      if (!selectedFactor) {
        setError("TOTP factor not found. Please contact support.");
        setMfaVerifying(false);
        return;
      }

      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        selectedFactor.uid,
        mfaCode
      );

      await mfaResolver.resolveSignIn(assertion);

      try {
        localStorage.setItem(LAST_EMAIL_KEY, email.trim());
      } catch {
        // localStorage unavailable
      }
      
      setSuccess(true);
    } catch (err: unknown) {
      console.error("[MFA verify error]", err);
      const code = err instanceof Error && "code" in err ? (err as { code: string }).code : "";
      
      if (code === "auth/invalid-verification-code") {
        setError("Invalid code. Please try again.");
      } else {
        setError("Verification failed. Please try again.");
      }
      setMfaVerifying(false);
      setMfaCode("");
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

  const isReturning = rememberedEmail !== null && mode === "signin";

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
              <motion.div
                className="rounded-2xl p-6 bg-white border border-border shadow-[var(--shadow-elevated)]"
                {...fadeUp}
                transition={{ duration: 0.4, delay: stagger * 1, ease: [0.2, 0.8, 0.2, 1] }}
              >
                {/* Mode toggle */}
                <div className="flex rounded-xl bg-cloud-light p-1 mb-6">
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                      mode === "signin"
                        ? "bg-white text-navy shadow-sm button-highlight"
                        : "text-navy/50 hover:text-navy"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                      mode === "signup"
                        ? "bg-white text-navy shadow-sm button-highlight"
                        : "text-navy/50 hover:text-navy"
                    }`}
                  >
                    Create account
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {mode === "signin" ? (
                    <motion.div
                      key="signin-form"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                    >
                      {mfaRequired ? (
                        <>
                          <div className="text-center mb-6">
                            <div className="h-12 w-12 rounded-xl bg-blue/10 flex items-center justify-center mx-auto mb-3">
                              <Shield size={24} className="text-blue" />
                            </div>
                            <h1 className="font-display text-[24px] text-navy leading-tight">
                              Enter verification code
                            </h1>
                            <p className="text-sm text-navy/60 mt-1.5">
                              Enter the 6-digit code from your authenticator app
                            </p>
                          </div>

                          <form onSubmit={handleMfaVerify} className="space-y-5">
                            <div>
                              <label className="block text-[11px] font-semibold text-navy/80 uppercase tracking-widest mb-2">
                                Verification Code
                              </label>
                              <input
                                type="text"
                                value={mfaCode}
                                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                                maxLength={6}
                                autoFocus
                                required
                                placeholder="000000"
                                className="w-full px-4 py-3 rounded-xl text-sm text-navy text-center font-mono placeholder-muted border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && mfaCode.length === 6) handleMfaVerify(e as any);
                                }}
                              />
                            </div>

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

                            <motion.button
                              type="submit"
                              disabled={mfaVerifying || mfaCode.length !== 6}
                              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white bg-blue transition-colors duration-200 hover:opacity-90 disabled:opacity-50"
                              whileTap={shouldReduce ? {} : { scale: 0.97 }}
                            >
                              {mfaVerifying ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <>
                                  Verify
                                  <ArrowRight size={14} />
                                </>
                              )}
                            </motion.button>

                            <button
                              type="button"
                              onClick={() => {
                                setMfaRequired(false);
                                setMfaResolver(null);
                                setMfaCode("");
                                setError(null);
                              }}
                              className="w-full text-sm text-muted hover:text-navy transition-colors"
                            >
                              ← Back to sign in
                            </button>
                          </form>
                        </>
                      ) : (
                        <>
                          <div className="text-center mb-6">
                            <h1 className="font-display text-[24px] text-navy leading-tight">
                              {isReturning ? "Welcome back" : "Sign in"}
                            </h1>
                            <p className="text-sm text-navy/60 mt-1.5">
                              {isReturning
                                ? `Signing in as ${rememberedEmail}`
                                : "Sign in to your clinic dashboard"}
                            </p>
                          </div>

                          <form onSubmit={handleSignin} className="space-y-5">
                        <div>
                          <label className="block text-[11px] font-semibold text-navy/80 uppercase tracking-widest mb-2">
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
                            <label className="block text-[11px] font-semibold text-navy/80 uppercase tracking-widest">
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
                          <div className="relative">
                            <input
                              type={showPassword ? "text" : "password"}
                              value={password}
                              onChange={(e) => { setPassword(e.target.value); setResetError(null); setResetSent(false); }}
                              required
                              autoFocus={isReturning}
                              autoComplete="current-password"
                              placeholder="Enter your password"
                              className="w-full px-4 py-3 pr-11 rounded-xl text-sm text-navy placeholder-muted border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-navy transition-colors"
                              tabIndex={-1}
                            >
                              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
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

                          <p className="text-center text-[12px] text-muted mt-5">
                            Don&apos;t have an account?{" "}
                            <button type="button" onClick={() => switchMode("signup")} className="text-blue font-semibold hover:underline">
                              Start your free trial
                            </button>
                          </p>
                        </>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="signup-form"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="text-center mb-6">
                        <h1 className="font-display text-[24px] text-navy leading-tight">
                          Start your free trial
                        </h1>
                        <p className="text-sm text-navy/60 mt-1.5">
                          14 days free — no credit card required
                        </p>
                      </div>

                      <form onSubmit={handleSignup} className="space-y-5">
                        <div>
                          <label className="block text-[11px] font-semibold text-navy/80 uppercase tracking-widest mb-2">
                            Clinic name
                          </label>
                          <div className="relative">
                            <Building2 size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                            <input
                              type="text"
                              value={clinicName}
                              onChange={(e) => setClinicName(e.target.value)}
                              required
                              autoFocus
                              placeholder="Your clinic name"
                              className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-navy placeholder-muted border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-semibold text-navy/80 uppercase tracking-widest mb-2">
                              Profession
                            </label>
                            <select
                              value={profession}
                              onChange={(e) => setProfession(e.target.value)}
                              required
                              className="w-full px-4 py-3 rounded-xl text-sm text-navy border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all appearance-none"
                            >
                              <option value="" disabled>Select...</option>
                              <option value="physiotherapist">Physiotherapist</option>
                              <option value="osteopath">Osteopath</option>
                              <option value="chiropractor">Chiropractor</option>
                              <option value="sports_therapist">Sports Therapist</option>
                              <option value="personal_trainer_medical">Personal Trainer (Medical)</option>
                              <option value="gp_primary_care">GP / Primary Care</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-navy/80 uppercase tracking-widest mb-2">
                              Clinic size
                            </label>
                            <select
                              value={clinicSize}
                              onChange={(e) => setClinicSize(e.target.value)}
                              required
                              className="w-full px-4 py-3 rounded-xl text-sm text-navy border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all appearance-none"
                            >
                              <option value="" disabled>Select...</option>
                              <option value="solo">Solo (1 practitioner)</option>
                              <option value="small">Small (2–5)</option>
                              <option value="midsize">Mid-size (6–10)</option>
                              <option value="large">Large (10+)</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-navy/80 uppercase tracking-widest mb-2">
                            Country / Region
                          </label>
                          <select
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-xl text-sm text-navy border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all appearance-none"
                          >
                            <option value="uk">United Kingdom / EU</option>
                            <option value="us">United States</option>
                            <option value="au">Australia</option>
                            <option value="ca">Canada</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-navy/80 uppercase tracking-widest mb-2">
                            Your name
                          </label>
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                            autoComplete="name"
                            placeholder="First and last name"
                            className="w-full px-4 py-3 rounded-xl text-sm text-navy placeholder-muted border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-navy/80 uppercase tracking-widest mb-2">
                            Email
                          </label>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            placeholder="you@clinic.com"
                            className="w-full px-4 py-3 rounded-xl text-sm text-navy placeholder-muted border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-navy/80 uppercase tracking-widest mb-2">
                            Password
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? "text" : "password"}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                              minLength={8}
                              autoComplete="new-password"
                              placeholder="Minimum 8 characters"
                              className="w-full px-4 py-3 pr-11 rounded-xl text-sm text-navy placeholder-muted border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-navy transition-colors"
                              tabIndex={-1}
                            >
                              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
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
                              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-danger/10 border border-danger/20">
                                <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
                                <p className="text-[13px] text-danger">{error}</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <motion.button
                          type="submit"
                          disabled={submitting || !clinicName.trim() || !fullName.trim() || !email.trim() || password.length < 8}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white bg-blue transition-colors duration-200 hover:opacity-90 disabled:opacity-50"
                          whileTap={shouldReduce ? {} : { scale: 0.97 }}
                        >
                          {submitting ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <>
                              Create account
                              <ArrowRight size={14} />
                            </>
                          )}
                        </motion.button>
                      </form>

                      <p className="text-center text-[12px] text-muted mt-5">
                        Already have an account?{" "}
                        <button type="button" onClick={() => switchMode("signin")} className="text-blue font-semibold hover:underline">
                          Sign in
                        </button>
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

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
            <p className="text-sm font-medium text-muted">
              {mode === "signup" ? "Account created — setting up your clinic..." : "Signing you in..."}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function LoginPage() {
  return <LoginPageInner />;
}
