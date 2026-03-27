/**
 * POST /api/billing/webhooks
 *
 * Stripe webhook endpoint. Keeps Firestore featureFlags in sync with
 * the clinic's active Stripe subscription items.
 *
 * Stripe events handled:
 *   customer.subscription.created  → activate modules
 *   customer.subscription.updated  → update modules (add/remove)
 *   customer.subscription.deleted  → deactivate all modules
 *   invoice.payment_failed         → mark billing status (does NOT revoke access)
 *
 * Required env vars:
 *   STRIPE_WEBHOOK_SECRET  — whsec_... from Stripe Dashboard or CLI
 *
 * To test locally:
 *   stripe listen --forward-to localhost:3000/api/billing/webhooks
 */

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { flagsFromSubscriptionItems, getTierFromMetadata, countExtraSeatsFromItems } from "@/lib/billing";
import type { StripeSubscriptionStatus } from "@/types";
import { withRequestLog } from "@/lib/request-logger";

export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

async function handler(request: NextRequest) {
  if (!WEBHOOK_SECRET) {
    console.error("[Billing webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await request.text();
    event = getStripe().webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Billing webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── Idempotency: skip already-processed events (Stripe retries on 5xx) ──
  const dedupRef = getAdminDb().collection("_stripe_event_dedup").doc(event.id);
  const dedupSnap = await dedupRef.get();
  if (dedupSnap.exists) {
    return NextResponse.json({ received: true, deduplicated: true });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        break;
    }

    // Mark event as processed for idempotency
    await dedupRef.set({ processedAt: new Date().toISOString() });
  } catch (err) {
    console.error(`[Billing webhook] Error processing ${event.type}:`, err);
    Sentry.captureException(err, { tags: { stripeEvent: event.type } });

    // Distinguish transient errors (Firestore down, timeout) from logic errors.
    // Return 500 for transient so Stripe retries; 200 for non-recoverable.
    const msg = err instanceof Error ? err.message : String(err);
    const isTransient = msg.includes("UNAVAILABLE")
      || msg.includes("DEADLINE_EXCEEDED")
      || msg.includes("INTERNAL")
      || msg.includes("timeout")
      || msg.includes("ECONNRESET");

    if (isTransient) {
      return NextResponse.json(
        { error: "Transient error — please retry" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findClinicByCustomerId(customerId: string): Promise<{ id: string } | null> {
  const db = getAdminDb();
  const snap = await db
    .collection("clinics")
    .where("billing.stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id };
}

function resolveCustomerId(customer: Stripe.Subscription["customer"]): string {
  return typeof customer === "string" ? customer : customer.id;
}

const ACTIVE_SUB_STATUSES = ["active", "trialing"] as const;

/** Derive the latest period end from subscription items (Stripe v20 moved period to item level). */
function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): string {
  let maxEnd = 0;
  for (const item of subscription.items.data) {
    const end = (item as unknown as { current_period_end?: number }).current_period_end ?? 0;
    if (end > maxEnd) maxEnd = end;
  }
  if (maxEnd > 0) return new Date(maxEnd * 1000).toISOString();
  return new Date(subscription.billing_cycle_anchor * 1000).toISOString();
}

/** Collect all line items from every active/trialing subscription for this customer. */
async function getAllActiveSubscriptionItems(customerId: string): Promise<Array<{ price: { id: string }; quantity?: number }>> {
  const stripe = getStripe();
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });

  const items: Array<{ price: { id: string }; quantity?: number }> = [];
  for (const sub of subs.data) {
    if (!ACTIVE_SUB_STATUSES.includes(sub.status as (typeof ACTIVE_SUB_STATUSES)[number])) continue;
    for (const item of sub.items.data) {
      const priceId = typeof item.price === "string" ? item.price : item.price.id;
      items.push({ price: { id: priceId }, quantity: item.quantity ?? 1 });
    }
  }
  return items;
}

/** First active/trialing subscription for this customer, or null. */
async function getPrimaryActiveSubscription(
  customerId: string
): Promise<{ id: string; status: string; periodEndIso: string } | null> {
  const stripe = getStripe();
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const active = subs.data.find((s) =>
    ACTIVE_SUB_STATUSES.includes(s.status as (typeof ACTIVE_SUB_STATUSES)[number])
  );
  return active
    ? {
        id: active.id,
        status: active.status,
        periodEndIso: getSubscriptionPeriodEnd(active),
      }
    : null;
}

async function handleSubscriptionUpsert(subscription: Stripe.Subscription) {
  const customerId = resolveCustomerId(subscription.customer);

  const clinic = await findClinicByCustomerId(customerId);
  if (!clinic) {
    console.warn(`[Billing webhook] No clinic found for Stripe customer ${customerId}`);
    return;
  }

  // Merge all active/trialing subscriptions so "add another module" (second sub) doesn't overwrite the first
  const allItems = await getAllActiveSubscriptionItems(customerId);
  const updatedFlags = flagsFromSubscriptionItems(allItems);
  const extraSeats = countExtraSeatsFromItems(allItems);
  const status = subscription.status as StripeSubscriptionStatus;
  const now = new Date().toISOString();

  // Extract tier from subscription metadata (set at checkout)
  const tier = getTierFromMetadata(subscription.metadata as Record<string, string>);

  const db = getAdminDb();
  await db
    .collection("clinics")
    .doc(clinic.id)
    .update({
      featureFlags: updatedFlags,
      "billing.stripeCustomerId": customerId,
      "billing.subscriptionId": subscription.id,
      "billing.subscriptionStatus": status,
      "billing.currentPeriodEnd": getSubscriptionPeriodEnd(subscription),
      "billing.extraSeats": extraSeats,
      ...(tier ? { "billing.tier": tier } : {}),
      ...(status === "active" ? { "billing.paymentFailedAt": FieldValue.delete() } : {}),
      updatedAt: now,
    });

  Sentry.addBreadcrumb({
    category: "billing",
    message: `Clinic ${clinic.id} — sub ${subscription.id} ${status} (${allItems.length} items, ${extraSeats} extra seats)`,
    data: updatedFlags,
    level: "info",
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = resolveCustomerId(subscription.customer);

  const clinic = await findClinicByCustomerId(customerId);
  if (!clinic) {
    console.warn(`[Billing webhook] No clinic for customer ${customerId} (delete)`);
    return;
  }

  // Recompute flags from any remaining active subscriptions (customer may have multiple subs)
  const allItems = await getAllActiveSubscriptionItems(customerId);
  const updatedFlags = allItems.length > 0
    ? flagsFromSubscriptionItems(allItems)
    : { intelligence: false, continuity: false, receptionist: false };
  const extraSeats = allItems.length > 0 ? countExtraSeatsFromItems(allItems) : 0;

  const primary = allItems.length > 0 ? await getPrimaryActiveSubscription(customerId) : null;
  const tier = getTierFromMetadata(subscription.metadata as Record<string, string>);
  const db = getAdminDb();
  const now = new Date().toISOString();

  await db
    .collection("clinics")
    .doc(clinic.id)
    .update({
      featureFlags: updatedFlags,
      "billing.stripeCustomerId": customerId,
      "billing.subscriptionId": primary?.id ?? subscription.id,
      "billing.subscriptionStatus": (primary?.status as StripeSubscriptionStatus) ?? "canceled",
      "billing.currentPeriodEnd": primary
        ? primary.periodEndIso
        : getSubscriptionPeriodEnd(subscription),
      "billing.extraSeats": extraSeats,
      ...(tier ? { "billing.tier": tier } : {}),
      updatedAt: now,
    });

  Sentry.addBreadcrumb({
    category: "billing",
    message: `Clinic ${clinic.id} — sub ${subscription.id} deleted. Remaining: ${allItems.length}`,
    data: updatedFlags,
    level: "info",
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  const clinic = await findClinicByCustomerId(customerId);
  if (!clinic) return;

  // In Stripe v20 the subscription lives under invoice.parent.subscription_details.subscription
  const parent = invoice.parent as
    | { type: string; subscription_details?: { subscription?: string | Stripe.Subscription } }
    | null;
  const subscriptionRaw = parent?.subscription_details?.subscription;
  const subscriptionId =
    subscriptionRaw == null
      ? null
      : typeof subscriptionRaw === "string"
        ? subscriptionRaw
        : subscriptionRaw.id;

  const db = getAdminDb();
  await db
    .collection("clinics")
    .doc(clinic.id)
    .update({
      "billing.subscriptionStatus": "past_due",
      "billing.paymentFailedAt": new Date().toISOString(),
      ...(subscriptionId ? { "billing.subscriptionId": subscriptionId } : {}),
      updatedAt: new Date().toISOString(),
    });

  console.warn(`[Billing webhook] Clinic ${clinic.id} — payment failed, marked past_due`);
}

export const POST = withRequestLog(handler);
