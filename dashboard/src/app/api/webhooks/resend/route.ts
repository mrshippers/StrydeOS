/**
 * POST /api/webhooks/resend
 *
 * Receives Resend email event webhooks (application/json).
 * Finds the matching comms_log entry by resendId and updates the relevant field.
 *
 * Query params:
 *   clinicId — required; scopes the Firestore lookup to the correct clinic
 *
 * Resend body:
 *   { type: string, data: { email_id: string, opened_at?: string, clicked_at?: string } }
 *
 * Event mapping:
 *   email.opened    → set openedAt
 *   email.clicked   → set clickedAt
 *   email.delivered → outcome = "delivered"
 *   email.bounced   → outcome = "send_failed"
 *   email.complained → outcome = "send_failed"
 *   (all others)    → ignore, return 200
 */

import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { withRequestLog } from "@/lib/request-logger";
import type { ResendDeliveryEvent, ResendEventType } from "@/lib/contracts";

export const runtime = "nodejs";

async function handler(request: NextRequest) {
  // Shared-secret verification — warn-only if env var not set (existing deployments
  // predate the secret and we don't want to break them on rollout).
  // Read env at call time so tests and env reloads see the current value.
  const expectedSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (expectedSecret) {
    const incomingSecret =
      request.headers.get("x-resend-signature") ??
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (
      !incomingSecret ||
      incomingSecret.length !== expectedSecret.length ||
      !crypto.timingSafeEqual(Buffer.from(incomingSecret), Buffer.from(expectedSecret))
    ) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  } else {
    console.warn(
      "[resend-webhook] RESEND_WEBHOOK_SECRET not set — accepting all requests. Configure the secret to enable verification.",
    );
  }

  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get("clinicId");

  if (!clinicId) {
    return NextResponse.json({ error: "clinicId query param required" }, { status: 400 });
  }

  let event: ResendDeliveryEvent;
  try {
    event = (await request.json()) as ResendDeliveryEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Determine what update to apply. Discriminate on `event.type` so the
  // typed payload variant narrows `event.data` to the matching shape.
  let update: Record<string, string> | null = null;
  let emailId: string | undefined;

  switch (event.type) {
    case "email.opened":
      update = { openedAt: event.data.opened_at ?? new Date().toISOString() };
      emailId = event.data.email_id;
      break;
    case "email.clicked":
      update = { clickedAt: event.data.clicked_at ?? new Date().toISOString() };
      emailId = event.data.email_id;
      break;
    case "email.delivered":
      update = { outcome: "delivered" };
      emailId = event.data.email_id;
      break;
    case "email.bounced":
    case "email.complained":
      update = { outcome: "send_failed" };
      emailId = event.data.email_id;
      break;
    default:
      // Unknown / unhandled event type — acknowledge silently
      return new NextResponse(null, { status: 200 });
  }

  if (!emailId || !update) {
    return new NextResponse(null, { status: 200 });
  }

  const db = getAdminDb();
  const snap = await db
    .collection("clinics")
    .doc(clinicId)
    .collection("comms_log")
    .where("resendId", "==", emailId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await snap.docs[0].ref.update(update);
  }

  return new NextResponse(null, { status: 200 });
}

export const POST = withRequestLog(handler);
