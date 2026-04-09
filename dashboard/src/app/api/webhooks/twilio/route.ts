/**
 * POST /api/webhooks/twilio
 *
 * Receives Twilio message delivery status callbacks (application/x-www-form-urlencoded).
 * Finds the matching comms_log entry by twilioSid and updates outcome.
 *
 * Query params:
 *   clinicId — required; scopes the Firestore lookup to the correct clinic
 *
 * Twilio body fields:
 *   MessageSid    — the message SID (matches comms_log.twilioSid)
 *   MessageStatus — delivered | undelivered | failed | sent | queued | sending
 *
 * Status mapping:
 *   delivered                    → outcome = "delivered"
 *   undelivered | failed         → outcome = "send_failed"
 *   sent | queued | sending      → no update (still in-flight)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { withRequestLog } from "@/lib/request-logger";

export const runtime = "nodejs";

type CommsOutcome = "delivered" | "send_failed";

const STATUS_TO_OUTCOME: Record<string, CommsOutcome | null> = {
  delivered: "delivered",
  undelivered: "send_failed",
  failed: "send_failed",
  sent: null,
  queued: null,
  sending: null,
};

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get("clinicId");

  if (!clinicId) {
    return NextResponse.json({ error: "clinicId query param required" }, { status: 400 });
  }

  let formData: URLSearchParams;
  try {
    const text = await request.text();
    formData = new URLSearchParams(text);
  } catch {
    return NextResponse.json({ error: "Invalid form body" }, { status: 400 });
  }

  const messageSid = formData.get("MessageSid");
  const messageStatus = formData.get("MessageStatus");

  if (!messageSid) {
    return NextResponse.json({ error: "MessageSid required" }, { status: 400 });
  }

  // Unknown or in-flight statuses — acknowledge silently
  if (!messageStatus || !(messageStatus in STATUS_TO_OUTCOME)) {
    return new NextResponse(null, { status: 200 });
  }

  const outcome = STATUS_TO_OUTCOME[messageStatus];

  // In-flight statuses — no update needed
  if (outcome === null) {
    return new NextResponse(null, { status: 200 });
  }

  const db = getAdminDb();
  const snap = await db
    .collection("clinics")
    .doc(clinicId)
    .collection("comms_log")
    .where("twilioSid", "==", messageSid)
    .limit(1)
    .get();

  if (!snap.empty) {
    await snap.docs[0].ref.update({ outcome });
  }

  return new NextResponse(null, { status: 200 });
}

export const POST = withRequestLog(handler);
