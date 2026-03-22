/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Customer Portal session for the authenticated clinic.
 * Use this to let clinic owners manage their subscription (add/remove modules,
 * update payment method, view invoices, cancel).
 *
 * The Customer Portal must be configured in the Stripe Dashboard to allow
 * subscription item updates. See billing setup notes.
 *
 * Body: {} (clinicId comes from the verified token)
 * Returns: { url: string }
 *
 * Requires: Authorization: Bearer <Firebase ID token> (owner or admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { getStripe } from "@/lib/stripe";
import { withRequestLog } from "@/lib/request-logger";

function getAppUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error("APP_URL environment variable is not configured");
  return url;
}

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const { clinicId } = user;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic associated with this account" }, { status: 400 });
    }

    const db = getAdminDb();
    const clinicSnap = await db.collection("clinics").doc(clinicId).get();

    if (!clinicSnap.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const stripeCustomerId: string | null =
      clinicSnap.data()?.billing?.stripeCustomerId ?? null;

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found. Start a subscription first." },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${getAppUrl()}/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
