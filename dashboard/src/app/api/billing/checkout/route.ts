/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session for module subscriptions.
 *
 * Body:
 *   {
 *     modules: Array<"intelligence" | "pulse" | "ava" | "fullstack">
 *     tier: "solo" | "studio" | "clinic"          (default: "studio")
 *     interval: "month" | "year"                  (default: "month")
 *     includeAvaSetup?: boolean                   (adds £195 one-time fee if ava or fullstack selected)
 *     successPath?: string                        (path to redirect after success, default: "/billing?checkout=success")
 *     cancelPath?: string                         (path to redirect after cancel, default: "/billing?checkout=canceled")
 *   }
 *
 * Returns: { url: string }
 *
 * Requires: Authorization: Bearer <Firebase ID token> (owner or admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { getStripe } from "@/lib/stripe";
import {
  getPriceId,
  getAvaSetupFeePriceId,
  AVA_SETUP_FEE_PENCE,
  MODULE_KEYS,
  TIER_KEYS,
  INTERVAL_KEYS,
  type ModuleKey,
  type TierKey,
  type BillingInterval,
} from "@/lib/billing";
import { withRequestLog } from "@/lib/request-logger";

function getAppUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error("APP_URL environment variable is not configured");
  return url;
}

/** Validate and resolve a redirect path. Must start with "/" and be a safe relative path. */
function resolveRedirectUrl(basePath: string | undefined, fallback: string): string {
  const appUrl = getAppUrl();
  if (!basePath || typeof basePath !== "string") return `${appUrl}${fallback}`;
  // Prevent open redirects: must start with "/" and not "//"
  const trimmed = basePath.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return `${appUrl}${fallback}`;
  return `${appUrl}${trimmed}`;
}

type CheckoutProduct = ModuleKey | "fullstack";

async function handler(request: NextRequest) {
  // Rate limit: 5 requests per IP per 60 seconds
  const { limited, remaining } = checkRateLimit(request, { limit: 5, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const { clinicId } = user;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic associated with this account" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));

    // Validate modules
    const validProducts: readonly string[] = [...MODULE_KEYS, "fullstack"];
    const modules: CheckoutProduct[] = (body.modules ?? []).filter((m: string) =>
      validProducts.includes(m)
    );
    if (modules.length === 0) {
      return NextResponse.json({ error: "At least one module must be selected" }, { status: 400 });
    }

    // Validate tier and interval (default to studio/month)
    const tier: TierKey = TIER_KEYS.includes(body.tier) ? body.tier : "studio";
    const interval: BillingInterval = INTERVAL_KEYS.includes(body.interval) ? body.interval : "month";
    const includeAvaSetup: boolean = !!body.includeAvaSetup;

    const stripe = getStripe();
    const db = getAdminDb();
    const clinicRef = db.collection("clinics").doc(clinicId);
    const clinicSnap = await clinicRef.get();

    if (!clinicSnap.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const clinicData = clinicSnap.data()!;
    let stripeCustomerId: string | null = clinicData.billing?.stripeCustomerId ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: clinicData.ownerEmail ?? user.email,
        name: clinicData.name ?? clinicId,
        metadata: { clinicId },
      });
      stripeCustomerId = customer.id;
      await clinicRef.set(
        { billing: { stripeCustomerId, subscriptionId: null, subscriptionStatus: null, currentPeriodEnd: null } },
        { merge: true }
      );
    }

    // Build recurring line items
    const lineItems: { price: string; quantity: number }[] = modules.map((module) => {
      try {
        return {
          price: getPriceId(module, tier, interval),
          quantity: 1,
        };
      } catch (_e) {
        const varName = `STRIPE_PRICE_${module.toUpperCase()}_${tier.toUpperCase()}_${interval.toUpperCase()}`;
        throw new Error(`Missing or invalid Stripe configuration: ${varName} is not set`);
      }
    });

    // Add Ava one-time setup fee when Ava or Full Stack is selected
    const needsAvaSetup = includeAvaSetup && modules.some((m) => m === "ava" || m === "fullstack");
    if (needsAvaSetup) {
      try {
        lineItems.push({ price: getAvaSetupFeePriceId(), quantity: 1 });
      } catch (_e) {
        throw new Error("Ava module is not properly configured. Contact support.");
      }
    }

    // Hot-add path: clinic already has an active subscription → append items
    // instead of creating a second parallel subscription via Checkout.
    const existingSubId: string | null = clinicData.billing?.subscriptionId ?? null;
    const existingSubStatus = clinicData.billing?.subscriptionStatus;
    const hasActiveSubscription =
      !!existingSubId && (existingSubStatus === "active" || existingSubStatus === "trialing");

    if (hasActiveSubscription) {
      const existingSub = await stripe.subscriptions.retrieve(existingSubId!, {
        expand: ["items.data.price"],
      });
      const existingPriceIds = new Set(
        existingSub.items.data.map((i) => (typeof i.price === "string" ? i.price : i.price.id))
      );

      const recurringPriceIds = modules.map((module) => getPriceId(module, tier, interval));

      const added: string[] = [];
      for (const priceId of recurringPriceIds) {
        if (existingPriceIds.has(priceId)) continue;
        await stripe.subscriptionItems.create({
          subscription: existingSubId!,
          price: priceId,
          quantity: 1,
          proration_behavior: "create_prorations",
        });
        added.push(priceId);
      }

      // Setup fee is one-time → attach as pending invoice item; swept onto next invoice.
      if (needsAvaSetup && added.length > 0) {
        // Reference the setup fee price to keep validation consistent (throws if env missing)
        getAvaSetupFeePriceId();
        await stripe.invoiceItems.create({
          customer: stripeCustomerId,
          amount: AVA_SETUP_FEE_PENCE,
          currency: "gbp",
          description: "Ava one-time setup fee (£195)",
        });
      }

      return NextResponse.json({
        success: true,
        added,
        message: added.length === 0 ? "Modules already active" : "Modules added to existing subscription",
      });
    }

    // No active subscription → create new Checkout Session
    const successUrl = resolveRedirectUrl(body.successPath, "/billing?checkout=success");
    const cancelUrl = resolveRedirectUrl(body.cancelPath, "/billing?checkout=canceled");

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      // Skip card capture when total is £0 (e.g. 100% off promo, full trial).
      // Customer can add a card via the Customer Portal before charges resume.
      payment_method_collection: "if_required",
      metadata: { clinicId, tier, interval },
      subscription_data: {
        metadata: { clinicId, tier, interval },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
