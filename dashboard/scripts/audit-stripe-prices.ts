/**
 * Audit Stripe Price IDs vs canonical MODULE_PRICING in src/lib/billing.ts.
 *
 * Run with:
 *   doppler run --project strydeos --config prd -- npx tsx scripts/audit-stripe-prices.ts
 *
 * Reports any mismatch between Stripe's live Price.unit_amount and the value
 * in MODULE_PRICING / AVA_SETUP_FEE_PENCE / EXTRA_SEAT_PRICING. Read-only.
 */

import Stripe from "stripe";
import {
  MODULE_PRICING,
  AVA_SETUP_FEE_PENCE,
  EXTRA_SEAT_PRICING,
  MODULE_KEYS,
  TIER_KEYS,
  INTERVAL_KEYS,
  getPriceEnvVar,
  getExtraSeatPriceEnvVar,
  type ProductKey,
} from "../src/lib/billing";

type Row = {
  envVar: string;
  priceId: string | null;
  expectedPence: number;
  actualPence: number | null;
  status: "OK" | "WRONG_AMOUNT" | "MISSING_ENV" | "PRICE_NOT_FOUND" | "ERROR";
  detail?: string;
};

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY missing — run via doppler run");
  const stripe = new Stripe(key);

  const rows: Row[] = [];
  const products: ProductKey[] = [...MODULE_KEYS, "fullstack"];

  for (const product of products) {
    for (const tier of TIER_KEYS) {
      for (const interval of INTERVAL_KEYS) {
        const envVar = getPriceEnvVar(product, tier, interval);
        const expected = MODULE_PRICING[product][tier][interval];
        rows.push(await check(stripe, envVar, expected));
      }
    }
  }

  rows.push(await check(stripe, "STRIPE_PRICE_AVA_SETUP", AVA_SETUP_FEE_PENCE));

  for (const interval of INTERVAL_KEYS) {
    rows.push(
      await check(
        stripe,
        getExtraSeatPriceEnvVar(interval),
        EXTRA_SEAT_PRICING[interval]
      )
    );
  }

  const wrong = rows.filter((r) => r.status !== "OK");
  const ok = rows.filter((r) => r.status === "OK");

  console.log(`\n========== STRIPE PRICE AUDIT ==========\n`);
  console.log(`✅ Correct:   ${ok.length}`);
  console.log(`❌ Mismatch:  ${wrong.length}`);
  console.log(`📊 Total:     ${rows.length}\n`);

  if (wrong.length > 0) {
    console.log(`---------- MISMATCHES ----------\n`);
    for (const r of wrong) {
      const exp = `£${(r.expectedPence / 100).toFixed(2)}`;
      const act = r.actualPence != null ? `£${(r.actualPence / 100).toFixed(2)}` : "—";
      console.log(
        `${r.status.padEnd(18)} ${r.envVar.padEnd(45)} expected ${exp.padEnd(8)} got ${act.padEnd(8)} ${r.detail ?? ""}`
      );
    }
    console.log("");
  }

  if (ok.length > 0) {
    console.log(`---------- CORRECT ----------\n`);
    for (const r of ok) {
      const exp = `£${(r.expectedPence / 100).toFixed(2)}`;
      console.log(`OK ${r.envVar.padEnd(45)} ${exp.padEnd(8)} ${r.priceId}`);
    }
  }
}

async function check(stripe: Stripe, envVar: string, expectedPence: number): Promise<Row> {
  const priceId = process.env[envVar];
  if (!priceId) {
    return { envVar, priceId: null, expectedPence, actualPence: null, status: "MISSING_ENV" };
  }
  try {
    const p = await stripe.prices.retrieve(priceId);
    const actual = p.unit_amount ?? null;
    if (actual === expectedPence) {
      return { envVar, priceId, expectedPence, actualPence: actual, status: "OK" };
    }
    return {
      envVar,
      priceId,
      expectedPence,
      actualPence: actual,
      status: "WRONG_AMOUNT",
      detail: `currency=${p.currency} active=${p.active}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      envVar,
      priceId,
      expectedPence,
      actualPence: null,
      status: msg.includes("No such price") ? "PRICE_NOT_FOUND" : "ERROR",
      detail: msg.slice(0, 80),
    };
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
