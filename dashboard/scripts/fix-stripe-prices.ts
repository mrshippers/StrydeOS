/**
 * Fix mismatched Stripe Prices to match canonical MODULE_PRICING in billing.ts.
 *
 * For each mismatch found by audit, creates a new Stripe Price with the correct
 * unit_amount on the same Stripe Product, then updates the env var in Doppler
 * and Vercel (production). Old Prices are NOT archived (Stripe Prices on active
 * subscriptions can keep billing — leave them so existing customers are unaffected).
 *
 * Run:
 *   doppler run --project strydeos --config prd -- npx tsx scripts/fix-stripe-prices.ts          # dry-run
 *   doppler run --project strydeos --config prd -- npx tsx scripts/fix-stripe-prices.ts --apply  # do it
 */

import Stripe from "stripe";
import { execFileSync } from "child_process";
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

const APPLY = process.argv.includes("--apply");

type Plan = {
  envVar: string;
  oldPriceId: string;
  expectedPence: number;
  actualPence: number;
};

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY missing — run via doppler run");
  const stripe = new Stripe(key);

  const targets: Array<{ envVar: string; expected: number }> = [];
  const products: ProductKey[] = [...MODULE_KEYS, "fullstack"];
  for (const product of products) {
    for (const tier of TIER_KEYS) {
      for (const interval of INTERVAL_KEYS) {
        targets.push({
          envVar: getPriceEnvVar(product, tier, interval),
          expected: MODULE_PRICING[product][tier][interval],
        });
      }
    }
  }
  targets.push({ envVar: "STRIPE_PRICE_AVA_SETUP", expected: AVA_SETUP_FEE_PENCE });
  for (const interval of INTERVAL_KEYS) {
    targets.push({
      envVar: getExtraSeatPriceEnvVar(interval),
      expected: EXTRA_SEAT_PRICING[interval],
    });
  }

  console.log(`\n========== STRIPE PRICE FIX  (${APPLY ? "APPLY" : "DRY RUN"}) ==========\n`);
  const plans: Plan[] = [];

  for (const t of targets) {
    const oldPriceId = process.env[t.envVar];
    if (!oldPriceId) {
      console.log(`SKIP   ${t.envVar} (env var missing)`);
      continue;
    }
    const old = await stripe.prices.retrieve(oldPriceId);
    if (old.unit_amount === t.expected) continue; // already correct
    plans.push({
      envVar: t.envVar,
      oldPriceId,
      expectedPence: t.expected,
      actualPence: old.unit_amount ?? 0,
    });
  }

  console.log(`Plan: ${plans.length} prices to recreate\n`);
  for (const p of plans) {
    const oldGbp = `£${(p.actualPence / 100).toFixed(2)}`;
    const newGbp = `£${(p.expectedPence / 100).toFixed(2)}`;
    console.log(`  ${p.envVar.padEnd(45)} ${oldGbp.padEnd(10)} → ${newGbp}`);
  }
  console.log("");

  if (!APPLY) {
    console.log("(dry run — re-run with --apply to execute)\n");
    return;
  }

  for (const p of plans) {
    process.stdout.write(`  ${p.envVar.padEnd(45)} `);

    const old = await stripe.prices.retrieve(p.oldPriceId);
    const productId = typeof old.product === "string" ? old.product : old.product.id;

    const newPrice = await stripe.prices.create({
      currency: old.currency,
      unit_amount: p.expectedPence,
      product: productId,
      ...(old.recurring
        ? {
            recurring: {
              interval: old.recurring.interval,
              interval_count: old.recurring.interval_count,
            },
          }
        : {}),
    });

    process.stdout.write(`stripe ✓ (${newPrice.id}) `);

    setDoppler(p.envVar, newPrice.id);
    process.stdout.write(`doppler ✓ `);

    setVercel(p.envVar, newPrice.id);
    process.stdout.write(`vercel ✓\n`);
  }

  console.log(`\nDone. Redeploy required for new env vars to take effect.\n`);
}

function setDoppler(name: string, value: string) {
  execFileSync(
    "doppler",
    [
      "secrets",
      "set",
      `${name}=${value}`,
      "--project",
      "strydeos",
      "--config",
      "prd",
      "--no-interactive",
      "--silent",
    ],
    { stdio: "ignore" }
  );
}

function setVercel(name: string, value: string) {
  // Remove first (Vercel CLI rejects add when var exists)
  try {
    execFileSync("vercel", ["env", "rm", name, "production", "-y"], { stdio: "ignore" });
  } catch {
    // ignore if not present
  }
  execFileSync("bash", ["-c", `echo -n "${value}" | vercel env add ${name} production`], {
    stdio: "ignore",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
