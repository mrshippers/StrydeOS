/**
 * POST /api/billing/seats
 *
 * Adds extra clinician seats to the clinic's existing Stripe subscription.
 * If the subscription already has an extra-seat line item, increments its quantity.
 * Otherwise, adds a new line item.
 *
 * Body:
 *   { quantity?: number }   — seats to add (default: 1)
 *
 * Returns: { success: true, extraSeats: number }
 *
 * Requires: Authorization: Bearer <Firebase ID token> (owner or admin)
 * Requires: An active Stripe subscription on the clinic.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { getStripe } from "@/lib/stripe";
import {
  getExtraSeatPriceId,
  getExtraSeatPriceEnvVar,
  INTERVAL_KEYS,
  type BillingInterval,
} from "@/lib/billing";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const { clinicId } = user;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic associated with this account" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const quantityToAdd = Math.max(1, Math.min(body.quantity ?? 1, 10)); // 1–10 seats per request

    const db = getAdminDb();
    const clinicSnap = await db.collection("clinics").doc(clinicId).get();
    if (!clinicSnap.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const clinic = clinicSnap.data()!;
    const subscriptionId: string | null = clinic.billing?.subscriptionId ?? null;
    const subStatus = clinic.billing?.subscriptionStatus;

    if (!subscriptionId || (subStatus !== "active" && subStatus !== "trialing")) {
      return NextResponse.json(
        { error: "An active subscription is required to purchase extra seats." },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });

    // Determine the billing interval from the primary subscription item
    const primaryItem = subscription.items.data[0];
    const subInterval = (primaryItem?.price?.recurring?.interval ?? "month") as BillingInterval;
    const interval: BillingInterval = INTERVAL_KEYS.includes(subInterval) ? subInterval : "month";

    // Build set of extra-seat price IDs to find existing line item
    const seatPriceIds = new Set<string>();
    for (const int of INTERVAL_KEYS) {
      try {
        seatPriceIds.add(getExtraSeatPriceId(int));
      } catch {
        // Env var not set for this interval — skip
      }
    }

    // Find existing extra-seat subscription item
    const existingSeatItem = subscription.items.data.find(
      (item) => seatPriceIds.has(typeof item.price === "string" ? item.price : item.price.id)
    );

    if (existingSeatItem) {
      // Increment quantity on existing line item
      const newQuantity = (existingSeatItem.quantity ?? 0) + quantityToAdd;
      await stripe.subscriptionItems.update(existingSeatItem.id, {
        quantity: newQuantity,
      });

      return NextResponse.json({ success: true, extraSeats: newQuantity });
    } else {
      // Add new extra-seat line item
      const seatPriceId = getExtraSeatPriceId(interval);
      await stripe.subscriptionItems.create({
        subscription: subscriptionId,
        price: seatPriceId,
        quantity: quantityToAdd,
      });

      return NextResponse.json({ success: true, extraSeats: quantityToAdd });
    }
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
