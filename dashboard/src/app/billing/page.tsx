"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Lock,
  Loader2,
  CreditCard,
  ExternalLink,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import {
  MODULE_DISPLAY,
  MODULE_KEYS,
  TIER_DISPLAY,
  TIER_KEYS,
  MONTHLY_PRICES,
  ANNUAL_DISCOUNT,
  annualMonthlyEquivalent,
  getTrialEndsAt,
  type ModuleKey,
  type TierKey,
  type PeriodKey,
} from "@/lib/billing";
import type { StripeSubscriptionStatus } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getIdToken(firebaseUser: { getIdToken: () => Promise<string> } | null): Promise<string | null> {
  if (!firebaseUser) return null;
  try { return await firebaseUser.getIdToken(); } catch { return null; }
}

function subscriptionStatusLabel(status: StripeSubscriptionStatus | null | undefined): { label: string; color: string } {
  switch (status) {
    case "active":   return { label: "Active",          color: "#059669" };
    case "trialing": return { label: "Trial",           color: "#0891B2" };
    case "past_due": return { label: "Payment overdue", color: "#F59E0B" };
    case "canceled": return { label: "Canceled",        color: "#EF4444" };
    case "paused":   return { label: "Paused",          color: "#6B7280" };
    default:         return { label: "Inactive",        color: "#6B7280" };
  }
}

// ─── Module card ──────────────────────────────────────────────────────────────

interface ModuleCardProps {
  moduleKey: ModuleKey;
  isActive: boolean;
  isLoading: boolean;
  tier: TierKey;
  period: PeriodKey;
  onActivate: (module: ModuleKey) => void;
}

