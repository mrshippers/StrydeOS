/**
 * End-of-day "incomplete insurance" digest.
 *
 * Auto-stage keeps StrydeOS invisible by writing a patient's submission straight
 * to the PMS even when a required field is still missing (a claimable insurer
 * with no pre-authorisation code) or when the patient flagged a different insurer
 * than their booked type (held for review). Neither blocks the flow — but a
 * claim that bills without a pre-auth, or against the wrong insurer, gets
 * rejected. This digest is the safety net: once a day it emails the clinic owner
 * the patients whose insurance is staged but not yet claim-ready, so someone
 * chases the pre-auth (or arbitrates the mismatch) before billing.
 *
 * Reuses the same consent + clinic-bound recipient validation as the other owner
 * emails, so it can never leak across tenants or email a non-consenting clinic.
 */

import type { Firestore } from "firebase-admin/firestore";
import { resolveRecipient } from "@/lib/intelligence/resolve-recipient";
import { wrapEmailLayout, textFooter } from "@/lib/intelligence/emails/layout";
import { redactPolicyNumber } from "@/lib/insurance/redact";
import { getResend } from "@/lib/resend";
import { brandingFromClinicData } from "@/lib/comms/clinic-branding";
import { writeAuditLog } from "@/lib/audit-log";
import type { InsuranceRecord } from "@/lib/insurance/types";

const INTAKES = "insurance_intakes";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

interface DigestItem {
  patientRef: string;
  insurerName: string;
  reason: string;
  policyTail: string;
  capturedAt: string;
}

/** Pure: turn outstanding records into digest rows (incomplete or held-for-review). */
export function buildIncompleteItems(records: InsuranceRecord[]): DigestItem[] {
  const items: DigestItem[] = [];
  for (const r of records) {
    let reason: string | null = null;
    if (r.incomplete) reason = r.incompleteReason ?? "incomplete";
    else if (r.insurerMismatch) reason = `insurer mismatch (patient said ${r.claimedInsurer ?? "another insurer"})`;
    else if (r.reviewStatus === "pending") reason = "awaiting staff review";
    if (!reason) continue;
    items.push({
      patientRef: r.patientRef,
      insurerName: r.insurerName,
      reason,
      policyTail: r.policyNumber ? redactPolicyNumber(r.policyNumber) : "",
      capturedAt: r.capturedAt,
    });
  }
  return items;
}

function buildDigestEmail(clinicName: string, items: DigestItem[]): { html: string; text: string } {
  const rows = items.map((it) => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px;color:#FFFFFF;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escapeHtml(it.insurerName)}${it.policyTail ? ` <span style="color:#8FA3C2;">· ${escapeHtml(it.policyTail)}</span>` : ""}</td>
      <td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;color:#F6B26B;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escapeHtml(it.reason)}</td>
      <td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;color:#8FA3C2;font-family:'Outfit',Helvetica,Arial,sans-serif;">${escapeHtml(it.patientRef)}</td>
    </tr>`).join("");

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#FFFFFF;line-height:1.6;font-family:'Outfit',Helvetica,Arial,sans-serif;">
      ${items.length} insurance ${items.length === 1 ? "patient needs" : "patients need"} attention before billing at ${escapeHtml(clinicName)}.
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#B7C6DE;line-height:1.6;font-family:'Outfit',Helvetica,Arial,sans-serif;">
      Their details are already on the Cliniko record, but the claim is not yet complete (usually a missing pre-authorisation, or a flagged insurer mismatch). Chase the pre-auth or arbitrate the insurer, then the invoice is ready.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0B2545;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
      <tr>
        <th align="left" style="padding:10px 14px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#4B8BF5;font-family:'Outfit',Helvetica,Arial,sans-serif;">Insurer</th>
        <th align="left" style="padding:10px 14px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#4B8BF5;font-family:'Outfit',Helvetica,Arial,sans-serif;">Needs</th>
        <th align="left" style="padding:10px 14px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#4B8BF5;font-family:'Outfit',Helvetica,Arial,sans-serif;">Patient ref</th>
      </tr>
      ${rows}
    </table>
    <div style="text-align:center;margin:24px 0 4px;">
      <a href="https://portal.strydeos.com/compliance/insurance" style="display:inline-block;padding:13px 30px;border-radius:50px;background:#0891B2;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;font-family:'Outfit',Helvetica,Arial,sans-serif;">Open the insurance queue</a>
    </div>`;

  const text = [
    `${items.length} insurance patient(s) need attention before billing at ${clinicName}.`,
    "",
    ...items.map((it) => `- ${it.insurerName}${it.policyTail ? ` (${it.policyTail})` : ""}: ${it.reason} [ref ${it.patientRef}]`),
    "",
    "Open the queue: https://portal.strydeos.com/compliance/insurance",
    "",
    textFooter({ unsubscribeType: "weekly_digest" }),
  ].join("\n");

  return { html: wrapEmailLayout(body), text };
}

export async function sendIncompleteDigest(
  db: Firestore,
  clinicId: string,
): Promise<{ sent: boolean; count?: number; result?: "no_data" | "no_consent" | "no_owner"; error?: string }> {
  const clinicDoc = await db.doc(`clinics/${clinicId}`).get();
  if (!clinicDoc.exists) return { sent: false, error: "Clinic not found" };
  const clinicData = clinicDoc.data()!;

  const flags = (clinicData.featureFlags ?? {}) as { insuranceIntake?: boolean };
  if (!flags.insuranceIntake) return { sent: false };

  if (clinicData.commsConsentGrantedAt == null) return { sent: false, result: "no_consent" };
  const ownerEmail = clinicData.ownerEmail as string | undefined;
  if (!ownerEmail) return { sent: false, result: "no_owner" };

  const recipientResult = await resolveRecipient(ownerEmail, clinicId, db, "weekly_digest");
  if (!recipientResult.valid) return { sent: false, error: `Recipient validation failed: ${recipientResult.reason}` };

  // Outstanding records: flagged incomplete, or still pending (held mismatch /
  // write failure). Both are single-field queries (no composite index needed).
  const [incompleteSnap, pendingSnap] = await Promise.all([
    db.collection(`clinics/${clinicId}/${INTAKES}`).where("incomplete", "==", true).get(),
    db.collection(`clinics/${clinicId}/${INTAKES}`).where("reviewStatus", "==", "pending").get(),
  ]);
  const byId = new Map<string, InsuranceRecord>();
  for (const d of [...incompleteSnap.docs, ...pendingSnap.docs]) byId.set(d.id, d.data() as InsuranceRecord);

  const items = buildIncompleteItems([...byId.values()]);
  if (items.length === 0) return { sent: false, result: "no_data" };

  const branding = brandingFromClinicData(clinicData);
  const { html, text } = buildDigestEmail(branding.clinicName, items);
  const { error } = await getResend().emails.send({
    from: branding.emailFrom,
    to: recipientResult.email,
    subject: `${items.length} insurance ${items.length === 1 ? "patient" : "patients"} need attention`,
    html,
    text,
  });
  if (error) return { sent: false, error: typeof error === "string" ? error : (error.message ?? "send failed") };

  await writeAuditLog(db, clinicId, {
    userId: "system", userEmail: "",
    action: "write", resource: "insurance_incomplete_digest",
    metadata: { count: items.length },
  });
  return { sent: true, count: items.length };
}
