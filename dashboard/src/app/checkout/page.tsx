"use client";

import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2,
  ArrowRight,
  Check,
  CreditCard,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { StrydeOSLogo } from "@/components/MonolithLogo";
import {
  MODULE_PRICING,
  TIER_LABELS,
  AVA_SETUP_FEE_PENCE,
  formatGBP,
  MODULE_KEYS,
  type ProductKey,
  type TierKey,
  type BillingInterval,
} from "@/lib/billing";

// ---------------------------------------------------------------------------
// Module icon — mini Monolith mark in module colour
// Canonical gradient stops matching monolith.svg / monolith-pulse.svg / monolith-intelligence.svg
// ---------------------------------------------------------------------------

const MONOLITH_PALETTES: Record<string, { contFrom: string; contTo: string; radFrom: string; radTo: string; bdrFrom: string; bdrTo: string }> = {
  "#1C54F2": { contFrom: "#2E6BFF", contTo: "#091D3E", radFrom: "#6AABFF", radTo: "#1C54F2", bdrFrom: "#7ABBFF", bdrTo: "#1C54F2" },
  "#0891B2": { contFrom: "#0CC0E0", contTo: "#053B47", radFrom: "#22D3EE", radTo: "#0891B2", bdrFrom: "#34D9F0", bdrTo: "#0891B2" },
  "#8B5CF6": { contFrom: "#9B4DFF", contTo: "#1A0A3E", radFrom: "#C084FC", radTo: "#7C3AED", bdrFrom: "#C49CFF", bdrTo: "#7C3AED" },
};

function ModuleIcon({ color, size = 20 }: { color: string; size?: number }) {
  const p = MONOLITH_PALETTES[color] || MONOLITH_PALETTES["#1C54F2"];
  const id = `mi-${color.replace("#", "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img">
      <defs>
        <linearGradient id={`${id}-c`} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={p.contFrom} stopOpacity="0.58" />
          <stop offset="100%" stopColor={p.contTo} stopOpacity="0.72" />
        </linearGradient>
        <radialGradient id={`${id}-r`} cx="28%" cy="24%" r="60%">
          <stop offset="0%" stopColor={p.radFrom} stopOpacity="0.42" />
          <stop offset="100%" stopColor={p.radTo} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-t`} x1="0.05" y1="1" x2="0.35" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0.97" />
        </linearGradient>
        <linearGradient id={`${id}-m`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="28%" stopColor="white" stopOpacity="0.60" />
          <stop offset="65%" stopColor="white" stopOpacity="0.12" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0.1" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={p.bdrFrom} stopOpacity="0.65" />
          <stop offset="100%" stopColor={p.bdrTo} stopOpacity="0.06" />
        </linearGradient>
        <clipPath id={`${id}-p`}><rect x="35" y="20" width="22" height="60" rx="5" /></clipPath>
        <clipPath id={`${id}-a`}><polygon points="35,52 57,40 57,20 35,20" /></clipPath>
      </defs>
      <rect width="100" height="100" rx="24" fill={`url(#${id}-c)`} />
      <rect width="100" height="100" rx="24" fill={`url(#${id}-r)`} />
      <rect width="100" height="100" rx="24" fill="none" stroke={`url(#${id}-b)`} strokeWidth="1.2" />
      {size > 24 && (
        <path d="M 17 21 Q 50 12 83 21" stroke={`url(#${id}-m)`} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      )}
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07" />
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10" />
      <g clipPath={`url(#${id}-p)`}>
        <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <rect x="35" y="20" width="22" height="60" rx="5" fill={`url(#${id}-t)`} clipPath={`url(#${id}-a)`} />
      <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Checkout footer — payment icons, Stripe badge, legal links
// ---------------------------------------------------------------------------

function StripeLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 468 222.5" className={className} fill="#635BFF" aria-label="Stripe">
      <path fillRule="evenodd" clipRule="evenodd" d="M414 113.4c0-25.6-12.4-45.8-36.1-45.8-23.8 0-38.2 20.2-38.2 45.6 0 30.1 17 45.3 41.4 45.3 11.9 0 20.9-2.7 27.7-6.5v-20c-6.8 3.4-14.6 5.5-24.5 5.5-9.7 0-18.3-3.4-19.4-15.2h48.9c0-1.3.2-6.5.2-8.9zm-49.4-9.5c0-11.3 6.9-16 13.2-16 6.1 0 12.6 4.7 12.6 16h-25.8zM301.1 67.6c-9.8 0-16.1 4.6-19.6 7.8l-1.3-6.2h-22v116.6l25-5.3.1-28.3c3.6 2.6 8.9 6.3 17.7 6.3 17.9 0 34.2-14.4 34.2-46.1-.1-29-16.6-44.8-34.1-44.8zm-6 68.9c-5.9 0-9.4-2.1-11.8-4.7l-.1-37.1c2.6-2.9 6.2-4.9 11.9-4.9 9.1 0 15.4 10.2 15.4 23.3 0 13.4-6.2 23.4-15.4 23.4zM223.8 61.7l25.1-5.4V36l-25.1 5.3zM223.8 69.3h25.1v87.5h-25.1zM196.9 76.7l-1.6-7.4h-21.6v87.5h25V97.5c5.9-7.7 15.9-6.3 19-5.2v-23c-3.2-1.2-14.9-3.4-20.8 7.4zM146.9 47.6l-24.4 5.2-.1 80.1c0 14.8 11.1 25.7 25.9 25.7 8.2 0 14.2-1.5 17.5-3.3V135c-3.2 1.3-19 5.9-19-8.9V90.6h19V69.3h-19l.1-21.7zM79.3 94.7c0-3.9 3.2-5.4 8.5-5.4 7.6 0 17.2 2.3 24.8 6.4V72.2c-8.3-3.3-16.5-4.6-24.8-4.6C68.7 67.6 55 78.2 55 95.2c0 26.3 36.3 22.1 36.3 33.4 0 4.6-4 6.1-9.6 6.1-8.3 0-18.9-3.4-27.3-8v23.8c9.3 4 18.7 5.7 27.3 5.7 19.8 0 33.4-9.8 33.4-26.8 0-28.5-36.8-23.3-36.8-34.7z" />
    </svg>
  );
}

