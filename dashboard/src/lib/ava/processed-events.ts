/**
 * Idempotency guard for ElevenLabs Ava webhooks.
 *
 * A captured webhook (or an ElevenLabs delivery retry) can be re-POSTed and,
 * even with a fresh signature, re-fire patient-facing side effects: booking
 * acknowledgement SMS, callback/escalation SMS, and the insight/fact event
 * stream. The HMAC + timestamp window (see verify-signature.ts) closes the
 * *replay* hole; this guard closes the *at-least-once delivery* hole by making
 * the side-effecting work fire exactly once per (conversationId, eventType).
 *
 * Mechanism mirrors the canonical WriteUpp pattern: an atomic Firestore
 * `create()` on a per-clinic dedup doc. `create()` throws ALREADY_EXISTS
 * (gRPC code 6) if a concurrent or retried invocation already claimed the
 * event, so only the first caller proceeds to the SMS/booking work. These docs
 * are swept on a 7-day `processedAt` retention by the data-health/cleanup cron
 * (the `purgeAfter` field below is a redundant epoch-ms marker for any future
 * native-TTL policy).
 */

const DEDUP_TTL_DAYS = 7; // matches the ElevenLabs retry window with headroom

/**
 * Atomically claim a (conversationId, eventType) pair for the given clinic.
 *
 * @returns `true` if this caller won the claim and should run side effects,
 *          `false` if the event was already processed (replay / retry).
 *
 * Never throws for the dedup race — only an unexpected Firestore error
 * propagates so the webhook can 5xx and ElevenLabs can retry.
 */
export async function claimAvaWebhookEvent(
  db: FirebaseFirestore.Firestore,
  clinicId: string,
  conversationId: string,
  eventType: string
): Promise<boolean> {
  const claimId = `${conversationId}__${eventType}`;
  const ref = db
    .collection("clinics")
    .doc(clinicId)
    .collection("_ava_processed_events")
    .doc(claimId);

  const now = Date.now();
  try {
    await ref.create({
      conversationId,
      eventType,
      processedAt: new Date(now).toISOString(),
      // Epoch-ms TTL marker swept by data-health/cleanup. Kept short: this doc
      // only needs to outlive the provider's retry window.
      purgeAfter: now + DEDUP_TTL_DAYS * 86400000,
    });
    return true;
  } catch (err) {
    // gRPC code 6 = ALREADY_EXISTS — a concurrent or retried delivery already
    // claimed this event. Suppress the side effects, ack the webhook.
    if ((err as { code?: number }).code === 6) return false;
    throw err;
  }
}
