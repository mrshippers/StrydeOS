"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Plug,
  Zap,
  ChevronRight,
  Check,
  Loader2,
  HelpCircle,
  Eye,
  EyeOff,
  UserPlus,
  Shield,
  Settings2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { db, getFirebaseAuth } from "@/lib/firebase";
import type { OnboardingStage, PmsProvider } from "@/types";
import { StrydeOSLogo } from "@/components/MonolithLogo";
import type { ModuleKey } from "@/lib/billing";

// ─── Brand tokens ────────────────────────────────────────────────────────────

const C = {
  navy: "#0B2545",
  navyMid: "#132D5E",
  blue: "#1C54F2",
  blueGlow: "#4B8BF5",
  teal: "#0891B2",
  purple: "#8B5CF6",
  success: "#059669",
  cream: "#FAF9F7",
};

// ─── Step definitions ────────────────────────────────────────────────────────

type StepId = "signup" | "verify" | "configure" | "pms" | "golive";

interface WizardStep {
  id: StepId;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
}

const ALL_STEPS: WizardStep[] = [
  { id: "signup", title: "Create your account", subtitle: "Start your 14-day free trial", icon: UserPlus, color: C.blue },
  { id: "verify", title: "Verify your clinic", subtitle: "Business details and data agreements", icon: Shield, color: C.blue },
  { id: "configure", title: "Configure your module", subtitle: "Set up your selected module", icon: Settings2, color: C.purple },
  { id: "pms", title: "Connect your PMS", subtitle: "Sync patient data (optional — you can do this later)", icon: Plug, color: C.blue },
  { id: "golive", title: "Go live", subtitle: "Review your setup and launch StrydeOS", icon: Zap, color: C.success },
];

// ─── Module config ───────────────────────────────────────────────────────────

type TrialModule = ModuleKey | "fullstack";
type TrialTier = "solo" | "studio" | "clinic";

const MODULE_META: Record<TrialModule, { name: string; color: string }> = {
  intelligence: { name: "Intelligence", color: C.purple },
  ava: { name: "Ava", color: C.blue },
  pulse: { name: "Pulse", color: C.teal },
  fullstack: { name: "Full Stack", color: C.blue },
};

const TIER_OPTIONS: { id: TrialTier; label: string; detail: string }[] = [
  { id: "solo", label: "Solo", detail: "1 clinician" },
  { id: "studio", label: "Studio", detail: "2–4 clinicians" },
  { id: "clinic", label: "Clinic", detail: "5+ clinicians" },
];

// ─── PMS + Pulse options (carried from original) ─────────────────────────────

const PMS_OPTIONS = [
  { id: "writeupp" as PmsProvider, label: "WriteUpp", description: "Most popular in UK private physio — 50,000+ clinicians", badge: "Recommended" as string | null },
  { id: "cliniko" as PmsProvider, label: "Cliniko", description: "Global PMS with strong UK adoption via CSP partnership", badge: null },
  { id: "halaxy" as PmsProvider, label: "Halaxy", description: "UK/EU practice management with FHIR-standard API", badge: null },
  { id: "powerdiary" as PmsProvider, label: "Zanda (Power Diary)", description: "UK & Australian PMS with self-serve API access", badge: null },
  { id: "tm3" as PmsProvider, label: "TM3 (Blue Zinc)", description: "Dominant in MSK and insurance-funded UK clinics — CSV bridge", badge: "CSV Bridge" as string | null },
  { id: "pps" as PmsProvider, label: "PPS (Rushcliff)", description: "Legacy UK incumbent — 2,400+ clinics across physio, podiatry, osteopathy", badge: "Coming Soon" as string | null },
];

