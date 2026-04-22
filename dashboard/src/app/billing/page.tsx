"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Check,
  Lock,
  Loader2,
  CreditCard,
  ExternalLink,
  AlertTriangle,
  Zap,
  Users,
  Plus,
  Eye,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import {
  MODULE_DISPLAY,
  MODULE_KEYS,
  TIER_LABELS,
  TIER_KEYS,
  TIER_SEAT_LIMITS,
  MODULE_PRICING,
  EXTRA_SEAT_PRICING,
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
            <div className={`text-[13px] font-semibold ${active ? "text-white" : "text-navy"}`}>{label}</div>
            <div className={`text-[10px] mt-0.5 ${active ? "text-white/80" : "text-muted-strong"}`}>{detail}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Interval toggle ──────────────────────────────────────────────────────────

function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (i: BillingInterval) => void }) {
  return (
    <div className="flex items-center justify-center mb-8">
      <div className="flex gap-1 p-1 rounded-xl bg-cloud-dark border border-border">
        {(["month", "year"] as BillingInterval[]).map((interval) => {
          const active = value === interval;
          return (
            <button
              key={interval}
              onClick={() => onChange(interval)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                active
                  ? "bg-white shadow-sm border border-border text-navy font-semibold"
                  : "text-muted-strong hover:text-navy"
              }`}
            >
              <span className="text-[13px]">
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
  isDemo: boolean;
  onActivate: (module: ModuleKey) => void;
}

function ModuleCard({ moduleKey, isActive, isLoading, tier, interval, canManage, isDemo, onActivate }: ModuleCardProps) {
  const { name, description, color } = MODULE_DISPLAY[moduleKey];
  const price = MODULE_PRICING[moduleKey][tier][interval];
  const hasSetupFee = moduleKey === "ava";

  const badge = isDemo ? (
    <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
      <Eye size={10} strokeWidth={2.5} /> Preview
    </span>
  ) : isActive ? (
    <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
      <Check size={10} strokeWidth={2.5} /> Active
    </span>
  ) : (
    <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-muted uppercase tracking-wider">
      <Lock size={10} /> Locked
    </span>
  );

  return (
    <div
      className={`relative rounded-2xl p-6 flex flex-col gap-4 transition-all duration-200 bg-white border ${isActive || isDemo ? "" : "border-border"}`}
      style={isActive || isDemo ? { borderColor: `${color}40` } : undefined}
    >
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${color}, ${color}50)` }} />

      {/* Name + status */}
      <div className="flex items-center gap-3 mt-1">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}80` }} />
        <h3 className="text-[15px] font-semibold text-navy font-display">{name}</h3>
        {badge}
      </div>

      {/* Price */}
      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-[28px] font-light text-navy font-display">
            {formatGBP(price)}
          </span>
          <span className="text-[12px] text-muted">/{interval === "month" ? "mo" : "yr"}</span>
        </div>
        {hasSetupFee && !isActive && (
          <p className="text-[11px] text-muted mt-0.5">+ £199 one-time setup</p>
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
      {isDemo ? (
        <a
          href="/login"
          className={`btn-primary w-full mt-auto justify-center ${color === "#0891B2" ? "btn-primary-teal" : color === "#8B5CF6" ? "btn-primary-purple" : ""}`}
          style={{ padding: "10px 0", fontSize: 13 }}
        >
          Sign up to subscribe
        </a>
      ) : !isActive && canManage ? (
        <button
          onClick={() => onActivate(moduleKey)}
          disabled={isLoading}
          className={`btn-primary w-full mt-auto justify-center ${color === "#0891B2" ? "btn-primary-teal" : color === "#8B5CF6" ? "btn-primary-purple" : ""}`}
          style={{ padding: "10px 0", fontSize: 13 }}
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <>Add {name}</>}
        </button>
      ) : !isActive && !canManage ? (
        <div className="mt-auto text-[11px] text-muted">
          Billing controlled by clinic owner. Ask them to enable {name}.
        </div>
      ) : null}
    </div>
  );
}

// ─── Full Stack card ──────────────────────────────────────────────────────────

interface FullStackCardProps {
  tier: TierKey;
  interval: BillingInterval;
  allActive: boolean;
  isLoading: boolean;
  isDemo: boolean;
  onActivate: () => void;
}

function FullStackCard({ tier, interval, allActive, isLoading, isDemo, onActivate }: FullStackCardProps) {
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
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded mb-3 bg-cloud-dark text-navy">
            <Zap size={9} strokeWidth={2.5} /> Best value
          </div>
          <h3 className="text-[20px] text-navy font-display font-normal mb-1">
            StrydeOS Full Stack
          </h3>
          <p className="text-[13px] text-muted mb-4">One system. Every metric. Every call. Every patient.</p>
          <div className="flex gap-4">
            {(["intelligence", "pulse", "ava"] as ModuleKey[]).map((m) => (
              <div key={m} className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-strong">
                <div className="w-2 h-2 rounded-full" style={{ background: MODULE_DISPLAY[m].color }} />
                {MODULE_DISPLAY[m].name}
              </div>
            ))}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-baseline justify-end gap-1">
            <span className="text-[36px] font-light text-navy font-display">
              {formatGBP(price)}
            </span>
            <span className="text-[12px] text-muted">/{interval === "month" ? "mo" : "yr"}</span>
          </div>
          <p className="text-[11px] text-muted mt-0.5">+ £199 one-time setup</p>
          <div className="inline-block mt-2 px-2.5 py-1 rounded text-[11px] font-semibold bg-success/15 text-success">
            Save {formatGBP(saving)}/{interval === "month" ? "mo" : "yr"} vs individual
          </div>
        </div>
      </div>

      {isDemo ? (
        <a
          href="/login"
          className="btn-primary btn-primary-purple mt-5 w-full justify-center"
        >
          Sign up to subscribe
        </a>
      ) : !allActive ? (
        <button
          onClick={onActivate}
          disabled={isLoading}
          className="btn-primary btn-primary-purple mt-5 w-full justify-center"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <>Get Full Stack</>}
        </button>
      ) : (
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
  const { hasModule, loading: entitlementLoading, trialActive, trialDaysRemaining, isDemo } = useEntitlements();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Clinicians cannot access billing — redirect to dashboard
  useEffect(() => {
    if (user && user.role === "clinician") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const trialStartedAt = user?.clinicProfile?.trialStartedAt ?? null;
  const trialEndsAt = getTrialEndsAt(trialStartedAt);

  const [tier, setTier] = useState<TierKey>("studio");
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [loadingModule, setLoadingModule] = useState<ModuleKey | "fullstack" | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [seatLoading, setSeatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billing = user?.clinicProfile?.billing;
  const hasActiveSubscription =
    billing?.subscriptionStatus === "active" || billing?.subscriptionStatus === "trialing";

  const checkoutSuccess  = searchParams.get("checkout") === "success";
  const checkoutCanceled = searchParams.get("checkout") === "canceled";

  const isSuperadmin = user?.role === "superadmin" || user?.role === "owner";
  const statusDisplay =
    isSuperadmin
      ? { label: "Full access", color: "#8B5CF6" }
      : trialActive && !billing?.subscriptionStatus
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

  const handleAddSeat = useCallback(async () => {
    setError(null);
    setSeatLoading(true);
    try {
      const token = await getIdToken(firebaseUser);
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/billing/seats", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add seat");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSeatLoading(false);
    }
  }, [firebaseUser]);

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
        <h1 className="text-[28px] text-navy font-display font-normal mb-2">
          {isDemo ? "Pricing" : "Billing & Modules"}
        </h1>
        <p className="text-[14px] text-muted">
          {isDemo
            ? "This is what you'd pay to run StrydeOS on your own clinic. Buy what you need, bundle for value, cancel anytime."
            : "Buy what you need. Bundle for value. No contracts — cancel anytime."}
        </p>
      </div>

      {/* Demo mode banner */}
      {isDemo && (
        <div
          className="mb-8 flex items-center gap-4 px-5 py-4 rounded-2xl border"
          style={{ background: "rgba(28,84,242,0.04)", borderColor: "rgba(28,84,242,0.18)" }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(28,84,242,0.10)" }}
          >
            <Eye size={16} className="text-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-navy">You&apos;re viewing the demo</p>
            <p className="text-[12px] text-muted mt-0.5">
              Every module is unlocked with sample data so you can explore. Sign up to connect your own clinic.
            </p>
          </div>
          <a
            href="/login"
            className="btn-primary shrink-0 flex items-center gap-1.5"
            style={{ padding: "8px 16px", fontSize: 12 }}
          >
            Sign up <ArrowRight size={12} />
          </a>
        </div>
      )}

      {/* Checkout banners */}
      {checkoutSuccess && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium" style={{ background: "rgba(5,150,105,0.12)", border: "1px solid rgba(5,150,105,0.25)", color: "#059669" }}>
          <Check size={16} /> Subscription activated. Your modules are now live.
        </div>
      )}
      {checkoutCanceled && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)", color: "#EF4444" }}>
          <AlertTriangle size={16} /> Checkout was canceled. No changes were made.
        </div>
      )}
      {error && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)", color: "#EF4444" }}>
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
                <p className="text-[14px] font-semibold text-navy">
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

      {/* Subscription status row — hidden in demo (no real subscription) */}
      {!isDemo && (
        <div className="mb-8 flex items-center justify-between px-5 py-4 rounded-2xl bg-cloud-dark border border-border">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-strong mb-1">Subscription</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: statusDisplay.color }} />
              <span className="text-[14px] font-semibold text-navy">{statusDisplay.label}</span>
              {billing?.currentPeriodEnd && (
                <span className="text-[12px] text-muted">
                  · renews {new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>
          {hasActiveSubscription && canManageBilling && (
            <button onClick={handleManageBilling} disabled={portalLoading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold text-muted hover:text-navy transition-colors disabled:opacity-50 bg-white border border-border">
              {portalLoading ? <Loader2 size={13} className="animate-spin" /> : <><CreditCard size={13} /> Manage billing <ExternalLink size={11} className="opacity-60" /></>}
            </button>
          )}
        </div>
      )}

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
            isDemo={isDemo}
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
        isDemo={isDemo}
        onActivate={() => handleActivate("fullstack")}
      />

      {/* Clinician seats — only for real, paying clinics (not demo) */}
      {!isDemo && hasActiveSubscription && canManageBilling && (() => {
        const currentTier = billing?.tier as TierKey | undefined;
        const effectiveTier = currentTier ?? "studio";
        const tierLimit = TIER_SEAT_LIMITS[effectiveTier];
        const extraSeats: number = billing?.extraSeats ?? 0;
        const totalSeats = tierLimit + extraSeats;
        const seatPrice = EXTRA_SEAT_PRICING[interval];

        return (
          <div className="mt-6 rounded-2xl p-5 bg-white border border-border">
            <div className="flex items-center gap-2 mb-4">
              <Users size={15} className="text-navy" />
              <h3 className="text-[14px] font-semibold text-navy">Clinician Seats</h3>
            </div>

            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[22px] font-light text-navy font-display">{totalSeats}</span>
                  <span className="text-[12px] text-muted">total seats</span>
                </div>
                <p className="text-[11px] text-muted mt-0.5">
                  {tierLimit} included ({TIER_LABELS[effectiveTier].label} tier)
                  {extraSeats > 0 && <> + {extraSeats} extra @ {formatGBP(EXTRA_SEAT_PRICING.month)}/mo each</>}
                </p>
              </div>

              <button
                onClick={handleAddSeat}
                disabled={seatLoading}
                className="btn-primary" style={{ padding: "8px 16px", fontSize: 12 }}
              >
                {seatLoading ? <Loader2 size={13} className="animate-spin" /> : <><Plus size={13} /> Add seat</>}
              </button>
            </div>

            <div className="pt-3 border-t border-border">
              <p className="text-[11px] text-muted">
                Extra seats: {formatGBP(seatPrice)}/{interval === "month" ? "mo" : "yr"} per clinician
                {interval === "year" && <span className="text-success ml-1">(20% off)</span>}
                . Added to your existing subscription immediately.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Footer */}
      <div className="mt-8 pt-5 border-t border-border/50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Visa */}
            <svg width="32" height="20" viewBox="0 0 32 20" fill="none" aria-label="Visa"><rect width="32" height="20" rx="3" fill="#1A1F71"/><path d="M13.6 13.5l1.7-8.2h2l-1.7 8.2h-2zm8.5-8c-.4-.2-1-.3-1.8-.3-2 0-3.4 1-3.4 2.5 0 1.1 1 1.7 1.8 2 .8.4 1 .7 1 1 0 .5-.6.8-1.2.8-.8 0-1.2-.1-1.9-.4l-.3-.1-.3 1.6c.5.2 1.3.4 2.2.4 2.1 0 3.5-1 3.5-2.6 0-.9-.5-1.5-1.7-2.1-.7-.3-1.1-.6-1.1-1 0-.3.4-.7 1.1-.7.7 0 1.1.1 1.5.3l.2.1.4-1.5zm5.1 0h-1.5c-.5 0-.8.1-1 .6l-2.9 6.4h2.1l.4-1.1h2.5l.2 1.1h1.8L27.2 5.5zm-2.4 5.3l1-2.8.3.9.2.7.3 1.2h-1.8zM12 5.5l-1.9 5.6-.2-1-.7-3.2c-.1-.5-.5-.6-1-.6H5.5l-.1.2c.7.2 1.5.5 2 .8l1.7 6h2.1l3.2-7.8H12z" fill="white"/></svg>
            {/* Mastercard */}
            <svg width="32" height="20" viewBox="0 0 32 20" fill="none" aria-label="Mastercard"><rect width="32" height="20" rx="3" fill="#252525"/><circle cx="12.5" cy="10" r="5.5" fill="#EB001B"/><circle cx="19.5" cy="10" r="5.5" fill="#F79E1B"/><path d="M16 5.8a5.5 5.5 0 0 1 0 8.4 5.5 5.5 0 0 1 0-8.4z" fill="#FF5F00"/></svg>
            {/* Amex */}
            <svg width="32" height="20" viewBox="0 0 32 20" fill="none" aria-label="American Express"><rect width="32" height="20" rx="3" fill="#006FCF"/><text x="16" y="12.5" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold" fontFamily="sans-serif">AMEX</text></svg>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span>Powered by</span>
            <svg viewBox="0 0 468 222.5" className="h-[13px] w-auto" fill="#635BFF" aria-label="Stripe"><path fillRule="evenodd" clipRule="evenodd" d="M414 113.4c0-25.6-12.4-45.8-36.1-45.8-23.8 0-38.2 20.2-38.2 45.6 0 30.1 17 45.3 41.4 45.3 11.9 0 20.9-2.7 27.7-6.5v-20c-6.8 3.4-14.6 5.5-24.5 5.5-9.7 0-18.3-3.4-19.4-15.2h48.9c0-1.3.2-6.5.2-8.9zm-49.4-9.5c0-11.3 6.9-16 13.2-16 6.1 0 12.6 4.7 12.6 16h-25.8zM301.1 67.6c-9.8 0-16.1 4.6-19.6 7.8l-1.3-6.2h-22v116.6l25-5.3.1-28.3c3.6 2.6 8.9 6.3 17.7 6.3 17.9 0 34.2-14.4 34.2-46.1-.1-29-16.6-44.8-34.1-44.8zm-6 68.9c-5.9 0-9.4-2.1-11.8-4.7l-.1-37.1c2.6-2.9 6.2-4.9 11.9-4.9 9.1 0 15.4 10.2 15.4 23.3 0 13.4-6.2 23.4-15.4 23.4zM223.8 61.7l25.1-5.4V36l-25.1 5.3zM223.8 69.3h25.1v87.5h-25.1zM196.9 76.7l-1.6-7.4h-21.6v87.5h25V97.5c5.9-7.7 15.9-6.3 19-5.2v-23c-3.2-1.2-14.9-3.4-20.8 7.4zM146.9 47.6l-24.4 5.2-.1 80.1c0 14.8 11.1 25.7 25.9 25.7 8.2 0 14.2-1.5 17.5-3.3V135c-3.2 1.3-19 5.9-19-8.9V90.6h19V69.3h-19l.1-21.7zM79.3 94.7c0-3.9 3.2-5.4 8.5-5.4 7.6 0 17.2 2.3 24.8 6.4V72.2c-8.3-3.3-16.5-4.6-24.8-4.6C68.7 67.6 55 78.2 55 95.2c0 26.3 36.3 22.1 36.3 33.4 0 4.6-4 6.1-9.6 6.1-8.3 0-18.9-3.4-27.3-8v23.8c9.3 4 18.7 5.7 27.3 5.7 19.8 0 33.4-9.8 33.4-26.8 0-28.5-36.8-23.3-36.8-34.7z"/></svg>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted">
          <div className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>256-bit SSL encrypted</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="/terms" className="hover:text-navy transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-navy transition-colors">Privacy</a>
            <span>All prices GBP · cancel anytime</span>
          </div>
        </div>
      </div>
    </div>
  );
}
