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

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { withRequestLog } from "@/lib/request-logger";
import type { ResendDeliveryEvent, ResendEventType } from "@/lib/contracts";

export const runtime = "nodejs";

/** Reject events whose svix-timestamp is further than this from now (replay guard). */
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Svix-style signature, the scheme Resend actually signs with:
 * HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}` keyed by the
 * base64 portion of the `whsec_…` secret, compared against each
 * comma-separated `v1,<base64>` pair in the svix-signature header.
 */
function verifySvixSignature(rawBody: string, request: NextRequest, secret: string): boolean {
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const ts = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const secretBytes = Buffer.from(
    secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret,
    "base64",
  );
  const expected = createHmac("sha256", secretBytes)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest("base64");

  for (const part of svixSignature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

async function handler(request: NextRequest) {
  // Signature verification. Two failure modes, two policies:
  //   - SECRET NOT CONFIGURED on our side  → 200 + structured `config_missing`
  //     so Resend doesn't retry-storm us for a deploy bug. Logged loudly.
  //   - SIGNATURE MISMATCH on inbound request → 401 so the caller knows their
  //     signature is wrong (exfil attempt or stale rotation).
  // Read env at call time so tests and env reloads see the current value.
  const expectedSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error(
      "[CRITICAL] [resend-webhook] RESEND_WEBHOOK_SECRET not configured — refusing to process. Returning 200 to suppress retries; fix the deploy.",
    );
    return NextResponse.json(
      { error: "config_missing", reason: "RESEND_WEBHOOK_SECRET not configured" },
      { status: 200 },
    );
  }

  const rawBody = await request.text();

  if (!verifySvixSignature(rawBody, request, expectedSecret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get("clinicId");

  if (!clinicId) {
    return NextResponse.json({ error: "clinicId query param required" }, { status: 400 });
  }

  let event: ResendDeliveryEvent;
  try {
    event = JSON.parse(rawBody) as ResendDeliveryEvent;
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
