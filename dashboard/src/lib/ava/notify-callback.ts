/**
 * Ava callback notification — sends SMS alert when a call requires follow-up,
 * and a booking acknowledgement to the patient.
 *
 * Observable + exactly-once: the webhook AWAITs these inside its claimed,
 * release-and-retry section, so on a Twilio failure they write a `send_failed`
 * comms_log row, capture to Sentry, and RE-THROW — letting the webhook release
 * its dedup claim and 500 so ElevenLabs re-delivers. A successful enqueue writes
 * a `pending` row carrying the Twilio MessageSid and registers a statusCallback
 * so the delivery webhook (`/api/webhooks/twilio`) can resolve the final outcome.
 * The "no clinic" / "no phone" early exits are not failures and never throw.
 */

import * as Sentry from "@sentry/nextjs";
import { getAdminDb } from "@/lib/firebase-admin";
import { getTwilio } from "@/lib/twilio";
import { brandingFromClinicData } from "@/lib/comms/clinic-branding";

/**
 * Build the Twilio status-callback URL for a clinic. Twilio POSTs delivery
 * status here; `/api/webhooks/twilio` scopes the comms_log lookup by clinicId
 * and matches the row by twilioSid.
 */
function statusCallbackUrl(clinicId: string): string {
  const base = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://portal.strydeos.com"
  ).replace(/\/$/, "");
  return `${base}/api/webhooks/twilio?clinicId=${encodeURIComponent(clinicId)}`;
}

/**
 * Write a comms_log row for an Ava SMS send, scoped under the clinic exactly as
 * /api/comms/send does. `pending` on a successful enqueue (with twilioSid),
 * `send_failed` on a throw (with the error message). Best-effort: a log-write
 * failure must not mask the underlying send outcome.
 */
async function writeAvaSmsLog(
  db: FirebaseFirestore.Firestore,
  clinicId: string,
  entry: {
    to: string;
    outcome: "pending" | "send_failed";
    kind: string;
    twilioSid?: string;
    error?: string;
  },
): Promise<void> {
  const ts = new Date().toISOString();
  try {
    await db
      .collection("clinics")
      .doc(clinicId)
      .collection("comms_log")
      .add({
        clinicId,
        channel: "sms",
        to: entry.to,
        outcome: entry.outcome,
        source: entry.kind,
        sentAt: ts,
        createdAt: ts,
        ...(entry.twilioSid ? { twilioSid: entry.twilioSid } : {}),
        ...(entry.error ? { error: entry.error } : {}),
      });
  } catch (logErr) {
    Sentry.captureException(logErr, { tags: { context: "ava_comms_log_write" } });
  }
}

export interface CallbackNotification {
  clinicId: string;
  callerPhone: string | null;
  callbackType: string;
  reason: string | null;
  conversationId: string;
}

/**
 * Resolve the best notification phone number from a clinic document.
 * Priority: receptionPhone > notificationPhone > phone
 */
function resolveNotificationPhone(
  clinicData: Record<string, unknown>
): string | null {
  return (
    (clinicData.receptionPhone as string) ||
    (clinicData.notificationPhone as string) ||
    (clinicData.phone as string) ||
    null
  );
}

/**
 * Format an SMS body for a callback notification (target: <160 chars).
 */
function formatSmsBody(notification: CallbackNotification): string {
  const caller = notification.callerPhone ?? "unknown number";
  const type = notification.callbackType || "general";
  const reason = notification.reason
    ? notification.reason.slice(0, 60)
    : "see dashboard";

  return `Ava callback needed - ${type}: ${caller}. Reason: ${reason}. Check dashboard for details.`;
}

/**
 * Send an SMS booking acknowledgement to the patient.
 * Sent immediately after a call ends with outcome "booked".
 * Fire-and-forget: do NOT await.
 */
export async function sendBookingAcknowledgement(params: {
  clinicId: string;
  callerPhone: string;
  conversationId: string;
}): Promise<void> {
  const db = getAdminDb();
  const clinicDoc = await db.collection("clinics").doc(params.clinicId).get();
  if (!clinicDoc.exists) return; // not a failure — nothing to acknowledge against

  const clinicData = clinicDoc.data() as Record<string, unknown>;
  const clinicName = (clinicData.name as string) || "the clinic";
  const clinicPhone = (
    (clinicData.receptionPhone as string) ||
    (clinicData.phone as string) ||
    ""
  );

  const tw = getTwilio();
  const fromPhone = brandingFromClinicData(clinicData).smsSender;

  const body = clinicPhone
    ? `Hi, thanks for calling ${clinicName}. Your appointment request has been received — we'll confirm your slot by text within the hour. Questions? Call us on ${clinicPhone}.`
    : `Hi, thanks for calling ${clinicName}. Your appointment request has been received — we'll confirm your slot by text within the hour.`;

  try {
    const msg = await tw.messages.create({
      to: params.callerPhone,
      from: fromPhone,
      body,
      statusCallback: statusCallbackUrl(params.clinicId),
    });
    await writeAvaSmsLog(db, params.clinicId, {
      to: params.callerPhone,
      outcome: "pending",
      kind: "ava_booking_ack",
      twilioSid: msg.sid,
    });
  } catch (err) {
    // A patient-promised confirmation failed. Record it, surface it, and
    // re-throw so the webhook releases its dedup claim and retries.
    await writeAvaSmsLog(db, params.clinicId, {
      to: params.callerPhone,
      outcome: "send_failed",
      kind: "ava_booking_ack",
      error: err instanceof Error ? err.message : String(err),
    });
    Sentry.captureException(err);
    throw err;
  }
}

/**
 * Send an SMS notification for a callback request.
 * This is fire-and-forget — wrap the call in a void promise, do NOT await.
 */
export async function sendCallbackNotification(
  notification: CallbackNotification
): Promise<void> {
  const db = getAdminDb();
  const clinicDoc = await db
    .collection("clinics")
    .doc(notification.clinicId)
    .get();

  if (!clinicDoc.exists) return; // not a failure — no clinic to notify

  const clinicData = clinicDoc.data() as Record<string, unknown>;
  const toPhone = resolveNotificationPhone(clinicData);

  if (!toPhone) return; // not a failure — clinic has no notification number

  const tw = getTwilio();
  const fromPhone = brandingFromClinicData(clinicData).smsSender;
  const body = formatSmsBody(notification);

  try {
    const msg = await tw.messages.create({
      to: toPhone,
      from: fromPhone,
      body,
      statusCallback: statusCallbackUrl(notification.clinicId),
    });
    await writeAvaSmsLog(db, notification.clinicId, {
      to: toPhone,
      outcome: "pending",
      kind: "ava_callback",
      twilioSid: msg.sid,
    });
  } catch (err) {
    // The owner/callback alert failed. Record it, surface it, and re-throw so
    // the webhook releases its dedup claim and retries rather than losing it.
    await writeAvaSmsLog(db, notification.clinicId, {
      to: toPhone,
      outcome: "send_failed",
      kind: "ava_callback",
      error: err instanceof Error ? err.message : String(err),
    });
    Sentry.captureException(err);
    throw err;
  }
}
