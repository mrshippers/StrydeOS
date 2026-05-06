/**
 * Create a 100% off coupon + promotion code for E2E testing.
 *
 * Run: doppler run --project strydeos --config prd -- npx tsx scripts/create-test-coupon.ts
 *
 * Idempotent — if coupon/promo already exist, prints their IDs and exits.
 */

import Stripe from "stripe";

const COUPON_ID = "tgt-e2e-100";
const PROMO_CODE = "TGTE2E100";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY missing — run via doppler run");
  const stripe = new Stripe(key);

  let coupon: Stripe.Coupon;
  try {
    coupon = await stripe.coupons.retrieve(COUPON_ID);
    console.log(`Coupon already exists: ${coupon.id} (${coupon.percent_off}% off, duration=${coupon.duration})`);
  } catch {
    coupon = await stripe.coupons.create({
      id: COUPON_ID,
      percent_off: 100,
      duration: "forever",
      name: "TGT E2E test (100% off)",
    });
    console.log(`Coupon created: ${coupon.id}`);
  }

  const existing = await stripe.promotionCodes.list({ code: PROMO_CODE, limit: 1 });
  let promo: Stripe.PromotionCode;
  if (existing.data.length > 0) {
    promo = existing.data[0];
    console.log(`Promotion code already exists: ${promo.code} (active=${promo.active})`);
  } else {
    promo = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: PROMO_CODE,
      max_redemptions: 5,
      metadata: { purpose: "e2e-test" },
    });
    console.log(`Promotion code created: ${promo.code}`);
  }

  console.log(`\n→ Use code "${PROMO_CODE}" at Stripe checkout for 100% off`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
