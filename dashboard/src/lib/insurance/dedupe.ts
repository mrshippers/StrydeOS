/**
 * Anti-spam guard for insurance intake sends.
 *
 * Without this, every manual button click, Ava mid-call offer, failsafe and cron
 * run mints a fresh link and fires an SMS/email — so a patient who already
 * submitted, or who was texted an hour ago, gets pinged again. This decides
 * whether a new send should be suppressed, keyed on the patient's prior links.
 *
 * Two rules:
 *   - already_submitted: the patient completed the form within the validity
 *     window (insurance details are stable-ish; re-confirm roughly annually).
 *   - recently_sent: a link was issued to them inside the cooldown window.
 */

import type { Firestore } from "firebase-admin/firestore";

const INTAKE_LINKS = "insurance_intake_links";

/** Don't re-send within 24h of the last link to the same patient. */
export const INTAKE_RESEND_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Treat a completed submission as valid (no re-ask) for 90 days. */
export const INTAKE_SUBMITTED_VALIDITY_MS = 90 * 24 * 60 * 60 * 1000;

export interface IntakeLinkLike {
  status?: string; // "issued" | "submitted"
  createdAt?: string; // ISO
  expiresAt?: string; // ISO
  submittedAt?: string; // ISO
}

export type IntakeSuppressionReason = "already_submitted" | "recently_sent";

export interface IntakeSuppression {
  suppress: boolean;
  reason: IntakeSuppressionReason | null;
  /** ISO timestamp of the most recent relevant prior event, if any. */
  lastSentAt: string | null;
}

export interface SuppressionOptions {
  cooldownMs?: number;
  submittedValidityMs?: number;
}

/**
 * Pure decision: given all of a patient's existing intake links, should a new
 * send be suppressed? `nowMs` is injected for testability.
 */
export function evaluateIntakeSuppression(
  links: IntakeLinkLike[],
  nowMs: number,
  opts: SuppressionOptions = {},
): IntakeSuppression {
  const cooldownMs = opts.cooldownMs ?? INTAKE_RESEND_COOLDOWN_MS;
  const submittedValidityMs = opts.submittedValidityMs ?? INTAKE_SUBMITTED_VALIDITY_MS;

  let lastSentMs = -Infinity;
  let lastSentAt: string | null = null;
  let lastSubmitMs = -Infinity;
  let lastSubmitAt: string | null = null;

  for (const l of links) {
    const createdMs = l.createdAt ? Date.parse(l.createdAt) : NaN;
    if (!Number.isNaN(createdMs) && createdMs > lastSentMs) {
      lastSentMs = createdMs;
      lastSentAt = l.createdAt ?? null;
    }
    if (l.status === "submitted") {
      const submitMs = l.submittedAt ? Date.parse(l.submittedAt) : createdMs;
      if (!Number.isNaN(submitMs) && submitMs > lastSubmitMs) {
        lastSubmitMs = submitMs;
        lastSubmitAt = l.submittedAt ?? l.createdAt ?? null;
      }
    }
  }

  if (lastSubmitMs !== -Infinity && nowMs - lastSubmitMs < submittedValidityMs) {
    return { suppress: true, reason: "already_submitted", lastSentAt: lastSubmitAt };
  }
  if (lastSentMs !== -Infinity && nowMs - lastSentMs < cooldownMs) {
    return { suppress: true, reason: "recently_sent", lastSentAt };
  }
  return { suppress: false, reason: null, lastSentAt };
}

/** Fetch a patient's existing intake links for this clinic. */
export async function loadPatientIntakeLinks(
  db: Firestore,
  clinicId: string,
  patientRef: string,
): Promise<IntakeLinkLike[]> {
  const snap = await db
    .collection("clinics").doc(clinicId)
    .collection(INTAKE_LINKS)
    .where("patientRef", "==", patientRef)
    .get();
  return snap.docs.map((d) => d.data() as IntakeLinkLike);
}

/** Convenience: load a patient's links and evaluate suppression in one call. */
export async function checkIntakeSuppression(
  db: Firestore,
  clinicId: string,
  patientRef: string,
  nowMs: number,
  opts?: SuppressionOptions,
): Promise<IntakeSuppression> {
  const links = await loadPatientIntakeLinks(db, clinicId, patientRef);
  return evaluateIntakeSuppression(links, nowMs, opts);
}
