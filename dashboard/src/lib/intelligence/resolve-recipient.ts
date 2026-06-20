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
 */
export async function resolveRecipient(
  email: string,
  clinicId: string,
  db: Firestore
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
  const snap = await db
    .collection("users")
    .where("clinicId", "==", clinicId)
    .where("email", "==", email)
    .limit(1)
    .get();

  if (snap.empty) {
    // Valid-format address that is not a member of this clinic: security drift event
    await recordDrift(db, clinicId, email);
    return {
      valid: false,
      reason: `Recipient not found in clinic ${clinicId}`,
      isDrift: true,
    };
  }

  const userDoc = snap.docs[0];
  return { valid: true, uid: userDoc.id, email };
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function recordDrift(db: Firestore, clinicId: string, recipient: string): Promise<void> {
  try {
    const entry = {
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
      },
    };

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection("audit_logs")
      .add(entry);
  } catch (err) {
    // Audit failures must never suppress the security signal — log and continue
    console.error("[resolve-recipient] drift audit write failed", err);
  }
}
