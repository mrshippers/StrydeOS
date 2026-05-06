/**
 * setup-stripe-products.ts
 *
 * Creates all StrydeOS products and prices in Stripe to match the pricing model:
 *   - 3 modules (Intelligence, Ava, Pulse) × 3 tiers × 2 intervals = 18 prices
 *   - 1 Full Stack bundle × 3 tiers × 2 intervals = 6 prices
 *   - 1 Ava one-time setup fee = 1 price
 *   Total: 25 prices across 5 products
 *
 * Usage (from dashboard dir, with STRIPE_SECRET_KEY in .env.local):
 *   npx tsx scripts/setup-stripe-products.ts
 *
 * The script loads .env.local and is idempotent — won't duplicate products/prices.
 * After running, copy the printed env block into .env.local (and STRIPE_WEBHOOK_SECRET for webhooks).
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import Stripe from "stripe";

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!SECRET_KEY) {
  console.error("❌  STRIPE_SECRET_KEY is not set.");
  process.exit(1);
}

const stripe = new Stripe(SECRET_KEY, { apiVersion: "2026-02-25.clover" });

// ─── Pricing table (pence, GBP) ───────────────────────────────────────────────
// Annual = 20% off monthly × 12

const PRICING = {
  intelligence: {
    solo:   { month:  6900, year:  66240 },
    studio: { month:  9900, year:  95040 },
    clinic: { month: 14900, year: 143040 },
  },
  ava: {
    solo:   { month:  9900, year:  95040 },
    studio: { month: 14900, year: 143040 },
    clinic: { month: 19900, year: 191040 },
  },
  pulse: {
    solo:   { month:  7900, year:  75840 },
    studio: { month:  9900, year:  95040 },
    clinic: { month: 14900, year: 143040 },
  },
  fullstack: {
    solo:   { month: 19900, year: 191040 },
    studio: { month: 29900, year: 287040 },
    clinic: { month: 39900, year: 383040 },
  },
} as const;

const TIER_LABELS = { solo: "Solo (1 clinician)", studio: "Studio (2–5 clinicians)", clinic: "Clinic (6+ clinicians)" };
const TIERS = ["solo", "studio", "clinic"] as const;
const INTERVALS = ["month", "year"] as const;

const PRODUCTS = [
  {
    key: "intelligence" as const,
    name: "StrydeOS — Intelligence",
    description: "Clinical performance dashboard. 8 validated KPIs, revenue analytics, DNA rate analysis, outcome measure trends, and NPS tracking.",
  },
  {
    key: "ava" as const,
    name: "StrydeOS — Ava",
    description: "AI voice receptionist powered by ElevenLabs. 24/7 inbound call handling, direct PMS booking, cancellation recovery.",
  },
  {
    key: "pulse" as const,
    name: "StrydeOS — Pulse",
    description: "Patient retention engine. Automated follow-up sequences, dropout prevention, outcome tracking, referral prompts.",
  },
  {
    key: "fullstack" as const,
    name: "StrydeOS — Full Stack",
    description: "All three modules: Intelligence + Ava + Pulse. Best value — one system, every metric, every call, every patient.",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function envVarName(product: string, tier: string, interval: string): string {
  return `STRIPE_PRICE_${product.toUpperCase()}_${tier.toUpperCase()}_${interval.toUpperCase()}`;
}

async function getOrCreateProduct(key: string, name: string, description: string): Promise<Stripe.Product> {
  const existing = await stripe.products.search({
    query: `metadata["strydeos_key"]:"${key}"`,
    limit: 1,
  });
  if (existing.data.length > 0) {
    console.log(`  ↳ Product exists: ${existing.data[0].id}`);
    return existing.data[0];
  }
  const product = await stripe.products.create({
    name,
    description,
    metadata: { strydeos_key: key },
  });
  console.log(`  ↳ Created product: ${product.id}`);
  return product;
}

async function getOrCreateRecurringPrice(
  productId: string,
  amount: number,
  interval: "month" | "year",
  metadataKey: string,
  nickname: string
): Promise<Stripe.Price> {
  const existing = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const match = existing.data.find(
    (p) => p.recurring?.interval === interval && p.unit_amount === amount && p.currency === "gbp"
  );
  if (match) {
    console.log(`    ↳ Price exists: ${match.id}  (${nickname})`);
    return match;
  }
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: "gbp",
    recurring: { interval },
    nickname,
    metadata: { strydeos_price_key: metadataKey },
  });
  console.log(`    ↳ Created price: ${price.id}  (${nickname})`);
  return price;
}

async function getOrCreateOneTimePrice(
  productId: string,
  amount: number,
  nickname: string
): Promise<Stripe.Price> {
  const existing = await stripe.prices.list({ product: productId, active: true, limit: 10 });
  const match = existing.data.find((p) => !p.recurring && p.unit_amount === amount && p.currency === "gbp");
  if (match) {
    console.log(`    ↳ Price exists: ${match.id}  (${nickname})`);
    return match;
  }
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: "gbp",
    nickname,
    metadata: { strydeos_price_key: "ava_setup" },
  });
  console.log(`    ↳ Created price: ${price.id}  (${nickname})`);
  return price;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔧  Setting up StrydeOS Stripe products & prices...\n");

  const envLines: string[] = [];

  // ── Module + Full Stack recurring prices ──
  for (const product of PRODUCTS) {
    console.log(`\n📦  ${product.name}`);
    const stripeProduct = await getOrCreateProduct(product.key, product.name, product.description);
    const pricing = PRICING[product.key];

    for (const tier of TIERS) {
      for (const interval of INTERVALS) {
        const amount = pricing[tier][interval];
        const varName = envVarName(product.key, tier, interval);
        const gbp = (amount / 100).toFixed(2);
        const intervalLabel = interval === "month" ? "/mo" : "/yr";
        const nickname = `${product.key} · ${TIER_LABELS[tier]} · £${gbp}${intervalLabel}`;
        const price = await getOrCreateRecurringPrice(stripeProduct.id, amount, interval, varName.toLowerCase(), nickname);
        envLines.push(`${varName}=${price.id}`);
      }
    }
  }

  // ── Ava setup fee (one-time) ──
  console.log(`\n💳  Ava — Setup Fee (one-time)`);
  const avaSetupProduct = await getOrCreateProduct(
    "ava_setup",
    "StrydeOS — Ava Setup Fee",
    "One-time onboarding and configuration fee for the Ava AI voice receptionist module."
  );
  const avaSetupPrice = await getOrCreateOneTimePrice(avaSetupProduct.id, 19500, "Ava setup fee · £195");
  envLines.push(`STRIPE_PRICE_AVA_SETUP=${avaSetupPrice.id}`);

  // ── Extra Clinician Seat (per-seat add-on) ──
  console.log(`\n👤  Extra Clinician Seat (per-seat add-on)`);
  const seatProduct = await getOrCreateProduct(
    "extra_seat",
    "StrydeOS — Extra Clinician Seat",
    "Additional clinician seat above the tier-included cap. £49/mo per seat (20% off annual)."
  );
  const seatMonthPrice = await getOrCreateRecurringPrice(
    seatProduct.id, 4900, "month", "extra_seat_month", "Extra seat · £49/mo"
  );
  envLines.push(`STRIPE_PRICE_EXTRA_SEAT_MONTH=${seatMonthPrice.id}`);
  const seatYearPrice = await getOrCreateRecurringPrice(
    seatProduct.id, 47040, "year", "extra_seat_year", "Extra seat · £470.40/yr"
  );
  envLines.push(`STRIPE_PRICE_EXTRA_SEAT_YEAR=${seatYearPrice.id}`);

  // ── Output ──
  console.log("\n" + "─".repeat(60));
  console.log("✅  Done. Copy this block into your .env.local:\n");
  console.log(envLines.join("\n"));
  console.log("\n" + "─".repeat(60));
  console.log("\nNext steps:");
  console.log("  1. Paste the block above into .env.local (keep STRIPE_SECRET_KEY and add STRIPE_WEBHOOK_SECRET).");
  console.log("  2. Local dev: run 'stripe listen --forward-to localhost:3000/api/billing/webhooks' and set STRIPE_WEBHOOK_SECRET from the whsec_... value in the output.");
  console.log("  3. Production: add the same price IDs + STRIPE_WEBHOOK_SECRET in Vercel; register the webhook URL in Stripe Dashboard (customer.subscription.*, invoice.payment_failed).");
  console.log("  4. Restart dev server: npm run dev\n");
}

main().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
