/**
 * Billing helpers — module/price mapping and Stripe↔Firestore entitlement sync.
 *
 * Pricing tiers (per clinic, not per seat):
 *   Solo   — 1 clinician
 *   Studio — 2–4 clinicians
 *   Clinic — 5+ clinicians
 *
 * Module key → Firestore featureFlags key:
 *   intelligence → featureFlags.intelligence
 *   pulse        → featureFlags.continuity
 *   ava          → featureFlags.receptionist
 *   fullstack    → all three flags
 *
 * Required env vars (server-side only):
 *   STRIPE_PRICE_{MODULE}_{TIER}_{PERIOD}
 *   e.g. STRIPE_PRICE_INTELLIGENCE_STUDIO_MONTHLY
 *   MODULE: INTELLIGENCE | PULSE | AVA | FULLSTACK
 *   TIER:   SOLO | STUDIO | CLINIC
 *   PERIOD: MONTHLY | ANNUAL
 *   STRIPE_PRICE_AVA_SETUP  — one-time setup fee
 */

import type { FeatureFlags } from "@/types";

// ─── Keys ─────────────────────────────────────────────────────────────────────

export const MODULE_KEYS = ["intelligence", "pulse", "ava"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const TIER_KEYS = ["solo", "studio", "clinic"] as const;
export type TierKey = (typeof TIER_KEYS)[number];

export const PERIOD_KEYS = ["monthly", "annual"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

/** Map module key → FeatureFlags key in Firestore clinic doc. */
export const MODULE_TO_FLAG: Record<ModuleKey, keyof FeatureFlags> = {
  intelligence: "intelligence",
  pulse:        "continuity",
  ava:          "receptionist",
};

// ─── Pricing table (£/mo, matching pricing breakdown model v2.0) ─────────────

export const MONTHLY_PRICES: Record<ModuleKey | "fullstack", Record<TierKey, number>> = {
  intelligence: { solo: 79,  studio: 129, clinic: 199 },
  pulse:        { solo: 99,  studio: 149, clinic: 229 },
  ava:          { solo: 149, studio: 199, clinic: 299 },
  fullstack:    { solo: 279, studio: 399, clinic: 599 },
};

export const ANNUAL_DISCOUNT = 0.20;
export const AVA_SETUP_FEE = 250;

/** Monthly price with 20% annual discount (total yearly charge). */
export function annualTotal(monthlyPrice: number): number {
  return Math.round(monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT));
}

/** Effective monthly rate when billed annually. */
export function annualMonthlyEquivalent(monthlyPrice: number): number {
  return Math.round(monthlyPrice * (1 - ANNUAL_DISCOUNT));
}

// ─── Stripe Price IDs ────────────────────────────────────────────────────────

/**
 * Returns the Stripe Price ID for a given module/fullstack, tier, and period.
 * Throws if the env var is not set.
 */
export function getPriceId(
  module: ModuleKey | "fullstack",
  tier: TierKey,
  period: PeriodKey
): string {
  const envKey = `STRIPE_PRICE_${module.toUpperCase()}_${tier.toUpperCase()}_${period.toUpperCase()}`;
  const id = process.env[envKey];
  if (!id) throw new Error(`${envKey} env var is not set`);
  return id;
}

/** Returns the Ava one-time setup fee Price ID. */
export function getAvaSetupPriceId(): string {
  const id = process.env.STRIPE_PRICE_AVA_SETUP;
  if (!id) throw new Error("STRIPE_PRICE_AVA_SETUP env var is not set");
  return id;
}

// ─── Entitlement reconciliation ──────────────────────────────────────────────

/**
 * Given subscription items from Stripe, return the full FeatureFlags object.
 * Handles both individual module prices and Full Stack bundle prices.
 * Full Stack price → all three flags set to true.
 */
export function flagsFromSubscriptionItems(
  items: Array<{ price: { id: string } }>
): Partial<FeatureFlags> {
  // Build reverse map: priceId → flag(s) to activate
  const priceToFlags: Record<string, Array<keyof FeatureFlags>> = {};

  const modules: Array<{ key: ModuleKey | "fullstack"; flag?: keyof FeatureFlags }> = [
    { key: "intelligence", flag: "intelligence" },
    { key: "pulse",        flag: "continuity"  },
    { key: "ava",          flag: "receptionist" },
    { key: "fullstack" }, // no single flag — activates all three
  ];

  for (const mod of modules) {
    for (const tier of TIER_KEYS) {
      for (const period of PERIOD_KEYS) {
        const envKey = `STRIPE_PRICE_${mod.key.toUpperCase()}_${tier.toUpperCase()}_${period.toUpperCase()}`;
        const priceId = process.env[envKey];
        if (!priceId) continue;

        if (mod.key === "fullstack") {
          priceToFlags[priceId] = ["intelligence", "continuity", "receptionist"];
        } else if (mod.flag) {
          priceToFlags[priceId] = [mod.flag];
        }
      }
    }
  }

  // Start all false; flip true for each matched price
  const flags: Partial<FeatureFlags> = {
    intelligence: false,
    continuity:   false,
    receptionist: false,
  };

  for (const item of items) {
    const activatedFlags = priceToFlags[item.price.id];
    if (activatedFlags) {
      for (const flag of activatedFlags) {
        flags[flag] = true;
      }
    }
  }

  return flags;
}

// ─── Trial helpers ────────────────────────────────────────────────────────────

export const TRIAL_DURATION_DAYS = 14;

export function getTrialEndsAt(trialStartedAt: string | null): Date | null {
  if (!trialStartedAt) return null;
  const start = new Date(trialStartedAt);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + TRIAL_DURATION_DAYS);
  return end;
}

export function isTrialActive(trialStartedAt: string | null, clinicId?: string): boolean {
  if (clinicId === "demo-clinic") return true;
  const endsAt = getTrialEndsAt(trialStartedAt);
  if (!endsAt) return false;
  return Date.now() < endsAt.getTime();
}

export function trialDaysRemaining(trialStartedAt: string | null): number | null {
  const endsAt = getTrialEndsAt(trialStartedAt);
  if (!endsAt) return null;
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// ─── Display metadata ────────────────────────────────────────────────────────

export const MODULE_DISPLAY: Record<
  ModuleKey,
  { name: string; description: string; color: string; flagKey: keyof FeatureFlags }
> = {
  intelligence: {
    name: "Intelligence",
    description:
      "Clinical performance dashboard. 8 validated KPIs, revenue analytics, outcome measure trends, DNA analysis, and reputation tracking.",
    color: "#8B5CF6",
    flagKey: "intelligence",
  },
  pulse: {
    name: "Pulse",
    description:
      "Patient continuity engine. Post-session follow-up sequences, dropout prevention, outcome tracking, and referral prompts.",
    color: "#0891B2",
    flagKey: "continuity",
  },
  ava: {
    name: "Ava",
    description:
      "AI voice receptionist powered by Retell AI. Handles inbound calls, books appointments 24/7, and logs all interactions.",
    color: "#1C54F2",
    flagKey: "receptionist",
  },
};

export const TIER_DISPLAY: Record<TierKey, { label: string; detail: string }> = {
  solo:   { label: "Solo",   detail: "1 clinician"     },
  studio: { label: "Studio", detail: "2–4 clinicians"  },
  clinic: { label: "Clinic", detail: "5+ clinicians"   },
};
