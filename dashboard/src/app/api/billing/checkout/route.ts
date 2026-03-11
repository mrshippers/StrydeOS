/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session for a new module subscription.
 * Use this when the clinic has no active subscription yet.
 * For managing an existing subscription, use /api/billing/portal.
 *
 * Body:
 *   modules: Array<"intelligence" | "pulse" | "ava"> | "fullstack"
 *   tier:    "solo" | "studio" | "clinic"   (default: "studio")
 *   period:  "monthly" | "annual"           (default: "monthly")
 *
 * Returns: { url: string }
 *
 * Requires: Authorization: Bearer <Firebase ID token> (owner or admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { getStripe } from "@/lib/stripe";
import {
  getPriceId,
  getAvaSetupPriceId,
  MODULE_KEYS,
  TIER_KEYS,
  PERIOD_KEYS,
  type ModuleKey,
  type TierKey,
  type PeriodKey,
} from "@/lib/billing";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const { clinicId } = user;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic associated with this account" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));

    // Tier and period
    const tier: TierKey = (TIER_KEYS as readonly string[]).includes(body.tier)
      ? (body.tier as TierKey)
      : "studio";

    const period: PeriodKey = (PERIOD_KEYS as readonly string[]).includes(body.period)
      ? (body.period as PeriodKey)
      : "monthly";

    // Module selection: either "fullstack" or an array of ModuleKey
    const isFullStack = body.modules === "fullstack" || body.fullstack === true;
    const modules: ModuleKey[] = isFullStack
      ? []
      : ((body.modules ?? []) as string[]).filter((m): m is ModuleKey =>
          (MODULE_KEYS as readonly string[]).includes(m)
        );

    if (!isFullStack && modules.length === 0) {
      return NextResponse.json({ error: "At least one module must be selected" }, { status: 400 });
    }

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

    // Build line items
    const lineItems: { price: string; quantity: 1 }[] = [];

    if (isFullStack) {
      lineItems.push({ price: getPriceId("fullstack", tier, period), quantity: 1 });
    } else {
      for (const module of modules) {
        lineItems.push({ price: getPriceId(module, tier, period), quantity: 1 });
      }
    }

    // Ava requires a one-time setup fee as a separate line item
    const includesAva = isFullStack || modules.includes("ava");
    if (includesAva) {
      try {
        lineItems.push({ price: getAvaSetupPriceId(), quantity: 1 });
      } catch {
        // Setup fee env var not configured — skip (warn in dev)
        if (process.env.NODE_ENV !== "production") {
          console.warn("[Billing checkout] STRIPE_PRICE_AVA_SETUP not set — skipping setup fee");
        }
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: lineItems,
      success_url: `${APP_URL}/billing?checkout=success`,
      cancel_url: `${APP_URL}/billing?checkout=canceled`,
      metadata: { clinicId, tier, period },
      subscription_data: {
        metadata: { clinicId, tier, period },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    return handleApiError(e);
  }
}