function ModuleCard({ moduleKey, isActive, isLoading, tier, period, onActivate }: ModuleCardProps) {
  const { name, description, color } = MODULE_DISPLAY[moduleKey];
  const monthlyPrice = MONTHLY_PRICES[moduleKey][tier];
  const displayPrice = period === "annual"
    ? annualMonthlyEquivalent(monthlyPrice)
    : monthlyPrice;
  const hasSetupFee = moduleKey === "ava";

  return (
    <div
      className="relative rounded-2xl p-6 flex flex-col gap-4 transition-all duration-200"
      style={{
        background: isActive ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
        border: isActive ? `1px solid ${color}40` : "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}80` }} />
        <h3 className="text-[15px] font-semibold text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
          {name}
        </h3>
        {isActive ? (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
            <Check size={10} strokeWidth={2.5} /> Active
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-white/30 uppercase tracking-wider">
            <Lock size={10} /> Locked
          </span>
        )}
      </div>

      <p className="text-[13px] text-white/55 leading-relaxed">{description}</p>

      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-[11px] text-white/35 font-medium">£</span>
          <span className="text-[28px] font-semibold text-white leading-none" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {displayPrice}
          </span>
          <span className="text-[12px] text-white/35">/mo</span>
          {period === "annual" && (
            <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(5,150,105,0.15)", color: "#34D399" }}>
              −20%
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/25 mt-1">
          {period === "annual" ? "billed annually" : "billed monthly"}
          {hasSetupFee && " · £250 one-time setup"}
        </p>
      </div>

      {!isActive && (
        <button
          onClick={() => onActivate(moduleKey)}
          disabled={isLoading}
          className="mt-auto flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all duration-150 hover:opacity-90 disabled:opacity-50"
          style={{ background: color }}
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <>Add {name}</>}
        </button>
      )}
    </div>
  );
}

// ─── Full Stack banner ────────────────────────────────────────────────────────

interface FullStackBannerProps {
  tier: TierKey;
  period: PeriodKey;
  isLoading: boolean;
  allActive: boolean;
  onActivate: () => void;
}

function FullStackBanner({ tier, period, isLoading, allActive, onActivate }: FullStackBannerProps) {
  const monthlyPrice = MONTHLY_PRICES.fullstack[tier];
  const individualTotal = MONTHLY_PRICES.intelligence[tier] + MONTHLY_PRICES.pulse[tier] + MONTHLY_PRICES.ava[tier];
  const saving = individualTotal - monthlyPrice;

  const displayPrice = period === "annual"
    ? annualMonthlyEquivalent(monthlyPrice)
    : monthlyPrice;
  const displayIndividual = period === "annual"
    ? annualMonthlyEquivalent(individualTotal)
    : individualTotal;
  const displaySaving = displayIndividual - displayPrice;

  if (allActive) return null;

  return (
    <div
      className="mb-6 relative overflow-hidden rounded-2xl p-6"
      style={{
        background: "linear-gradient(135deg, rgba(28,84,242,0.08) 0%, rgba(139,92,246,0.06) 50%, rgba(8,145,178,0.06) 100%)",
        border: "1px solid rgba(75,139,245,0.20)",
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "linear-gradient(90deg, #8B5CF6, #1C54F2, #0891B2)" }} />

      <div className="flex items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">★ Best value</span>
          </div>
          <h3 className="text-[18px] text-white mb-1" style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400 }}>
            StrydeOS Full Stack
          </h3>
          <p className="text-[13px] text-white/40 mb-3">Intelligence + Pulse + Ava in one subscription.</p>
          <div className="flex items-center gap-4">
            {(["intelligence", "pulse", "ava"] as ModuleKey[]).map((m) => (
              <div key={m} className="flex items-center gap-1.5 text-[12px] font-medium text-white/50">
                <div className="w-2 h-2 rounded-full" style={{ background: MODULE_DISPLAY[m].color }} />
                {MODULE_DISPLAY[m].name}
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="flex items-baseline gap-1 justify-end">
            <span className="text-[12px] text-white/35">£</span>
            <span className="text-[36px] text-white leading-none" style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400 }}>
              {displayPrice}
            </span>
            <span className="text-[12px] text-white/35">/mo</span>
          </div>
          <p className="text-[11px] text-white/25 mt-0.5 mb-2">
            {period === "annual" ? "billed annually · " : ""}£250 one-time setup
          </p>
          <span className="text-[11px] font-semibold px-2 py-1 rounded" style={{ background: "rgba(5,150,105,0.15)", color: "#34D399" }}>
            Save £{displaySaving}/mo vs individual
          </span>
          <button
            onClick={onActivate}
            disabled={isLoading}
            className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all duration-150 hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1C54F2, #8B5CF6)" }}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <><Zap size={13} /> Get Full Stack</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { user, firebaseUser } = useAuth();
  const { hasModule, loading: entitlementLoading, trialActive, trialDaysRemaining } = useEntitlements();
  const searchParams = useSearchParams();

  const trialStartedAt = user?.clinicProfile?.trialStartedAt ?? null;
  const trialEndsAt = getTrialEndsAt(trialStartedAt);

  const [tier, setTier] = useState<TierKey>("studio");
  const [period, setPeriod] = useState<PeriodKey>("monthly");
  const [loadingModule, setLoadingModule] = useState<ModuleKey | "fullstack" | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billing = user?.clinicProfile?.billing;
  const hasActiveSubscription = billing?.subscriptionStatus === "active" || billing?.subscriptionStatus === "trialing";
  const allModulesActive = MODULE_KEYS.every((m) => hasModule(m));

  const checkoutSuccess = searchParams.get("checkout") === "success";
  const checkoutCanceled = searchParams.get("checkout") === "canceled";
  const statusDisplay = subscriptionStatusLabel(billing?.subscriptionStatus);

  const startCheckout = useCallback(async (modules: ModuleKey | ModuleKey[] | "fullstack") => {
    setError(null);
    const moduleArg = modules === "fullstack" ? null : (Array.isArray(modules) ? modules : [modules]);
    const moduleKey = modules === "fullstack" ? "fullstack" : (Array.isArray(modules) ? modules[0] : modules) as ModuleKey;
    setLoadingModule(moduleKey as ModuleKey | "fullstack");

    try {
      const token = await getIdToken(firebaseUser);
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          modules: modules === "fullstack" ? "fullstack" : moduleArg,
          tier,
          period,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoadingModule(null);
    }
  }, [firebaseUser, tier, period]);

  const handleManageBilling = useCallback(async () => {
    setError(null);
    setPortalLoading(true);
    try {
      const token = await getIdToken(firebaseUser);
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not open billing portal");
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPortalLoading(false);
    }
  }, [firebaseUser]);

  if (entitlementLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B2545" }}>
        <Loader2 size={28} className="animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-[28px] text-white mb-2" style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400 }}>
          Billing &amp; Modules
        </h1>
        <p className="text-[14px] text-white/45">
          Buy what you need. Bundle for value. No contracts — adjust anytime.
        </p>
      </div>

      {/* Banners */}
      {checkoutSuccess && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium" style={{ background: "rgba(5,150,105,0.12)", border: "1px solid rgba(5,150,105,0.25)", color: "#34D399" }}>
          <Check size={16} /> Subscription activated. Your modules are now live.
        </div>
      )}
      {checkoutCanceled && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)", color: "#F87171" }}>
          <AlertTriangle size={16} /> Checkout was canceled. No changes were made.
        </div>
      )}
      {error && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)", color: "#F87171" }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Trial status */}
      {trialStartedAt && (
        <div
          className="mb-6 px-5 py-4 rounded-2xl"
          style={{
            background: "rgba(245,158,11,0.06)",
            border: trialActive ? "1px solid rgba(245,158,11,0.20)" : "1px solid rgba(245,158,11,0.10)",
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(245,158,11,0.45)" }}>Free Trial</p>
          {trialActive ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-semibold text-white">
                  {trialDaysRemaining === 0 ? "Trial ends today" : trialDaysRemaining === 1 ? "1 day remaining" : `${trialDaysRemaining} days remaining`}
                </p>
                {trialEndsAt && (
                  <p className="text-[12px] mt-0.5 text-white/35">
                    Full access until {trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}>
                Active
              </span>
            </div>
          ) : (
            <p className="text-[14px] font-semibold" style={{ color: "#F87171" }}>
              Trial ended
              {!hasActiveSubscription && <span className="text-[13px] font-normal ml-2" style={{ color: "rgba(248,113,113,0.60)" }}>— subscribe below to restore access</span>}
            </p>
          )}
        </div>
      )}

      {/* Subscription status */}
      <div className="mb-8 flex items-center justify-between px-5 py-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-1">Subscription</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: statusDisplay.color }} />
            <span className="text-[14px] font-semibold text-white">{statusDisplay.label}</span>
            {billing?.currentPeriodEnd && (
              <span className="text-[12px] text-white/35">
                · renews {new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        </div>
        {hasActiveSubscription && (
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold text-white/70 hover:text-white transition-colors disabled:opacity-50"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            {portalLoading ? <Loader2 size={13} className="animate-spin" /> : <><CreditCard size={13} /> Manage billing <ExternalLink size={11} className="text-white/35" /></>}
          </button>
        )}
      </div>

      {/* Tier + period selectors */}
      <div className="flex items-center justify-between gap-4 mb-6">
        {/* Tier tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {TIER_KEYS.map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200"
              style={{
                background: tier === t ? "#1C54F2" : "transparent",
                color: tier === t ? "white" : "rgba(255,255,255,0.40)",
                boxShadow: tier === t ? "0 2px 10px rgba(28,84,242,0.30)" : "none",
              }}
            >
              {TIER_DISPLAY[t].label}
              <span className="block text-[10px] font-normal opacity-65">{TIER_DISPLAY[t].detail}</span>
            </button>
          ))}
        </div>

        {/* Annual toggle */}
        <button
          onClick={() => setPeriod(period === "monthly" ? "annual" : "monthly")}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all duration-200"
          style={{
            background: period === "annual" ? "rgba(5,150,105,0.12)" : "rgba(255,255,255,0.04)",
            border: period === "annual" ? "1px solid rgba(5,150,105,0.25)" : "1px solid rgba(255,255,255,0.08)",
            color: period === "annual" ? "#34D399" : "rgba(255,255,255,0.50)",
          }}
        >
          <div
            className="w-8 h-4.5 rounded-full relative transition-colors"
            style={{ background: period === "annual" ? "rgba(5,150,105,0.4)" : "rgba(255,255,255,0.12)" }}
          >
            <div
              className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
              style={{ transform: period === "annual" ? "translateX(17px)" : "translateX(2px)" }}
            />
          </div>
          Annual
          {period === "annual" && <span className="text-[10px] font-bold">−20%</span>}
        </button>
      </div>

      {/* Full Stack banner */}
      <FullStackBanner
        tier={tier}
        period={period}
        isLoading={loadingModule === "fullstack"}
        allActive={allModulesActive}
        onActivate={() => startCheckout("fullstack")}
      />

      {/* Module cards */}
      <div className="grid gap-4 sm:grid-cols-1">
        {MODULE_KEYS.map((moduleKey) => (
          <ModuleCard
            key={moduleKey}
            moduleKey={moduleKey}
            isActive={hasModule(moduleKey)}
            isLoading={loadingModule === moduleKey}
            tier={tier}
            period={period}
            onActivate={(m) => startCheckout(m)}
          />
        ))}
      </div>

      <p className="mt-8 text-center text-[11px] text-white/25">
        Prices are per clinic, not per seat. No contracts — cancel or adjust anytime.
      </p>
    </div>
  );
}
