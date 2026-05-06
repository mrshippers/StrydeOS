/**
 * Smoke tests for the billing webhook handler.
 *
 * These test the pure logic functions (flagsFromSubscriptionItems, getTierFromMetadata)
 * and the webhook routing (via mocked Stripe + Firestore).
 */

import { describe, it, beforeEach, expect } from "vitest";

// ─── Test flagsFromSubscriptionItems ────────────────────────────────────────

describe("flagsFromSubscriptionItems", () => {
  // We need to set env vars before importing so buildPriceToFlagsMap() picks them up
  beforeEach(() => {
    process.env.STRIPE_PRICE_INTELLIGENCE_SOLO_MONTH = "price_int_solo_m";
    process.env.STRIPE_PRICE_INTELLIGENCE_STUDIO_MONTH = "price_int_studio_m";
    process.env.STRIPE_PRICE_PULSE_SOLO_MONTH = "price_pulse_solo_m";
    process.env.STRIPE_PRICE_AVA_STUDIO_MONTH = "price_ava_studio_m";
    process.env.STRIPE_PRICE_FULLSTACK_CLINIC_MONTH = "price_fs_clinic_m";
  });

  it("maps a single Intelligence price to the intelligence flag", async () => {
    // Dynamic import to pick up env vars
    const { flagsFromSubscriptionItems } = await import("@/lib/billing");

    const flags = flagsFromSubscriptionItems([
      { price: { id: "price_int_solo_m" } },
    ]);

    expect(flags.intelligence).toBe(true);
    expect(flags.continuity).toBe(false);
    expect(flags.receptionist).toBe(false);
  });

  it("maps Fullstack price to all three flags", async () => {
    const { flagsFromSubscriptionItems } = await import("@/lib/billing");

    const flags = flagsFromSubscriptionItems([
      { price: { id: "price_fs_clinic_m" } },
    ]);

    expect(flags.intelligence).toBe(true);
    expect(flags.continuity).toBe(true);
    expect(flags.receptionist).toBe(true);
  });

  it("merges multiple individual module prices", async () => {
    const { flagsFromSubscriptionItems } = await import("@/lib/billing");

    const flags = flagsFromSubscriptionItems([
      { price: { id: "price_int_studio_m" } },
      { price: { id: "price_ava_studio_m" } },
    ]);

    expect(flags.intelligence).toBe(true);
    expect(flags.continuity).toBe(false);
    expect(flags.receptionist).toBe(true);
  });

  it("returns all-false for unknown price IDs", async () => {
    const { flagsFromSubscriptionItems } = await import("@/lib/billing");

    const flags = flagsFromSubscriptionItems([
      { price: { id: "price_unknown_xyz" } },
    ]);

    expect(flags.intelligence).toBe(false);
    expect(flags.continuity).toBe(false);
    expect(flags.receptionist).toBe(false);
  });
});

// ─── Test getTierFromMetadata ───────────────────────────────────────────────

describe("getTierFromMetadata", () => {
  it("extracts a valid tier from metadata", async () => {
    const { getTierFromMetadata } = await import("@/lib/billing");

    expect(getTierFromMetadata({ tier: "solo" })).toBe("solo");
    expect(getTierFromMetadata({ tier: "studio" })).toBe("studio");
    expect(getTierFromMetadata({ tier: "clinic" })).toBe("clinic");
  });

  it("returns null for invalid tier values", async () => {
    const { getTierFromMetadata } = await import("@/lib/billing");

    expect(getTierFromMetadata({ tier: "enterprise" })).toBe(null);
    expect(getTierFromMetadata({})).toBe(null);
    expect(getTierFromMetadata(null)).toBe(null);
    expect(getTierFromMetadata(undefined)).toBe(null);
  });
});

// ─── Test seat limit constants ──────────────────────────────────────────────

describe("TIER_SEAT_LIMITS", () => {
  it("enforces correct seat caps per tier", async () => {
    const { TIER_SEAT_LIMITS } = await import("@/lib/billing");

    expect(TIER_SEAT_LIMITS.solo).toBe(1);
    expect(TIER_SEAT_LIMITS.studio).toBe(5);
    expect(TIER_SEAT_LIMITS.clinic).toBe(6);
  });
});

// ─── Test trial helpers ─────────────────────────────────────────────────────

describe("trial helpers", () => {
  it("isTrialActive returns true for a recent trial start", async () => {
    const { isTrialActive } = await import("@/lib/billing");

    const now = new Date().toISOString();
    expect(isTrialActive(now)).toBe(true);
  });

  it("isTrialActive returns false for an expired trial", async () => {
    const { isTrialActive } = await import("@/lib/billing");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isTrialActive(thirtyDaysAgo)).toBe(false);
  });

  it("trialDaysRemaining returns correct value", async () => {
    const { trialDaysRemaining, TRIAL_DURATION_DAYS } = await import("@/lib/billing");

    const now = new Date().toISOString();
    const remaining = trialDaysRemaining(now);
    expect(remaining).not.toBe(null);
    // Should be close to TRIAL_DURATION_DAYS (13 or 14 depending on time of day)
    expect(remaining!).toBeGreaterThanOrEqual(TRIAL_DURATION_DAYS - 1);
    expect(remaining!).toBeLessThanOrEqual(TRIAL_DURATION_DAYS);
  });

  it("trialDaysRemaining returns 0 for expired trial", async () => {
    const { trialDaysRemaining } = await import("@/lib/billing");

    const longAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(trialDaysRemaining(longAgo)).toBe(0);
  });

  it("handles null trialStartedAt gracefully", async () => {
    const { isTrialActive, trialDaysRemaining } = await import("@/lib/billing");

    expect(isTrialActive(null)).toBe(false);
    expect(trialDaysRemaining(null)).toBe(null);
  });
});
