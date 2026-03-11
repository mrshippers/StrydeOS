/**
 * setup-stripe-products.ts
 *
 * Creates all StrydeOS products and prices in Stripe.
 * Idempotent — safe to run multiple times.
 *
 * Products created:
 *   Intelligence, Pulse, Ava, Full Stack (all 3), Ava Setup Fee (one-time)
 *
 * Prices per subscription product:
 *   3 tiers (Solo/Studio/Clinic) × 2 periods (monthly/annual) = 6 prices each
 *
 * Pricing (£, from pricing breakdown model v2.0):
 *   Solo:   Intelligence £79  | Pulse £99  | Ava £149 | Full Stack £279
 *   Studio: Intelligence £129 | Pulse £149 | Ava £199 | Full Stack £399
 *   Clinic: Intelligence £199 | Pulse £229 | Ava £299 | Full Stack £599
 *   Annual: 20% discount applied to all above
 *   Ava setup fee: £250 one-time (all tiers)
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx ts-node --skip-project scripts/setup-stripe-products.ts
 *
 * After running, copy the printed env var block into .env.local.
 */

import Stripe from "stripe";

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!SECRET_KEY) {
  console.error("❌  STRIPE_SECRET_KEY is not set.");
  process.exit(1);
}

const stripe = new Stripe(SECRET_KEY, { apiVersion: "2026-02-25.clover" });

// ─── Pricing table (pence) ────────────────────────────────────────────────────

const MONTHLY_PRICES = {
  intelligence: { solo: 7900,  studio: 12900, clinic: 19900 },
  pulse:        { solo: 9900,  studio: 14900, clinic: 22900 },
  ava:          { solo: 14900, studio: 19900, clinic: 29900 },
  fullstack:    { solo: 27900, studio: 39900, clinic: 59900 },
} as const;

const ANNUAL_DISCOUNT = 0.20;
const AVA_SETUP_FEE = 25000; // £250 one-time

type ModuleId = keyof typeof MONTHLY_PRICES;
type TierId = "solo" | "studio" | "clinic";

const MODULES: { id: ModuleId; name: string; description: string; envPrefix: string }[] = [
  {
    id: "intelligence",
    name: "StrydeOS — Intelligence",
    description:
      "Clinical performance dashboard. 8 validated KPIs, revenue analytics, DNA rate analysis, outcome measure trends, and NPS tracking.",
    envPrefix: "STRIPE_PRICE_INTELLIGENCE",
  },
  {
    id: "pulse",
    name: "StrydeOS — Pulse",
    description:
      "Patient continuity engine. Post-session follow-up sequences, dropout prevention, outcome tracking, and referral prompts.",
    envPrefix: "STRIPE_PRICE_PULSE",
  },
  {
    id: "ava",
    name: "StrydeOS — Ava",
    description:
      "AI voice receptionist. 24/7 inbound call handling, direct calendar booking, no-show recovery, and PMS write-back.",
    envPrefix: "STRIPE_PRICE_AVA",
  },
  {
    id: "fullstack",
    name: "StrydeOS — Full Stack",
    description:
      "Intelligence + Pulse + Ava. One system for every metric, every call, every patient. Best value bundle.",
    envPrefix: "STRIPE_PRICE_FULLSTACK",
  },
];