const PULSE_SEQUENCES = [
  { id: "rebooking_prompt", label: "Rebooking prompt", description: "SMS when patient hasn't rebooked within 72h of their last session", defaultOn: true },
  { id: "hep_reminder", label: "HEP reminder", description: "SMS reminder to complete home exercises before next appointment", defaultOn: true },
  { id: "review_prompt", label: "Review prompt", description: "SMS requesting a Google review after discharge", defaultOn: true },
  { id: "reactivation_90d", label: "90-day reactivation", description: "Email re-engagement if patient hasn't booked in 90 days", defaultOn: false },
  { id: "reactivation_180d", label: "6-month reactivation", description: "Email re-engagement campaign after 6 months of inactivity", defaultOn: false },
  { id: "pre_auth_collection", label: "Insurance pre-auth", description: "Email reminder to obtain pre-authorisation before first session", defaultOn: true },
];

// ─── STEP_TO_STAGE mapping ───────────────────────────────────────────────────

const STEP_TO_STAGE: Record<StepId, OnboardingStage> = {
  signup: "signup_complete",
  verify: "onboarding_started",
  configure: "onboarding_started",
  pms: "integration_self_serve",
  golive: "activation_complete",
};

// ─── Main component ─────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Step 1: Signup
  const moduleParam = searchParams.get("module") as TrialModule | null;
  const [selectedModule, setSelectedModule] = useState<TrialModule>(moduleParam || "intelligence");
  const [selectedTier, setSelectedTier] = useState<TrialTier>("solo");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2: Verify
  const [clinicAddress, setClinicAddress] = useState("");
  const [dpaAccepted, setDpaAccepted] = useState(false);
  const [commsConsent, setCommsConsent] = useState(false);

  // Step 3: Configure (Ava)
  const [clinicPhone, setClinicPhone] = useState("");
  const [iaPrice, setIaPrice] = useState("");
  const [fuPrice, setFuPrice] = useState("");
  // Step 3: Configure (Pulse)
  const [enabledSequences, setEnabledSequences] = useState<Set<string>>(
    new Set(PULSE_SEQUENCES.filter((s) => s.defaultOn).map((s) => s.id))
  );

  // Step 4: PMS
  const [selectedPms, setSelectedPms] = useState<PmsProvider | null>(null);
  const [pmsApiKey, setPmsApiKey] = useState("");

  // General
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [inviteClinicName, setInviteClinicName] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const clinicId = user?.clinicId;
  const isAuthenticated = !!user;

  // Guard: clinicians cannot run clinic onboarding — owner/admin only
  useEffect(() => {
    if (!authLoading && user && user.role === "clinician") {
      router.replace("/dashboard");
      return;
    }
    if (!authLoading && !clinicId) {
      router.replace("/dashboard?error=no_clinic");
    }
  }, [authLoading, clinicId, user, router]);

  // ── Determine visible steps ────────────────────────────────────────────────
  // Step 3 (configure) shows different content based on module, or is skipped
  // if Intelligence-only (defaults are sufficient)
  const needsConfigureStep = selectedModule !== "intelligence";
  const STEPS = needsConfigureStep
    ? ALL_STEPS
    : ALL_STEPS.filter((s) => s.id !== "configure");

  // If user is already authenticated (returning to onboarding), skip step 1
  useEffect(() => {
    if (!authLoading && isAuthenticated && currentStep === 0) {
      setCompletedSteps((p) => new Set([...p, 0]));
      setCurrentStep(1);
    }
  }, [authLoading, isAuthenticated, currentStep]);

  // ── Hydrate from Firestore if returning ────────────────────────────────────
  const hydrateFromFirestore = useCallback(async () => {
    if (!db || !clinicId) { setHydrated(true); return; }
    try {
      const clinicDoc = await getDoc(doc(db, "clinics", clinicId));
      if (!clinicDoc.exists()) { setHydrated(true); return; }
      const data = clinicDoc.data();
      if (data.pmsType) setSelectedPms(data.pmsType as PmsProvider);
      if (data.phone) setClinicPhone(data.phone);
      if (data.trialModule) setSelectedModule(data.trialModule as TrialModule);
      if (data.trialTier) setSelectedTier(data.trialTier as TrialTier);
      if (data.compliance?.dpaAcceptedAt) setDpaAccepted(true);
      if (data.compliance?.commsConsentAt) setCommsConsent(true);
      if (data.address) setClinicAddress(data.address);
    } catch {
      // Continue with defaults
    }
    setHydrated(true);
  }, [clinicId]);

  useEffect(() => { hydrateFromFirestore(); }, [hydrateFromFirestore]);

  // ── Step 1: Sign up ────────────────────────────────────────────────────────
  async function handleSignup() {
    setError(null);
    setErrorCode(null);
    setInviteClinicName(null);
    setSaving(true);

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
          country: "uk",
          trialModule: selectedModule,
          trialTier: selectedTier,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setErrorCode(data.code || null);
        if (data.clinicName) setInviteClinicName(data.clinicName);
        setSaving(false);
        return;
      }

      // Sign in client-side
      const auth = getFirebaseAuth();
      if (!auth) {
        setError("Firebase is not configured.");
        setSaving(false);
        return;
      }
      await signInWithEmailAndPassword(auth, email.trim(), password);

      // Mark step done, advance
      setCompletedSteps((p) => new Set([...p, 0]));
      setCurrentStep(1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
    setSaving(false);
  }

  // ── Persist step data to Firestore ─────────────────────────────────────────
  async function persistStep(stepId: StepId) {
    if (!db || !clinicId) return;
    setSaving(true);
    try {
      const clinicRef = doc(db, "clinics", clinicId);
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        updatedAt: now,
        "onboardingV2.stage": STEP_TO_STAGE[stepId],
        "onboardingV2.lastEventAt": now,
      };

      if (stepId === "verify") {
        if (clinicAddress.trim()) updates.address = clinicAddress.trim();
        if (dpaAccepted) updates["compliance.dpaAcceptedAt"] = now;
        if (commsConsent) updates["compliance.commsConsentAt"] = now;
      }
      if (stepId === "configure") {
        if (clinicPhone.trim()) {
          updates.phone = clinicPhone.trim();
          updates["ava.config.phone"] = clinicPhone.trim();
        }
        if (iaPrice.trim()) {
          updates.sessionPricePence = Math.round(parseFloat(iaPrice) * 100);
          updates["ava.config.ia_price"] = iaPrice.trim();
        }
        if (fuPrice.trim()) updates["ava.config.fu_price"] = fuPrice.trim();
        updates.enabledSequences = Array.from(enabledSequences);
      }
      if (stepId === "pms" && selectedPms) {
        updates.pmsType = selectedPms;
        const hasCredentials = selectedPms === "tm3" || pmsApiKey.trim().length > 0;
        updates["onboarding.pmsConnected"] = hasCredentials;
      }
      if (stepId === "golive") {
        updates["onboardingV2.activationAt"] = now;
        updates.status = "live";
      }

      await updateDoc(clinicRef, updates);
    } catch {
      // Non-blocking
    }
    setSaving(false);
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  async function handleNext() {
    const step = STEPS[currentStep];

    // Step 1 has its own handler
    if (step.id === "signup") {
      await handleSignup();
      return;
    }

    setCompletedSteps((prev) => new Set([...prev, currentStep]));
    await persistStep(step.id);

    if (currentStep === STEPS.length - 1) {
      try { await fetch("/api/clinic/check-go-live", { method: "POST" }); } catch { /* non-blocking */ }
      router.push("/dashboard");
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleBack() {
    setError(null);
    // Don't go back to signup if already authenticated
    if (currentStep === 1 && isAuthenticated) return;
    setCurrentStep((s) => Math.max(0, s - 1));
  }

  function toggleSequence(id: string) {
    setEnabledSequences((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  function canProceed(): boolean {
    switch (step.id) {
      case "signup":
        return fullName.trim().length >= 2 && email.includes("@") && password.length >= 8 && clinicName.trim().length >= 2;
      case "verify":
        return clinicAddress.trim().length >= 5 && dpaAccepted && commsConsent;
      case "configure":
        if (selectedModule === "ava" || selectedModule === "fullstack") return clinicPhone.length >= 10;
        return true;
      case "pms":
        return true; // Always skippable
      case "golive":
        return true;
    }
  }

  // ── Loading states ─────────────────────────────────────────────────────────
  if (authLoading && currentStep > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyMid} 60%, ${C.blue} 100%)` }}>
        <Loader2 size={24} className="animate-spin text-white/60" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyMid} 60%, ${C.blue} 100%)` }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5">
        <a href="https://strydeos.com" className="no-underline">
          <StrydeOSLogo size={34} fontSize={17} theme="dark" gap={10} />
        </a>
        {isAuthenticated && (
          <button onClick={() => router.push("/dashboard")} className="text-xs text-white/50 hover:text-white/80 transition-colors">
            Skip setup
          </button>
        )}
      </div>

      {/* Step progress */}
      <div className="px-6 pb-2">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const done = completedSteps.has(i);
              const active = currentStep === i;
              return (
                <div key={s.id} className="flex items-center gap-2 flex-1 last:flex-none">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold transition-all duration-300 ${
                    done ? "bg-success text-white" : active ? "bg-white text-navy" : "bg-white/10 text-white/40"
                  }`}>
                    {done ? <Check size={13} /> : i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 rounded-full transition-all duration-500 ${done ? "bg-success/60" : "bg-white/10"}`} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5 px-0.5">
            {STEPS.map((s, i) => (
              <p key={s.id} className={`text-[10px] font-medium transition-colors ${currentStep === i ? "text-white" : "text-white/30"}`}>
                {s.title}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-start justify-center px-6 py-8">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl bg-white overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.25)]"
            >
              {/* Card header */}
              <div className="px-8 pt-8 pb-6" style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyMid} 100%)` }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${step.color}25`, border: `1px solid ${step.color}40` }}>
                    <step.icon size={20} style={{ color: step.color }} />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-0.5">
                      Step {currentStep + 1} of {STEPS.length}
                    </div>
                    <h2 className="font-display text-[22px] text-white leading-tight">{step.title}</h2>
                  </div>
                </div>
                <p className="text-[14px] text-white/60 leading-relaxed">{step.subtitle}</p>
              </div>

              {/* Card body */}
              <div className="p-8 space-y-5">

                {/* ────────────── STEP 1: SIGNUP ────────────── */}
                {step.id === "signup" && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Full name</label>
                        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jamal Sherif"
                          className="w-full px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Clinic name</label>
                        <input type="text" value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="Spires Physiotherapy"
                          className="w-full px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Email</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jamal@spiresphysio.co.uk"
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Password</label>
                      <div className="relative">
                        <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters"
                          className="w-full px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30 pr-10" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-navy">
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Module (pre-selected from trial page, editable) */}
                    <div>
                      <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Module</label>
                      <div className="grid grid-cols-4 gap-2">
                        {(["intelligence", "ava", "pulse", "fullstack"] as TrialModule[]).map((mod) => {
                          const meta = MODULE_META[mod];
                          const active = selectedModule === mod;
                          return (
                            <button key={mod} onClick={() => setSelectedModule(mod)}
                              className={`p-3 rounded-xl border text-center transition-all ${active ? "border-blue bg-blue/5" : "border-border hover:border-blue/30"}`}>
                              <div className="text-sm font-semibold" style={{ color: active ? meta.color : "#6B7280" }}>{meta.name}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Tier */}
                    <div>
                      <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Practice size</label>
                      <div className="grid grid-cols-3 gap-2">
                        {TIER_OPTIONS.map((tier) => {
                          const active = selectedTier === tier.id;
                          return (
                            <button key={tier.id} onClick={() => setSelectedTier(tier.id)}
                              className={`p-3 rounded-xl border text-center transition-all ${active ? "border-blue bg-blue/5" : "border-border hover:border-blue/30"}`}>
                              <div className={`text-sm font-semibold ${active ? "text-navy" : "text-muted"}`}>{tier.label}</div>
                              <div className="text-[10px] text-muted">{tier.detail}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <p className="text-[11px] text-muted text-center">
                      14-day free trial. No card required. Cancel anytime.
                    </p>

                    {/* Existing account link */}
                    <div className="text-center">
                      <button onClick={() => router.push("/login")} className="text-xs text-blue hover:underline">
                        Already have an account? Sign in
                      </button>
                    </div>
                  </>
                )}

                {/* ────────────── STEP 2: VERIFY ────────────── */}
                {step.id === "verify" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Clinic address</label>
                      <input type="text" value={clinicAddress} onChange={(e) => setClinicAddress(e.target.value)}
                        placeholder="e.g. 10 Harley Street, London W1G 9PF"
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30" />
                    </div>

                    <div className="space-y-3 mt-4">
                      <div className="p-4 rounded-xl bg-cloud-light border border-border">
                        <h3 className="text-xs font-semibold text-navy uppercase tracking-widest mb-2">Data Processing Agreement</h3>
                        <p className="text-[13px] text-muted leading-relaxed mb-3">
                          StrydeOS processes patient appointment and clinical performance data on behalf of your clinic under GDPR Article 28.
                          Data is stored in europe-west2 (London). You retain full ownership. We act as data processor only.
                        </p>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-all ${dpaAccepted ? "bg-success" : "border-2 border-border"}`}
                            onClick={() => setDpaAccepted(!dpaAccepted)}>
                            {dpaAccepted && <Check size={11} className="text-white" />}
                          </div>
                          <span className="text-sm text-navy" onClick={() => setDpaAccepted(!dpaAccepted)}>
                            I accept the Data Processing Agreement on behalf of my clinic
                          </span>
                        </label>
                      </div>

                      <div className="p-4 rounded-xl bg-cloud-light border border-border">
                        <h3 className="text-xs font-semibold text-navy uppercase tracking-widest mb-2">Communications Consent</h3>
                        <p className="text-[13px] text-muted leading-relaxed mb-3">
                          StrydeOS may send SMS and email to your patients on your behalf (rebooking reminders, review prompts, HEP nudges).
                          You confirm that your clinic has appropriate consent frameworks in place for patient communications.
                        </p>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-all ${commsConsent ? "bg-success" : "border-2 border-border"}`}
                            onClick={() => setCommsConsent(!commsConsent)}>
                            {commsConsent && <Check size={11} className="text-white" />}
                          </div>
                          <span className="text-sm text-navy" onClick={() => setCommsConsent(!commsConsent)}>
                            I confirm my clinic has patient consent frameworks for automated communications
                          </span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {/* ────────────── STEP 3: CONFIGURE (conditional) ────────────── */}
                {step.id === "configure" && (
                  <>
                    {/* Ava config — shown for ava or fullstack */}
                    {(selectedModule === "ava" || selectedModule === "fullstack") && (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-blue/20 bg-blue/5 p-4">
                          <p className="text-sm font-semibold text-navy mb-0.5">Ava — AI voice receptionist</p>
                          <p className="text-[12px] text-muted leading-relaxed">
                            Handles inbound calls 24/7 — booking, rescheduling, cancellation recovery, and insurance flagging.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Clinic phone number</label>
                          <input type="tel" value={clinicPhone} onChange={(e) => setClinicPhone(e.target.value)} placeholder="020 7794 0202"
                            className="w-full px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Initial assessment price</label>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted">£</span>
                              <input type="number" value={iaPrice} onChange={(e) => setIaPrice(e.target.value)} placeholder="95"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Follow-up price</label>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted">£</span>
                              <input type="number" value={fuPrice} onChange={(e) => setFuPrice(e.target.value)} placeholder="75"
                                className="w-full px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Spacer between Ava and Pulse when fullstack */}
                    {selectedModule === "fullstack" && <hr className="border-border" />}

                    {/* Pulse config — shown for pulse or fullstack */}
                    {(selectedModule === "pulse" || selectedModule === "fullstack") && (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-teal/20 bg-teal/5 p-4">
                          <p className="text-sm font-semibold text-navy mb-0.5">Pulse — patient retention engine</p>
                          <p className="text-[12px] text-muted leading-relaxed">
                            Choose which automated sequences to enable. Each fires automatically based on PMS events.
                          </p>
                        </div>
                        {PULSE_SEQUENCES.map((seq) => {
                          const enabled = enabledSequences.has(seq.id);
                          return (
                            <button key={seq.id} onClick={() => toggleSequence(seq.id)}
                              className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                                enabled ? "border-success/30 bg-success/5" : "border-border hover:border-border/80"
                              }`}>
                              <div className={`w-5 h-5 rounded flex items-center justify-center mt-0.5 shrink-0 transition-all ${
                                enabled ? "bg-success" : "border-2 border-border"
                              }`}>
                                {enabled && <Check size={11} className="text-white" />}
                              </div>
                              <div>
                                <p className={`text-sm font-semibold ${enabled ? "text-navy" : "text-muted"}`}>{seq.label}</p>
                                <p className="text-[11px] text-muted">{seq.description}</p>
                              </div>
                            </button>
                          );
                        })}
                        <p className="text-[11px] text-muted">
                          {enabledSequences.size} of {PULSE_SEQUENCES.length} sequences enabled. You can change these anytime.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* ────────────── STEP 4: PMS ────────────── */}
                {step.id === "pms" && (
                  <>
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-navy mb-3">Select your PMS</p>
                      {PMS_OPTIONS.map((pms) => (
                        <button key={pms.id} onClick={() => setSelectedPms(pms.id)}
                          className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                            selectedPms === pms.id ? "border-blue bg-blue/5" : "border-border hover:border-blue/30"
                          }`}>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                            selectedPms === pms.id ? "border-blue bg-blue" : "border-border"
                          }`}>
                            {selectedPms === pms.id && <Check size={11} className="text-white" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-navy">{pms.label}</span>
                              {pms.badge && (
                                <span className={`text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                  pms.badge === "Recommended" ? "bg-blue/10 text-blue" : "bg-warn/10 text-warn"
                                }`}>{pms.badge}</span>
                              )}
                            </div>
                            <p className="text-[12px] text-muted">{pms.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {selectedPms && selectedPms !== "tm3" && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.2 }}>
                        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                          {PMS_OPTIONS.find((p) => p.id === selectedPms)?.label} API Key
                        </label>
                        <input type="password" value={pmsApiKey} onChange={(e) => setPmsApiKey(e.target.value)}
                          placeholder="Paste your API key here"
                          className="w-full px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30" />
                        <p className="text-[11px] text-muted mt-1.5">
                          Found in your {PMS_OPTIONS.find((p) => p.id === selectedPms)?.label} account under Settings → Integrations → API.
                        </p>
                      </motion.div>
                    )}

                    <div className="flex items-start gap-2 p-3 rounded-lg bg-cloud-light border border-border">
                      <HelpCircle size={14} className="text-muted mt-0.5 shrink-0" />
                      <div className="text-[11px] text-muted">
                        <p className="font-semibold text-blue">Don&apos;t have this to hand? No problem.</p>
                        <p>You can connect your PMS later from Settings, or start with a CSV upload instead.</p>
                      </div>
                    </div>
                  </>
                )}

                {/* ────────────── STEP 5: GO LIVE ────────────── */}
                {step.id === "golive" && (
                  <>
                    <div className="space-y-3">
                      {[
                        { title: `Module: ${MODULE_META[selectedModule].name}`, status: "ready" as const, color: MODULE_META[selectedModule].color },
                        { title: `Tier: ${TIER_OPTIONS.find((t) => t.id === selectedTier)?.label ?? selectedTier}`, status: "ready" as const, color: C.blue },
                        { title: `PMS: ${selectedPms ? PMS_OPTIONS.find((p) => p.id === selectedPms)?.label ?? selectedPms : "Not connected yet"}`, status: selectedPms ? "ready" as const : "skipped" as const, color: C.blue },
                        ...(selectedModule === "ava" || selectedModule === "fullstack" ? [{ title: `Ava: ${clinicPhone || "Phone not set"}`, status: (clinicPhone ? "ready" : "skipped") as "ready" | "skipped", color: C.blue }] : []),
                        ...(selectedModule === "pulse" || selectedModule === "fullstack" ? [{ title: `Pulse: ${enabledSequences.size} sequences enabled`, status: "ready" as const, color: C.teal }] : []),
                      ].map((item) => (
                        <div key={item.title} className={`flex items-center gap-3 p-4 rounded-xl border ${
                          item.status === "ready" ? "border-success/20 bg-success/5" : "border-warn/20 bg-warn/5"
                        }`}>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${item.color}15` }}>
                            <CheckCircle2 size={16} style={{ color: item.color }} />
                          </div>
                          <p className="flex-1 text-sm font-medium text-navy">{item.title}</p>
                          {item.status === "ready" ? (
                            <CheckCircle2 size={16} className="text-success shrink-0" />
                          ) : (
                            <span className="text-[10px] font-semibold text-warn uppercase tracking-wide">Skipped</span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-blue/20 bg-blue/5 p-5">
                      <p className="text-sm font-semibold text-navy mb-2">What happens next</p>
                      <div className="space-y-2">
                        {[
                          "Your dashboard will populate with real data as it flows in",
                          selectedPms ? "We'll run your first PMS sync within minutes" : "Connect your PMS from Settings to start syncing data",
                          "Your 14-day trial starts now — full access, no restrictions",
                        ].map((item, i) => (
                          <div key={i} className="flex items-start gap-2 text-[12px] text-muted">
                            <ChevronRight size={13} className="text-blue mt-0.5 shrink-0" />
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Error display */}
                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-xl bg-red-50 border border-red-200">
                    <p className="text-sm text-red-700 mb-1">{error}</p>
                    {errorCode === "ALREADY_INVITED" && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-red-600">
                          Your clinic admin ({inviteClinicName}) has already set up an account. Check your email for the invite, or ask them to resend it from Settings → Team.
                        </p>
                        <button onClick={() => router.push("/login")} className="text-xs font-semibold text-blue hover:underline">
                          Sign in instead →
                        </button>
                      </div>
                    )}
                    {errorCode === "EMAIL_EXISTS" && (
                      <button onClick={() => router.push("/login")} className="mt-1 text-xs font-semibold text-blue hover:underline">
                        Sign in instead →
                      </button>
                    )}
                  </motion.div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between pt-2">
                  <button onClick={handleBack}
                    disabled={currentStep === 0 || (currentStep === 1 && isAuthenticated)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-muted hover:text-navy transition-colors disabled:opacity-0 disabled:pointer-events-none">
                    <ArrowLeft size={14} /> Back
                  </button>

                  <button onClick={handleNext}
                    disabled={saving || !canProceed()}
                    className={`btn-primary ${step.color === "#0891B2" ? "btn-primary-teal" : step.color === "#8B5CF6" ? "btn-primary-purple" : step.color === "#059669" ? "btn-primary-success" : ""}`}>
                    {saving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : step.id === "signup" ? (
                      <>Create account <ArrowRight size={14} /></>
                    ) : isLast ? (
                      <><Zap size={14} /> Launch StrydeOS</>
                    ) : step.id === "pms" && !selectedPms ? (
                      <>Skip for now <ArrowRight size={14} /></>
                    ) : (
                      <>Continue <ArrowRight size={14} /></>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
