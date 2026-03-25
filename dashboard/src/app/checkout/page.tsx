"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2,
  ArrowRight,
  Check,
  CreditCard,
  AlertCircle,
  Sparkles,
  BarChart3,
  Phone,
  RefreshCw,
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
// Helpers
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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
  { name: string; icon: typeof BarChart3; color: string; description: string; features: string[] }
> = {
  intelligence: {
    name: "Intelligence",
    icon: BarChart3,
    color: "#8B5CF6",
    description:
      "Clinical performance dashboard — 8 validated KPIs, revenue analytics, outcome measures, DNA analysis, and reputation tracking.",
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
    icon: Phone,
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
    icon: RefreshCw,
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
    icon: Sparkles,
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
  const parsed = useMemo(() => parsePlan(planParam), [planParam]);

  const [interval, setInterval] = useState<BillingInterval>("month");
  const [includeAvaSetup, setIncludeAvaSetup] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

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
          cancelPath: `/checkout?plan=${planParam}&billing=now`,
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
  const Icon = meta.icon;
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
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    background: hexToRgba(meta.color, 0.15),
                    border: `1px solid ${hexToRgba(meta.color, 0.25)}`,
                  }}
                >
                  <Icon size={20} style={{ color: meta.color }} />
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
                    onClick={() => setInterval("month")}
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
                    onClick={() => setInterval("year")}
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
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setIncludeAvaSetup(!includeAvaSetup)}
                        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all ${
                          includeAvaSetup
                            ? "bg-blue"
                            : "border-2 border-border"
                        }`}
                      >
                        {includeAvaSetup && (
                          <Check size={11} className="text-white" />
                        )}
                      </button>
                      <div>
                        <div className="text-sm font-semibold text-navy">
                          Ava setup
                        </div>
                        <div className="text-[11px] text-muted">
                          One-time configuration fee
                        </div>
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
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: meta.color }}
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

              {/* Security note */}
              <div className="flex items-center justify-center gap-2 text-[11px] text-muted">
                <span>Powered by</span>
                <svg
                  viewBox="0 0 120 50"
                  className="h-[16px] w-auto"
                  fill="#6772E5"
                  fillRule="evenodd"
                  aria-label="Stripe"
                >
                  <path d="M101.547 30.94c0-5.885-2.85-10.53-8.3-10.53-5.47 0-8.782 4.644-8.782 10.483 0 6.92 3.908 10.414 9.517 10.414 2.736 0 4.805-.62 6.368-1.494v-4.598c-1.563.782-3.356 1.264-5.632 1.264-2.23 0-4.207-.782-4.46-3.494h11.24c0-.3.046-1.494.046-2.046zM90.2 28.757c0-2.598 1.586-3.678 3.035-3.678 1.402 0 2.897 1.08 2.897 3.678zm-14.597-8.345c-2.253 0-3.7 1.057-4.506 1.793l-.3-1.425H65.73v26.805l5.747-1.218.023-6.506c.828.598 2.046 1.448 4.07 1.448 4.115 0 7.862-3.3 7.862-10.598-.023-6.667-3.816-10.3-7.84-10.3zm-1.38 15.84c-1.356 0-2.16-.483-2.713-1.08l-.023-8.53c.598-.667 1.425-1.126 2.736-1.126 2.092 0 3.54 2.345 3.54 5.356 0 3.08-1.425 5.38-3.54 5.38zm-16.4-17.196l5.77-1.24V13.15l-5.77 1.218zm0 1.747h5.77v20.115h-5.77zm-6.185 1.7l-.368-1.7h-4.966V40.92h5.747V27.286c1.356-1.77 3.655-1.448 4.368-1.195v-5.287c-.736-.276-3.425-.782-4.782 1.7zm-11.494-6.7L34.535 17l-.023 18.414c0 3.402 2.552 5.908 5.954 5.908 1.885 0 3.264-.345 4.023-.76v-4.667c-.736.3-4.368 1.356-4.368-2.046V25.7h4.368v-4.897h-4.37zm-15.54 10.828c0-.897.736-1.24 1.954-1.24a12.85 12.85 0 0 1 5.7 1.47V21.47c-1.908-.76-3.793-1.057-5.7-1.057-4.667 0-7.77 2.437-7.77 6.506 0 6.345 8.736 5.333 8.736 8.07 0 1.057-.92 1.402-2.207 1.402-1.908 0-4.345-.782-6.276-1.84v5.47c2.138.92 4.3 1.3 6.276 1.3 4.782 0 8.07-2.368 8.07-6.483-.023-6.85-8.782-5.632-8.782-8.207z" />
                </svg>
                <span>· Cancel anytime</span>
              </div>
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