const TIERS: TierId[] = ["solo", "studio", "clinic"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getOrCreateProduct(moduleId: string, name: string, description: string): Promise<Stripe.Product> {
  const existing = await stripe.products.search({
    query: `metadata["strydeos_module"]:"${moduleId}"`,
    limit: 1,
  });
  if (existing.data.length > 0) {
    console.log(`  ↳ Product exists: ${name} (${existing.data[0].id})`);
    return existing.data[0];
  }
  const product = await stripe.products.create({
    name,
    description,
    metadata: { strydeos_module: moduleId },
  });
  console.log(`  ↳ Created product: ${name} (${product.id})`);
  return product;
}

async function getOrCreatePrice(
  productId: string,
  unitAmount: number,
  currency: string,
  interval: "month" | "year" | null,
  metadata: Record<string, string>
): Promise<Stripe.Price> {
  const existingList = await stripe.prices.list({ product: productId, active: true, limit: 100 });

  const match = existingList.data.find((p) => {
    if (p.unit_amount !== unitAmount || p.currency !== currency) return false;
    if (interval === null) return p.type === "one_time";
    return p.type === "recurring" && p.recurring?.interval === interval;
  });

  if (match) {
    return match;
  }

  const priceData: Stripe.PriceCreateParams = {
    product: productId,
    unit_amount: unitAmount,
    currency,
    metadata,
  };

  if (interval !== null) {
    priceData.recurring = { interval };
  }

  return await stripe.prices.create(priceData);
}

function annualAmount(monthly: number): number {
  return Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));
}

function fmt(pence: number): string {
  return `£${(pence / 100).toFixed(0)}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔧  Setting up StrydeOS Stripe products & prices...\n");

  const envLines: string[] = [];

  // ── Subscription products (Intelligence, Pulse, Ava, Full Stack) ─────────
  for (const mod of MODULES) {
    console.log(`\n📦  ${mod.name}`);
    const product = await getOrCreateProduct(mod.id, mod.name, mod.description);

    for (const tier of TIERS) {
      const monthlyAmt = MONTHLY_PRICES[mod.id][tier];
      const annualAmt = annualAmount(monthlyAmt);
      const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

      // Monthly
      const monthlyPrice = await getOrCreatePrice(
        product.id,
        monthlyAmt,
        "gbp",
        "month",
        { strydeos_module: mod.id, strydeos_tier: tier, strydeos_period: "monthly" }
      );
      console.log(
        `     ${tierLabel} monthly: ${fmt(monthlyAmt)}/mo → ${monthlyPrice.id}`
      );
      envLines.push(`${mod.envPrefix}_${tier.toUpperCase()}_MONTHLY=${monthlyPrice.id}`);

      // Annual (billed as single yearly charge)
      const annualPrice = await getOrCreatePrice(
        product.id,
        annualAmt,
        "gbp",
        "year",
        { strydeos_module: mod.id, strydeos_tier: tier, strydeos_period: "annual" }
      );
      console.log(
        `     ${tierLabel} annual:  ${fmt(annualAmt)}/yr (${fmt(monthlyAmt * 12)} - 20%) → ${annualPrice.id}`
      );
      envLines.push(`${mod.envPrefix}_${tier.toUpperCase()}_ANNUAL=${annualPrice.id}`);
    }
  }

  // ── Ava one-time setup fee ─────────────────────────────────────────────────
  console.log(`\n💰  Ava Setup Fee (one-time)`);
  const avaProduct = (
    await stripe.products.search({
      query: 'metadata["strydeos_module"]:"ava"',
      limit: 1,
    })
  ).data[0];

  if (avaProduct) {
    const setupPrice = await getOrCreatePrice(
      avaProduct.id,
      AVA_SETUP_FEE,
      "gbp",
      null,
      { strydeos_module: "ava", strydeos_price_type: "setup" }
    );
    console.log(`     £250 one-time setup fee → ${setupPrice.id}`);
    envLines.push(`STRIPE_PRICE_AVA_SETUP=${setupPrice.id}`);
  }

  // ── Print env var block ────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(72));
  console.log("✅  Done. Copy these into .env.local:\n");
  console.log(envLines.join("\n"));
  console.log("\n" + "─".repeat(72));
  console.log("\nNext steps:");
  console.log("  1. Paste the price IDs above into .env.local");
  console.log("  2. Forward webhooks:");
  console.log("       stripe listen --forward-to localhost:3000/api/billing/webhooks");
  console.log("  3. Copy the whsec_... into STRIPE_WEBHOOK_SECRET in .env.local");
  console.log("  4. Restart dev server: npm run dev\n");
}

main().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