function CardIcon({ brand }: { brand: "visa" | "mastercard" | "amex" }) {
  const w = 32;
  const h = 20;
  if (brand === "visa") {
    return (
      <svg width={w} height={h} viewBox="0 0 32 20" fill="none" aria-label="Visa">
        <rect width="32" height="20" rx="3" fill="#1A1F71" />
        <path d="M13.6 13.5l1.7-8.2h2l-1.7 8.2h-2zm8.5-8c-.4-.2-1-.3-1.8-.3-2 0-3.4 1-3.4 2.5 0 1.1 1 1.7 1.8 2 .8.4 1 .7 1 1 0 .5-.6.8-1.2.8-.8 0-1.2-.1-1.9-.4l-.3-.1-.3 1.6c.5.2 1.3.4 2.2.4 2.1 0 3.5-1 3.5-2.6 0-.9-.5-1.5-1.7-2.1-.7-.3-1.1-.6-1.1-1 0-.3.4-.7 1.1-.7.7 0 1.1.1 1.5.3l.2.1.4-1.5zm5.1 0h-1.5c-.5 0-.8.1-1 .6l-2.9 6.4h2.1l.4-1.1h2.5l.2 1.1h1.8L27.2 5.5zm-2.4 5.3l1-2.8.3.9.2.7.3 1.2h-1.8zM12 5.5l-1.9 5.6-.2-1-.7-3.2c-.1-.5-.5-.6-1-.6H5.5l-.1.2c.7.2 1.5.5 2 .8l1.7 6h2.1l3.2-7.8H12z" fill="white" />
      </svg>
    );
  }
  if (brand === "mastercard") {
    return (
      <svg width={w} height={h} viewBox="0 0 32 20" fill="none" aria-label="Mastercard">
        <rect width="32" height="20" rx="3" fill="#252525" />
        <circle cx="12.5" cy="10" r="5.5" fill="#EB001B" />
        <circle cx="19.5" cy="10" r="5.5" fill="#F79E1B" />
        <path d="M16 5.8a5.5 5.5 0 0 1 0 8.4 5.5 5.5 0 0 1 0-8.4z" fill="#FF5F00" />
      </svg>
    );
  }
  // amex
  return (
    <svg width={w} height={h} viewBox="0 0 32 20" fill="none" aria-label="American Express">
      <rect width="32" height="20" rx="3" fill="#006FCF" />
      <text x="16" y="12.5" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold" fontFamily="sans-serif">AMEX</text>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CheckoutFooter() {
  return (
    <div className="mt-6 pt-5 border-t border-border/50 space-y-4">
      {/* Payment methods + Stripe badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CardIcon brand="visa" />
          <CardIcon brand="mastercard" />
          <CardIcon brand="amex" />
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <span>Powered by</span>
          <StripeLogo className="h-[13px] w-auto" />
        </div>
      </div>

      {/* Security + legal */}
      <div className="flex items-center justify-between text-[10px] text-muted">
        <div className="flex items-center gap-1">
          <LockIcon />
          <span>256-bit SSL encrypted</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/terms" className="hover:text-navy transition-colors">Terms</a>
          <a href="/privacy" className="hover:text-navy transition-colors">Privacy</a>
          <span>Cancel anytime</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function parsePlan(raw: string | null): { product: ProductKey; tier: TierKey } | null {
  if (!raw) return null;
  const parts = raw.split("-");
  if (parts.length < 2) return null;

  const tier = parts[parts.length - 1] as TierKey;
  const product = parts.slice(0, -1).join("-") as ProductKey;

  const validProducts: readonly string[] = [...MODULE_KEYS, "fullstack"];
  const validTiers: readonly string[] = ["solo", "studio", "clinic"];
  if (!validProducts.includes(product) || !validTiers.includes(tier)) return null;
  return { product, tier };
}

const MODULE_META: Record<
  ProductKey,
  { name: string; color: string; description: string; features: string[] }
> = {
  intelligence: {
    name: "Intelligence",
    color: "#8B5CF6",
    description:
      "Clinical performance dashboard — 6 validated KPIs, revenue analytics, outcome measures, DNA analysis, and reputation tracking.",
    features: [
      "Per-clinician KPI dashboard",
      "90-day rolling trends & alerts",
      "NPS & Google Review pipeline",
      "HEP compliance monitoring",
      "Weekly email digest",
      "PMS integration (read)",
    ],
  },
  ava: {
    name: "Ava",
    color: "#1C54F2",
    description:
      "AI voice receptionist powered by ElevenLabs. Handles inbound calls 24/7, books appointments, and logs all interactions.",
    features: [
      "24/7 AI inbound call handling",
      "Direct calendar booking",
      "No-show & cancellation recovery",
      "SMS confirmations (500/mo)",
      "PMS write-back",
      "Emergency routing",
    ],
  },
  pulse: {
    name: "Pulse",
    color: "#0891B2",
    description:
      "Patient retention engine. Automated rebooking sequences, HEP reminders, churn risk detection, and comms log.",
    features: [
      "Post-session follow-up sequences",
      "Dropout prevention triggers",
      "Outcome tracking per patient",
      "Post-discharge check-ins",
      "Referral prompt sequences",
      "PMS integration (read)",
    ],
  },
  fullstack: {
    name: "Full Stack",
    color: "#1C54F2",
    description:
      "Intelligence + Ava + Pulse — the complete clinical performance platform. Everything StrydeOS offers, in one plan.",
    features: [
      "Intelligence dashboard & KPIs",
      "Ava AI voice receptionist",
      "Pulse retention engine",
      "All PMS integrations + write-back",
      "Priority support",
      "All future modules included",
    ],
  },
};

// ---------------------------------------------------------------------------
// Inner component (needs Suspense boundary for useSearchParams)
// ---------------------------------------------------------------------------

function CheckoutInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, firebaseUser, loading: authLoading } = useAuth();

  const planParam = searchParams.get("plan");
  const billingNow = searchParams.get("billing") === "now";
  const intervalParam = searchParams.get("interval");
  const parsed = useMemo(() => parsePlan(planParam), [planParam]);

  const [interval, setBillingInterval] = useState<BillingInterval>(
    intervalParam === "year" ? "year" : "month"
  );
  const includeAvaSetup = true;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Guard: clinicians cannot access checkout — owner/admin only
  useEffect(() => {
    if (!authLoading && user && user.role === "clinician") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  // ------ Redirect logic (runs once auth settles) ------

  // Trial flow (no billing=now): just go to signup/onboarding
  const shouldRedirectTrial = !authLoading && !billingNow && parsed;
  const shouldRedirectLogin = !authLoading && !user && billingNow && parsed;

  // We use useMemo to compute the redirect URL once rather than useEffect races
  const redirectTarget = useMemo(() => {
    if (!parsed) return null;

    if (shouldRedirectTrial) {
      if (user) return "/onboarding";
      return `/login?mode=signup&next=${encodeURIComponent("/onboarding")}`;
    }

    if (shouldRedirectLogin) {
      return `/login?mode=signup&next=${encodeURIComponent(`/checkout?plan=${planParam}&billing=now`)}`;
    }

    return null;
  }, [shouldRedirectTrial, shouldRedirectLogin, user, parsed, planParam]);

  // Perform redirect
  if (redirectTarget && !redirecting) {
    // Use a microtask to avoid calling router during render
    Promise.resolve().then(() => router.replace(redirectTarget));
    // We set a local flag so the loading spinner keeps showing
    if (!redirecting) setRedirecting(true);
  }

  // ------ Stripe checkout ------

  const handleCheckout = useCallback(async () => {
    if (!parsed || !firebaseUser) return;
    setError(null);
    setSubmitting(true);

    try {
      const token = await firebaseUser.getIdToken();
      const modules =
        parsed.product === "fullstack" ? ["fullstack"] : [parsed.product];
      const needsAvaSetup =
        includeAvaSetup &&
        (parsed.product === "ava" || parsed.product === "fullstack");

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          modules,
          tier: parsed.tier,
          interval,
          includeAvaSetup: needsAvaSetup,
          successPath: "/checkout/success",
          cancelPath: `/checkout?plan=${planParam}&billing=now&interval=${interval}`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create checkout session.");
        setSubmitting(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("No checkout URL returned.");
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }, [parsed, firebaseUser, includeAvaSetup, interval, planParam]);

  // ------ Loading / redirect states ------

  if (authLoading || redirecting || redirectTarget) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)",
        }}
      >
        <Loader2 size={24} className="animate-spin text-white/60" />
      </div>
    );
  }

  // ------ Invalid plan ------

  if (!parsed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)",
        }}
      >
        <div className="text-center max-w-md px-6">
          <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-white/60" />
          </div>
          <h1 className="font-display text-2xl text-white mb-2">
            Plan not recognised
          </h1>
          <p className="text-sm text-white/60 mb-6">
            The plan in the URL isn&apos;t valid. Head back to the website to
            choose a plan.
          </p>
          <a
            href="https://strydeos.com/#pricing"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-blue hover:opacity-90 transition-opacity"
          >
            <ArrowLeft size={14} />
            Back to pricing
          </a>
        </div>
      </div>
    );
  }

  // ------ Not authenticated (shouldn't reach here, but safety net) ------

  if (!user || !firebaseUser) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)",
        }}
      >
        <Loader2 size={24} className="animate-spin text-white/60" />
      </div>
    );
  }

  // ------ Main checkout UI ------

  const meta = MODULE_META[parsed.product];
  const tierLabel = TIER_LABELS[parsed.tier];
  const price = MODULE_PRICING[parsed.product][parsed.tier][interval];
  const showAvaSetup =
    parsed.product === "ava" || parsed.product === "fullstack";
  const monthlyTotal = MODULE_PRICING[parsed.product][parsed.tier].month;
  const yearlyTotal = MODULE_PRICING[parsed.product][parsed.tier].year;
  const yearlySaving = monthlyTotal * 12 - yearlyTotal;
  const setupFee =
    showAvaSetup && includeAvaSetup ? AVA_SETUP_FEE_PENCE : 0;
  const totalToday = price + setupFee;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background:
          "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)",
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5">
        <a href="https://strydeos.com" className="flex items-center gap-2.5">
          <StrydeOSLogo size={34} fontSize={17} theme="dark" gap={10} />
        </a>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          Go to dashboard
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-6 py-4 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-lg"
        >
          <div className="rounded-2xl bg-white overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.25)]">
            {/* Card header — navy gradient */}
            <div
              className="px-8 pt-8 pb-6"
              style={{
                background:
                  "linear-gradient(135deg, #0B2545 0%, #132D5E 100%)",
              }}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 shrink-0">
                  <ModuleIcon color={meta.color} size={64} />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-0.5">
                    {tierLabel.label} · {tierLabel.detail}
                  </div>
                  <h1 className="font-display text-[24px] text-white leading-tight">
                    {meta.name}
                  </h1>
                </div>
              </div>
              <p className="text-[13px] text-white/60 leading-relaxed">
                {meta.description}
              </p>
            </div>

            {/* Card body */}
            <div className="p-8 space-y-6">
              {/* Billing interval toggle */}
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
                  Billing period
                </label>
                <div className="flex rounded-xl bg-cloud-light p-1">
                  <button
                    type="button"
                    onClick={() => setBillingInterval("month")}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      interval === "month"
                        ? "bg-white text-navy shadow-sm"
                        : "text-navy/50 hover:text-navy"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingInterval("year")}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      interval === "year"
                        ? "bg-white text-navy shadow-sm"
                        : "text-navy/50 hover:text-navy"
                    }`}
                  >
                    Annual
                    <span className="ml-1.5 text-[10px] font-bold text-success">
                      SAVE 20%
                    </span>
                  </button>
                </div>
              </div>

              {/* Price breakdown */}
              <div className="space-y-0">
                {/* Subscription line */}
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <div>
                    <div className="text-sm font-semibold text-navy">
                      {meta.name}
                    </div>
                    <div className="text-[11px] text-muted">
                      {tierLabel.label} ·{" "}
                      {interval === "month" ? "Monthly" : "Annual"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-navy">
                      {formatGBP(price)}
                    </div>
                    <div className="text-[11px] text-muted">
                      {interval === "month" ? "/mo" : "/yr"}
                    </div>
                  </div>
                </div>

                {/* Ava setup fee */}
                {showAvaSetup && (
                  <div className="flex items-center justify-between py-3 border-b border-border">
                    <div>
                      <div className="text-sm font-semibold text-navy">
                        Ava setup
                      </div>
                      <div className="text-[11px] text-muted">
                        One-time configuration fee
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-navy">
                      {formatGBP(AVA_SETUP_FEE_PENCE)}
                    </div>
                  </div>
                )}

                {/* Total */}
                <div className="flex items-center justify-between pt-4">
                  <div className="text-sm font-semibold text-navy">
                    Total due today
                  </div>
                  <div className="text-xl font-bold text-navy">
                    {formatGBP(totalToday)}
                  </div>
                </div>

                {interval === "year" && (
                  <div className="text-[11px] text-success font-medium text-right mt-1">
                    Saving {formatGBP(yearlySaving)} vs monthly billing
                  </div>
                )}
              </div>

              {/* Features included */}
              <div className="rounded-xl border border-border bg-cloud-light p-4">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">
                  Includes
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {meta.features.map((f) => (
                    <div
                      key={f}
                      className="flex items-center gap-2 text-[12px] text-navy"
                    >
                      <Check size={12} className="text-success shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Error */}
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
                      <AlertCircle
                        size={14}
                        className="text-danger mt-0.5 shrink-0"
                      />
                      <p className="text-[13px] text-danger">{error}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CTA */}
              <motion.button
                type="button"
                onClick={handleCheckout}
                disabled={submitting}
                className={`btn-primary w-full justify-center py-3.5 ${meta.color === "#0891B2" ? "btn-primary-teal" : meta.color === "#8B5CF6" ? "btn-primary-purple" : ""}`}
                whileTap={{ scale: 0.97 }}
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    <CreditCard size={15} />
                    Continue to payment
                  </>
                )}
              </motion.button>

              <CheckoutFooter />
            </div>
          </div>

          {/* Back link */}
          <div className="text-center mt-6">
            <a
              href="https://strydeos.com/#pricing"
              className="inline-flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition-colors"
            >
              <ArrowLeft size={12} />
              Back to pricing
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper with Suspense (required for useSearchParams)
// ---------------------------------------------------------------------------

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{
            background:
              "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)",
          }}
        >
          <Loader2 size={24} className="animate-spin text-white/60" />
        </div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
