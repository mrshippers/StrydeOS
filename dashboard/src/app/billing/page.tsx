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
  TIER_LABELS,
  TIER_KEYS,
  MODULE_PRICING,
  getTrialEndsAt,
  formatGBP,
  type ModuleKey,
  type TierKey,
  type BillingInterval,
} from "@/lib/billing";
import type { StripeSubscriptionStatus } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getIdToken(firebaseUser: { getIdToken: () => Promise<string> } | null): Promise<string | null> {
  if (!firebaseUser) return null;
  try { return await firebaseUser.getIdToken(); }
  catch { return null; }
}

function subscriptionStatusLabel(status: StripeSubscriptionStatus | null | undefined): { label: string; color: string } {
  switch (status) {
    case "active":   return { label: "Active",           color: "#059669" };
    case "trialing": return { label: "Trial",            color: "#0891B2" };
    case "past_due": return { label: "Payment overdue",  color: "#F59E0B" };
    case "canceled": return { label: "Canceled",         color: "#EF4444" };
    case "paused":   return { label: "Paused",           color: "#6B7280" };
    default:         return { label: "Inactive",         color: "#6B7280" };
  }
}

// ─── Tier selector ────────────────────────────────────────────────────────────

function TierSelector({ value, onChange }: { value: TierKey; onChange: (t: TierKey) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl mb-6 bg-cloud-dark border border-border">
      {TIER_KEYS.map((tier) => {
        const { label, detail } = TIER_LABELS[tier];
        const active = value === tier;
        return (
          <button
            key={tier}
            onClick={() => onChange(tier)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-center transition-all duration-200 ${active ? "bg-blue text-white shadow-[0_2px_12px_rgba(28,84,242,0.35)]" : "bg-transparent"}`}
          >
            <div className={`text-[13px] font-semibold ${active ? "text-white" : "text-muted"}`}>{label}</div>
            <div className={`text-[10px] mt-0.5 ${active ? "text-white/80" : "text-muted"}`}>{detail}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Interval toggle ──────────────────────────────────────────────────────────

function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (i: BillingInterval) => void }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-8">
      {(["month", "year"] as BillingInterval[]).map((interval) => {
        const active = value === interval;
        return (
          <button
            key={interval}
            onClick={() => onChange(interval)}
            className="flex items-center gap-2 transition-all"
          >
            <span className={`text-[13px] font-medium ${active ? "text-ink" : "text-muted"}`}>
              {interval === "month" ? "Monthly" : "Annual"}
            </span>
            {interval === "year" && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success/15 text-success">
                Save 20%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Module card ──────────────────────────────────────────────────────────────

interface ModuleCardProps {
  moduleKey: ModuleKey;
  isActive: boolean;
  isLoading: boolean;
  tier: TierKey;
  interval: BillingInterval;
  canManage: boolean;
  onActivate: (module: ModuleKey) => void;
}

function ModuleCard({ moduleKey, isActive, isLoading, tier, interval, canManage, onActivate }: ModuleCardProps) {
  const { name, description, color } = MODULE_DISPLAY[moduleKey];
  const price = MODULE_PRICING[moduleKey][tier][interval];
  const hasSetupFee = moduleKey === "ava";

  return (
    <div
      className={`relative rounded-2xl p-6 flex flex-col gap-4 transition-all duration-200 bg-white border ${isActive ? "" : "border-border"}`}
      style={isActive ? { borderColor: `${color}40` } : undefined}
    >
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${color}, ${color}50)` }} />

      {/* Name + status */}
      <div className="flex items-center gap-3 mt-1">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}80` }} />
        <h3 className="text-[15px] font-semibold text-ink font-display">{name}</h3>
        {isActive ? (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
            <Check size={10} strokeWidth={2.5} /> Active
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-muted uppercase tracking-wider">
            <Lock size={10} /> Locked
          </span>
        )}
      </div>

      {/* Price */}
      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-[28px] font-light text-ink font-display">
            {formatGBP(price)}
          </span>
          <span className="text-[12px] text-muted">/{interval === "month" ? "mo" : "yr"}</span>
        </div>
        {hasSetupFee && !isActive && (
          <p className="text-[11px] text-muted mt-0.5">+ £250 one-time setup</p>
        )}
        {interval === "year" && (
          <p className="text-[11px] mt-0.5 text-success">
            {formatGBP(Math.round(price / 12))}/mo equivalent · 20% off
          </p>
        )}
      </div>

      {/* Description */}
      <p className="text-[13px] text-muted leading-relaxed">{description}</p>

      {/* CTA */}
      {!isActive && canManage && (
        <button
          onClick={() => onActivate(moduleKey)}
          disabled={isLoading}
          className="mt-auto flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all duration-150 hover:opacity-90 disabled:opacity-50"
          style={{ background: color }}
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <>Add {name}</>}
        </button>
      )}
      {!isActive && !canManage && (
        <div className="mt-auto text-[11px] text-muted">
          Billing controlled by clinic owner. Ask them to enable {name}.
        </div>
      )}
    </div>
  );
}

// ─── Full Stack card ──────────────────────────────────────────────────────────

interface FullStackCardProps {
  tier: TierKey;
  interval: BillingInterval;
  allActive: boolean;
  isLoading: boolean;
  onActivate: () => void;
}

function FullStackCard({ tier, interval, allActive, isLoading, onActivate }: FullStackCardProps) {
  const price = MODULE_PRICING.fullstack[tier][interval];
  const individualTotal = (["intelligence", "pulse", "ava"] as ModuleKey[])
    .reduce((sum, m) => sum + MODULE_PRICING[m][tier][interval], 0);
  const saving = individualTotal - price;

  return (
    <div className="relative rounded-2xl p-6 mt-4 overflow-hidden bg-white border border-blue-glow/30">
      {/* Tri-colour top bar */}
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl bg-gradient-to-r from-purple via-blue to-teal" />

      <div className="flex items-start justify-between gap-6 mt-1">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded mb-3 bg-cloud-dark text-muted">
            <Zap size={9} strokeWidth={2.5} /> Best value
          </div>
          <h3 className="text-[20px] text-ink font-display font-normal mb-1">
            StrydeOS Full Stack
          </h3>
          <p className="text-[13px] text-muted mb-4">One system. Every metric. Every call. Every patient.</p>
          <div className="flex gap-4">
            {(["intelligence", "pulse", "ava"] as ModuleKey[]).map((m) => (
              <div key={m} className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                <div className="w-2 h-2 rounded-full" style={{ background: MODULE_DISPLAY[m].color }} />
                {MODULE_DISPLAY[m].name}
              </div>
            ))}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-baseline justify-end gap-1">
            <span className="text-[36px] font-light text-ink font-display">
              {formatGBP(price)}
            </span>
            <span className="text-[12px] text-muted">/{interval === "month" ? "mo" : "yr"}</span>
          </div>
          <p className="text-[11px] text-muted mt-0.5">+ £250 one-time setup</p>
          <div className="inline-block mt-2 px-2.5 py-1 rounded text-[11px] font-semibold bg-success/15 text-success">
            Save {formatGBP(saving)}/{interval === "month" ? "mo" : "yr"} vs individual
          </div>
        </div>
      </div>

      {!allActive && (
        <button
          onClick={onActivate}
          disabled={isLoading}
          className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-semibold text-white transition-all duration-150 hover:opacity-90 disabled:opacity-50 bg-gradient-to-r from-blue to-purple"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <>Get Full Stack</>}
        </button>
      )}
      {allActive && (
        <div className="mt-5 flex items-center justify-center gap-2 py-2.5 text-[13px] font-semibold text-success">
          <Check size={16} strokeWidth={2.5} /> All modules active
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { user, firebaseUser } = useAuth();
  const { hasModule, loading: entitlementLoading, trialActive, trialDaysRemaining } = useEntitlements();
  const searchParams = useSearchParams();

  const trialStartedAt = user?.clinicProfile?.trialStartedAt ?? null;
  const trialEndsAt = getTrialEndsAt(trialStartedAt);

  const [tier, setTier] = useState<TierKey>("studio");
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [loadingModule, setLoadingModule] = useState<ModuleKey | "fullstack" | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billing = user?.clinicProfile?.billing;
  const hasActiveSubscription =
    billing?.subscriptionStatus === "active" || billing?.subscriptionStatus === "trialing";

  const checkoutSuccess  = searchParams.get("checkout") === "success";
  const checkoutCanceled = searchParams.get("checkout") === "canceled";

  const statusDisplay =
    trialActive && !billing?.subscriptionStatus
      ? { label: "Trial", color: "#0891B2" }
      : subscriptionStatusLabel(billing?.subscriptionStatus);

  const allActive = MODULE_KEYS.every((m) => hasModule(m));

  const canManageBilling =
    user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";

  const handleActivate = useCallback(
    async (module: ModuleKey | "fullstack") => {
      setError(null);
      setLoadingModule(module);
      try {
        const token = await getIdToken(firebaseUser);
        if (!token) throw new Error("Not authenticated");

        const modules = module === "fullstack" ? ["fullstack"] : [module];
        const includeAvaSetup = module === "ava" || module === "fullstack";

        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ modules, tier, interval, includeAvaSetup }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Checkout failed");
        if (data.url) window.location.href = data.url;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoadingModule(null);
      }
    },
    [firebaseUser, tier, interval]
  );

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
      <div className="min-h-screen flex items-center justify-center bg-cloud-dancer">
        <Loader2 size={28} className="animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-[28px] text-ink font-display font-normal mb-2">
          Billing &amp; Modules
        </h1>
        <p className="text-[14px] text-muted">
          Buy what you need. Bundle for value. No contracts — cancel anytime.
        </p>
      </div>

      {/* Checkout banners */}
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
        <div className={`mb-6 px-5 py-4 rounded-2xl border ${trialActive ? "bg-warn/5 border-warn/20" : "bg-warn/5 border-warn/10"}`}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 text-warn/70">Free Trial</p>
          {trialActive ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-semibold text-ink">
                  {trialDaysRemaining === 0 ? "Trial ends today" : trialDaysRemaining === 1 ? "1 day remaining" : `${trialDaysRemaining} days remaining`}
                </p>
                {trialEndsAt && (
                  <p className="text-[12px] mt-0.5 text-muted">
                    Full access until {trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-warn/10 text-warn">Active</span>
            </div>
          ) : (
            <p className="text-[14px] font-semibold text-danger">
              Trial ended{!hasActiveSubscription && <span className="text-[13px] font-normal ml-2 text-danger/80">— subscribe below to restore access</span>}
            </p>
          )}
        </div>
      )}

      {/* Subscription status row */}
      <div className="mb-8 flex items-center justify-between px-5 py-4 rounded-2xl bg-cloud-dark border border-border">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-1">Subscription</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: statusDisplay.color }} />
            <span className="text-[14px] font-semibold text-ink">{statusDisplay.label}</span>
            {billing?.currentPeriodEnd && (
              <span className="text-[12px] text-muted">
                · renews {new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        </div>
        {hasActiveSubscription && canManageBilling && (
          <button onClick={handleManageBilling} disabled={portalLoading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold text-muted hover:text-ink transition-colors disabled:opacity-50 bg-white border border-border">
            {portalLoading ? <Loader2 size={13} className="animate-spin" /> : <><CreditCard size={13} /> Manage billing <ExternalLink size={11} className="opacity-60" /></>}
          </button>
        )}
      </div>

      {/* Tier + interval selectors */}
      <TierSelector value={tier} onChange={canManageBilling ? setTier : () => {}} />
      <IntervalToggle value={interval} onChange={canManageBilling ? setInterval : () => {}} />

      {/* Module cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {MODULE_KEYS.map((moduleKey) => (
          <ModuleCard
            key={moduleKey}
            moduleKey={moduleKey}
            isActive={hasModule(moduleKey)}
            isLoading={loadingModule === moduleKey}
            tier={tier}
            interval={interval}
            canManage={canManageBilling}
            onActivate={handleActivate}
          />
        ))}
      </div>

      {/* Full Stack bundle */}
      <FullStackCard
        tier={tier}
        interval={interval}
        allActive={allActive}
        isLoading={loadingModule === "fullstack"}
        onActivate={() => handleActivate("fullstack")}
      />

      <p className="mt-8 text-center text-[11px] text-muted">
        All prices in GBP · billed {interval === "month" ? "monthly" : "annually"} · no contracts · cancel anytime
      </p>
    </div>
  );
}
