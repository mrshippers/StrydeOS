/**
 * Ava callback notification — sends SMS alert when a call requires follow-up.
 *
 * Fire-and-forget: callers should NOT await this. Errors are caught internally
 * so the webhook response is never delayed.
 */

import { getAdminDb } from "@/lib/firebase-admin";
import { getTwilio, getTwilioPhone } from "@/lib/twilio";

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
  try {
    const db = getAdminDb();
    const clinicDoc = await db.collection("clinics").doc(params.clinicId).get();
    if (!clinicDoc.exists) return;

    const clinicData = clinicDoc.data() as Record<string, unknown>;
    const clinicName = (clinicData.name as string) || "the clinic";
    const clinicPhone = (
      (clinicData.receptionPhone as string) ||
      (clinicData.phone as string) ||
      ""
    );

    const tw = getTwilio();
    const fromPhone = getTwilioPhone();

    const body = clinicPhone
      ? `Hi, thanks for calling ${clinicName}. Your appointment request has been received — we'll confirm your slot by text within the hour. Questions? Call us on ${clinicPhone}.`
      : `Hi, thanks for calling ${clinicName}. Your appointment request has been received — we'll confirm your slot by text within the hour.`;

    await tw.messages.create({
      to: params.callerPhone,
      from: fromPhone,
      body,
    });
  } catch {
    // Swallow errors — fire-and-forget.
  }
}

/**
 * Send an SMS notification for a callback request.
 * This is fire-and-forget — wrap the call in a void promise, do NOT await.
 */
export async function sendCallbackNotification(
  notification: CallbackNotification
): Promise<void> {
  try {
    const db = getAdminDb();
    const clinicDoc = await db
      .collection("clinics")
      .doc(notification.clinicId)
      .get();

    if (!clinicDoc.exists) return;

    const clinicData = clinicDoc.data() as Record<string, unknown>;
    const toPhone = resolveNotificationPhone(clinicData);

    if (!toPhone) return;

    const tw = getTwilio();
    const fromPhone = getTwilioPhone();
    const body = formatSmsBody(notification);

    await tw.messages.create({
      to: toPhone,
      from: fromPhone,
      body,
    });
  } catch {
    // Swallow errors — this is fire-and-forget.
    // Twilio delivery failures or missing config should never break the webhook.
  }
}
