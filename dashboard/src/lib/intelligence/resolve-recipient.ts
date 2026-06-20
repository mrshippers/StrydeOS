/**
 * Recipient validation and clinic-binding for Intelligence digest emails.
 *
 * P0-13: Every outbound email that carries clinical PII or revenue figures MUST
 * pass through this module before send. Three checks are applied in order:
 *  1. RFC email format (basic regex)
 *  2. Role/test domain rejection
 *  3. Firestore membership: the address must resolve to a users/{uid} doc that
 *     belongs to THIS clinicId (multi-tenant isolation)
 *
 * When a valid-format address fails the membership check the event is recorded
 * as a security drift event in audit_logs before returning invalid.
 *
 * When the Firestore users query itself errors (e.g. missing composite index)
 * the function fails CLOSED (blocks send) and records the failure as a drift
 * event so it is observable. It does NOT propagate the error to callers.
 */

import type { Firestore } from "firebase-admin/firestore";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ResolveRecipientResult =
  | { valid: true; uid: string; email: string }
  | { valid: false; reason: string; isDrift?: boolean };

// ─── Constants ───────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Local-part prefixes that indicate a role address or test sink.
 * Checked case-insensitively against everything before the first @.
 */
const ROLE_PREFIXES = [
  "admin",
  "noreply",
  "no-reply",
  "test",
  "mailer-daemon",
  "postmaster",
];

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Validate and clinic-bind a single recipient email address.
 *
 * @param email - Raw email string from Firestore clinic/clinician doc
 * @param clinicId - The clinic context for the outbound email
 * @param db - Firestore admin instance
 * @param emailType - The type of email being sent (stored in the drift audit entry)
 */
export async function resolveRecipient(
  email: string,
  clinicId: string,
  db: Firestore,
  emailType?: string
): Promise<ResolveRecipientResult> {
  // 1. Format check
  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, reason: "Invalid email format" };
  }

  // 2. Role/test domain check
  const localPart = email.split("@")[0].toLowerCase();
  const isRoleAddress = ROLE_PREFIXES.some((prefix) => localPart === prefix || localPart.startsWith(prefix + "."));
  if (isRoleAddress) {
    return { valid: false, reason: "Role or test address rejected" };
  }

  // 3. Clinic membership check (multi-tenant isolation)
  // Query: users where clinicId == this clinic AND email == this address
  let snap: { empty: boolean; docs: Array<{ id: string }> };
  try {
    snap = await db
      .collection("users")
      .where("clinicId", "==", clinicId)
      .where("email", "==", email)
      .limit(1)
      .get();
  } catch (queryErr) {
    // Fail CLOSED: block the send and record it as a drift/security audit event
    // so a missing composite index or transient Firestore error is observable.
    const reason = `Lookup failed: ${queryErr instanceof Error ? queryErr.message : String(queryErr)}`;
    await recordDrift(db, clinicId, email, reason, emailType);
    return {
      valid: false,
      reason,
      isDrift: true,
    };
  }

  if (snap.empty) {
    // Valid-format address that is not a member of this clinic: security drift event
    const reason = `Recipient not found in clinic ${clinicId}`;
    await recordDrift(db, clinicId, email, reason, emailType);
    return {
      valid: false,
      reason,
      isDrift: true,
    };
  }

  const userDoc = snap.docs[0];
  return { valid: true, uid: userDoc.id, email };
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function recordDrift(
  db: Firestore,
  clinicId: string,
  recipient: string,
  reason: string,
  emailType?: string
): Promise<void> {
  try {
    const entry: Record<string, unknown> = {
      userId: "system:intelligence",
      userEmail: "intelligence@strydeos.com",
      action: "write",
      resource: "email_send",
      timestamp: new Date().toISOString(),
      metadata: {
        event: "recipient_drift",
        security: true,
        recipient,
        clinicId,
        reason,
        ...(emailType !== undefined ? { emailType } : {}),
      },
    };

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection("audit_logs")
      .add(entry);
  } catch (err) {
    // Audit failures must never suppress the security signal -- log and continue
    console.error("[resolve-recipient] drift audit write failed", err);
  }
}
