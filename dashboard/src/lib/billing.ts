/**
 * Billing helpers — module/price mapping and Stripe↔Firestore entitlement sync.
 *
 * Pricing model (from pricing breakdown model.html):
 *   Three tiers:  solo (1 clinician) | studio (2-4) | clinic (5+)
 *   Two intervals: month | year (year = 20% off)
 *   Four products: intelligence | pulse | ava | fullstack (all-three bundle)
 *   One-time fee:  Ava setup £250
 *
 * Env var naming: STRIPE_PRICE_{PRODUCT}_{TIER}_{INTERVAL}
 *   e.g. STRIPE_PRICE_INTELLIGENCE_STUDIO_MONTH
 *        STRIPE_PRICE_FULLSTACK_CLINIC_YEAR
 *        STRIPE_PRICE_AVA_SETUP  (one-time)
 *
 * Module key → Firestore featureFlags field:
 *   intelligence → featureFlags.intelligence
 *   pulse        → featureFlags.continuity
 *   ava          → featureFlags.receptionist
 */

import type { FeatureFlags } from "@/types";
import { moduleColors } from "@/lib/brand";

// ─── Core types ──────────────────────────────────────────────────────────────

export const MODULE_KEYS = ["intelligence", "pulse", "ava"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const TIER_KEYS = ["solo", "studio", "clinic"] as const;
export type TierKey = (typeof TIER_KEYS)[number];

export const INTERVAL_KEYS = ["month", "year"] as const;
export type BillingInterval = (typeof INTERVAL_KEYS)[number];

export type ProductKey = ModuleKey | "fullstack";

/** Map module key → FeatureFlags key in Firestore clinic doc. */
export const MODULE_TO_FLAG: Record<ModuleKey, keyof FeatureFlags> = {
  intelligence: "intelligence",
  pulse: "continuity",
  ava: "receptionist",
};

// ─── Pricing table (in pence, GBP) ───────────────────────────────────────────

/** Annual = 20% off (monthly × 12 × 0.8). Values in pence. */
export const MODULE_PRICING: Record<
  ProductKey,
  Record<TierKey, { month: number; year: number }>
> = {
  intelligence: {
    solo:   { month:  7900, year:  75840 }, // £79   → £758.40/yr
    studio: { month: 12900, year: 123840 }, // £129  → £1,238.40/yr
    clinic: { month: 19900, year: 191040 }, // £199  → £1,910.40/yr
  },
  ava: {
    solo:   { month: 14900, year: 143040 }, // £149  → £1,430.40/yr
    studio: { month: 19900, year: 191040 }, // £199  → £1,910.40/yr
    clinic: { month: 29900, year: 287040 }, // £299  → £2,870.40/yr
  },
  pulse: {
    solo:   { month:  9900, year:  95040 }, // £99   → £950.40/yr
    studio: { month: 14900, year: 143040 }, // £149  → £1,430.40/yr
    clinic: { month: 22900, year: 219840 }, // £229  → £2,198.40/yr
  },
  fullstack: {
    solo:   { month: 27900, year: 267840 }, // £279  → £2,678.40/yr
    studio: { month: 39900, year: 383040 }, // £399  → £3,830.40/yr
    clinic: { month: 59900, year: 575040 }, // £599  → £5,750.40/yr
  },
};

/** Ava one-time setup fee (pence). */
export const AVA_SETUP_FEE_PENCE = 25000; // £250

// ─── Stripe Price ID helpers ──────────────────────────────────────────────────

/** Returns the env var name for a given product/tier/interval combination. */
export function getPriceEnvVar(
  product: ProductKey,
  tier: TierKey,
  interval: BillingInterval
): string {
  return `STRIPE_PRICE_${product.toUpperCase()}_${tier.toUpperCase()}_${interval.toUpperCase()}`;
}

/** Returns the Stripe Price ID for a given combination (throws if env var missing). */
export function getPriceId(
  product: ProductKey,
  tier: TierKey,
  interval: BillingInterval
): string {
  const varName = getPriceEnvVar(product, tier, interval);
  const id = process.env[varName];
  if (!id) throw new Error(`${varName} env var is not set`);
  return id;
}

/** Returns the Stripe Price ID for the Ava one-time setup fee. */
export function getAvaSetupFeePriceId(): string {
  const id = process.env.STRIPE_PRICE_AVA_SETUP;
  if (!id) throw new Error("STRIPE_PRICE_AVA_SETUP env var is not set");
  return id;
}

// ─── Entitlement reconciliation ──────────────────────────────────────────────

/**
 * Builds a map of ALL known Stripe Price IDs → the FeatureFlags keys they activate.
 * Individual module prices → [that module's flag]
 * Full Stack prices        → [intelligence, continuity, receptionist]
 */
function buildPriceToFlagsMap(): Record<string, Array<keyof FeatureFlags>> {
  const map: Record<string, Array<keyof FeatureFlags>> = {};

  for (const module of MODULE_KEYS) {
    for (const tier of TIER_KEYS) {
      for (const interval of INTERVAL_KEYS) {
        const priceId = process.env[getPriceEnvVar(module, tier, interval)];
        if (priceId) map[priceId] = [MODULE_TO_FLAG[module]];
      }
    }
  }

  for (const tier of TIER_KEYS) {
    for (const interval of INTERVAL_KEYS) {
      const priceId = process.env[getPriceEnvVar("fullstack", tier, interval)];
      if (priceId) {
        map[priceId] = ["intelligence", "continuity", "receptionist"];
      }
    }
  }

  return map;
}

/**
 * Given a list of subscription items (from a Stripe subscription),
 * return the full FeatureFlags object with modules set to true/false
 * based on which price IDs are active.
 */
export function flagsFromSubscriptionItems(
  items: Array<{ price: { id: string } }>
): Partial<FeatureFlags> {
  const priceToFlags = buildPriceToFlagsMap();

  const flags: Partial<FeatureFlags> = {
    intelligence: false,
    continuity: false,
    receptionist: false,
  };

  for (const item of items) {
    const flagKeys = priceToFlags[item.price.id];
    if (flagKeys) {
      for (const key of flagKeys) flags[key] = true;
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

export function isTrialActive(trialStartedAt: string | null): boolean {
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

export const TIER_LABELS: Record<TierKey, { label: string; detail: string }> = {
  solo:   { label: "Solo",   detail: "1 clinician" },
  studio: { label: "Studio", detail: "2–4 clinicians" },
  clinic: { label: "Clinic", detail: "5+ clinicians" },
};

export const MODULE_DISPLAY: Record<
  ModuleKey,
  { name: string; description: string; color: string; flagKey: keyof FeatureFlags }
> = {
  intelligence: {
    name: "Intelligence",
    description:
      "Clinical performance dashboard. 8 validated KPIs, revenue analytics, outcome measures, DNA analysis, and reputation tracking.",
    color: moduleColors.intelligence,
    flagKey: "intelligence",
  },
  pulse: {
    name: "Pulse",
    description:
      "Patient retention engine. Automated rebooking sequences, HEP reminders, churn risk detection, and comms log.",
    color: moduleColors.pulse,
    flagKey: "continuity",
  },
  ava: {
    name: "Ava",
    description:
      "AI voice receptionist powered by Retell AI. Handles inbound calls, books appointments 24/7, and logs all interactions.",
    color: moduleColors.ava,
    flagKey: "receptionist",
  },
};

/** Format pence to a human-readable GBP string. e.g. 12900 → "£129" */
export function formatGBP(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}
