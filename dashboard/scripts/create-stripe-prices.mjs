#!/usr/bin/env node
/**
 * Creates all StrydeOS Stripe products and prices, then outputs
 * the env vars ready to paste into .env.local / Vercel dashboard.
 *
 * Usage:  node scripts/create-stripe-prices.mjs
 * Requires: STRIPE_SECRET_KEY in .env.local (test or live)
 */

import Stripe from "stripe";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env.local ────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
const envFile = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envFile
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const stripeKey = env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error("STRIPE_SECRET_KEY not found in .env.local");
  process.exit(1);
}

const stripe = new Stripe(stripeKey);

// ── Pricing table (pence, GBP) ────────────────────────────────────────────
const PRODUCTS = {
  intelligence: {
    name: "StrydeOS Intelligence",
    description: "Clinical performance dashboard — 8 validated KPIs, revenue analytics, outcome measures.",
    prices: {
      solo:   { month:  7900, year:  75840 },
      studio: { month: 12900, year: 123840 },
      clinic: { month: 19900, year: 191040 },
    },
  },
  ava: {
    name: "StrydeOS Ava",
    description: "AI voice receptionist — 24/7 inbound calls, calendar booking, cancellation recovery.",
    prices: {
      solo:   { month: 14900, year: 143040 },
      studio: { month: 19900, year: 191040 },
      clinic: { month: 29900, year: 287040 },
    },
  },
  pulse: {
    name: "StrydeOS Pulse",
    description: "Patient retention engine — automated sequences, HEP reminders, churn detection.",
    prices: {
      solo:   { month:  9900, year:  95040 },
      studio: { month: 14900, year: 143040 },
      clinic: { month: 22900, year: 219840 },
    },
  },
  fullstack: {
    name: "StrydeOS Full Stack",
    description: "Intelligence + Ava + Pulse — the complete clinical performance platform.",
    prices: {
      solo:   { month: 27900, year: 267840 },
      studio: { month: 39900, year: 383040 },
      clinic: { month: 59900, year: 575040 },
    },
  },
};

const EXTRA_SEAT = { month: 4900, year: 47040 };
const AVA_SETUP_FEE = 25000; // £250 one-time

// ── Create everything ──────────────────────────────────────────────────────
const envVars = {};

async function createRecurringPrice(productId, envPrefix, amountPence, interval) {
  const recurring = interval === "month"
    ? { interval: "month" }
    : { interval: "year" };

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amountPence,
    currency: "gbp",
    recurring,
    metadata: { source: "create-stripe-prices" },
  });

  const varName = `STRIPE_PRICE_${envPrefix}_${interval.toUpperCase()}`;
  envVars[varName] = price.id;
  console.log(`  ${varName}=${price.id}`);
}

async function run() {
  console.log(`\nUsing Stripe key: ${stripeKey.slice(0, 12)}...`);
  console.log(`Mode: ${stripeKey.startsWith("sk_live") ? "LIVE" : "TEST"}\n`);

  // ── Module products ──────────────────────────────────────────────────────
  for (const [key, config] of Object.entries(PRODUCTS)) {
    console.log(`Creating product: ${config.name}`);
    const product = await stripe.products.create({
      name: config.name,
      description: config.description,
      metadata: { module: key, source: "create-stripe-prices" },
    });
    console.log(`  Product ID: ${product.id}`);

    for (const [tier, amounts] of Object.entries(config.prices)) {
      const prefix = `${key.toUpperCase()}_${tier.toUpperCase()}`;
      await createRecurringPrice(product.id, prefix, amounts.month, "month");
      await createRecurringPrice(product.id, prefix, amounts.year, "year");
    }
    console.log();
  }

  // ── Ava setup fee (one-time) ─────────────────────────────────────────────
  console.log("Creating product: StrydeOS Ava Setup");
  const setupProduct = await stripe.products.create({
    name: "StrydeOS Ava Setup",
    description: "One-time Ava voice receptionist configuration fee.",
    metadata: { module: "ava_setup", source: "create-stripe-prices" },
  });

  const setupPrice = await stripe.prices.create({
    product: setupProduct.id,
    unit_amount: AVA_SETUP_FEE,
    currency: "gbp",
    metadata: { source: "create-stripe-prices" },
  });
  envVars["STRIPE_PRICE_AVA_SETUP"] = setupPrice.id;
  console.log(`  STRIPE_PRICE_AVA_SETUP=${setupPrice.id}\n`);

  // ── Extra seat add-on ────────────────────────────────────────────────────
  console.log("Creating product: StrydeOS Extra Seat");
  const seatProduct = await stripe.products.create({
    name: "StrydeOS Extra Clinician Seat",
    description: "Additional clinician seat beyond tier limit — £49/mo.",
    metadata: { module: "extra_seat", source: "create-stripe-prices" },
  });

  const seatMonthly = await stripe.prices.create({
    product: seatProduct.id,
    unit_amount: EXTRA_SEAT.month,
    currency: "gbp",
    recurring: { interval: "month" },
    metadata: { source: "create-stripe-prices" },
  });
  envVars["STRIPE_PRICE_EXTRA_SEAT_MONTH"] = seatMonthly.id;
  console.log(`  STRIPE_PRICE_EXTRA_SEAT_MONTH=${seatMonthly.id}`);

  const seatYearly = await stripe.prices.create({
    product: seatProduct.id,
    unit_amount: EXTRA_SEAT.year,
    currency: "gbp",
    recurring: { interval: "year" },
    metadata: { source: "create-stripe-prices" },
  });
  envVars["STRIPE_PRICE_EXTRA_SEAT_YEAR"] = seatYearly.id;
  console.log(`  STRIPE_PRICE_EXTRA_SEAT_YEAR=${seatYearly.id}`);

  // ── Output ───────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("COPY-PASTE BLOCK FOR .env.local:");
  console.log("=".repeat(60) + "\n");

  const sorted = Object.entries(envVars).sort(([a], [b]) => a.localeCompare(b));
  for (const [k, v] of sorted) {
    console.log(`${k}=${v}`);
  }

  console.log(`\n✓ Created ${sorted.length} price IDs across ${Object.keys(PRODUCTS).length + 2} products.`);
  console.log("Paste the block above into .env.local and Vercel env vars.\n");
}

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
