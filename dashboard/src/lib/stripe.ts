/**
 * Stripe server singleton.
 *
 * Import this only from server-side code (API routes, Server Actions).
 * Never import in client components.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY   — Stripe secret key (sk_live_... or sk_test_...)
 */

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    _stripe = new Stripe(key, {
      apiVersion: "2026-02-25.clover",
    });
  }
  return _stripe;
}
