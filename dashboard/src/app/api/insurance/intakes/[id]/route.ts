/**
 * PATCH /api/insurance/intakes/[id]
 *
 * Staff-only. Approve or reject a pending insurance intake.
 *   { action: "approve" }  → write to the PMS (custom fields + billing info),
 *                            mark approved, audit the write.
 *   { action: "reject", note? } → mark rejected, no PMS write.
 *
 * This is the only path that writes insurance into the PMS, and it requires an
 * authenticated owner/admin/superadmin.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { isEncrypted, decryptCredential } from "@/lib/crypto/credentials";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import { redactPolicyNumber } from "@/lib/insurance/redact";
import { requiresPreAuthorisation } from "@/lib/insurance/insurers";
import { clinikoInvoiceDeepLink } from "@/lib/integrations/pms/cliniko/insurance";
import type { PMSIntegrationConfig } from "@/types/pms";
import type { InsuranceAuditEntry, InsuranceRecord } from "@/lib/insurance/types";

const INTEGRATIONS_PMS = "integrations_config";
const PMS_DOC_ID = "pms";
const INTAKES = "insurance_intakes";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { limited } = await checkRateLimitAsync(request, { limit: 20, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) return NextResponse.json({ error: "No clinic" }, { status: 400 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body.action as "approve" | "reject" | undefined;
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const db = getAdminDb();
    const intakeRef = db.collection("clinics").doc(clinicId).collection(INTAKES).doc(id);
    const snap = await intakeRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Intake not found" }, { status: 404 });

    const record = snap.data() as InsuranceRecord;
    if (record.reviewStatus !== "pending") {
      return NextResponse.json({ error: `Intake already ${record.reviewStatus}` }, { status: 409 });
    }

    const now = new Date().toISOString();
    const auditFor = (entry: Omit<InsuranceAuditEntry, "at" | "actor">): InsuranceAuditEntry => ({
      at: now,
      actor: user.uid,
      ...entry,
    });

    // ── Reject ────────────────────────────────────────────────────────────────
    if (action === "reject") {
      await intakeRef.set(
        {
          reviewStatus: "rejected",
          audit: [...(record.audit ?? []), auditFor({ action: "rejected", note: body.note })],
        },
        { merge: true },
      );
      await writeAuditLog(db, clinicId, {
        userId: user.uid,
        userEmail: user.email,
        action: "update",
        resource: "insurance_intake",
        resourceId: id,
        metadata: { action: "reject" },
        ip: extractIpFromRequest(request),
      });
      return NextResponse.json({ ok: true, reviewStatus: "rejected" });
    }

    // ── Approve → write to PMS ─────────────────────────────────────────────────
    // A claimable insurer must carry a pre-authorisation code before the claim
    // is written to the PMS / surfaced on an invoice. Self-funding patients are
    // exempt. This is the gate that stops a Bupa pre-auth being approved blank.
    if (requiresPreAuthorisation(record.insurerName) && !record.authorisationCode?.trim()) {
      return NextResponse.json(
        { error: `A pre-authorisation code is required before approving a ${record.insurerName} claim.` },
        { status: 422 },
      );
    }

    const cfgSnap = await db
      .collection("clinics").doc(clinicId)
      .collection(INTEGRATIONS_PMS).doc(PMS_DOC_ID).get();
    const cfg = cfgSnap.data() as PMSIntegrationConfig | undefined;
    if (!cfg?.apiKey?.trim() || !cfg?.provider) {
      return NextResponse.json({ error: "No PMS configured for this clinic" }, { status: 400 });
    }
    if (isEncrypted(cfg.apiKey)) cfg.apiKey = decryptCredential(cfg.apiKey, clinicId);

    const adapter = createPMSAdapter(cfg);
    if (!adapter.discoverInsuranceFields || !adapter.writeInsurance) {
      return NextResponse.json(
        { error: `${cfg.provider} does not support insurance write` },
        { status: 400 },
      );
    }

    const fieldMap = await adapter.discoverInsuranceFields();
    const result = await adapter.writeInsurance(record, fieldMap);

    if (!result.ok) {
      await intakeRef.set(
        { audit: [...(record.audit ?? []), auditFor({ action: "write_failed", note: result.error })] },
        { merge: true },
      );
      return NextResponse.json({ ok: false, error: result.error ?? "PMS write failed" }, { status: 502 });
    }

    // One-click deep link to Cliniko's pre-filled new-invoice screen for this
    // patient. Cliniko's API can't create invoices, so this is how staff close
    // the loop. Null when the clinic's Cliniko web host isn't configured.
    const pmsInvoiceUrl =
      cfg.provider === "cliniko" ? clinikoInvoiceDeepLink(cfg.webBaseUrl, record.patientRef) : null;

    await intakeRef.set(
      {
        reviewStatus: "approved",
        pmsInvoiceUrl,
        audit: [
          ...(record.audit ?? []),
          auditFor({ action: "approved" }),
          auditFor({
            action: "written",
            note: result.usedFallback
              ? "wrote insurance summary to patient billing info (no structured insurance form configured)"
              : "wrote insurance summary to patient billing info",
          }),
        ],
      },
      { merge: true },
    );

    if (result.onboardingTaskNeeded) {
      await db.collection("clinics").doc(clinicId).set(
        { onboarding: { insuranceFieldsNeeded: true } },
        { merge: true },
      );
    }

    await writeAuditLog(db, clinicId, {
      userId: user.uid,
      userEmail: user.email,
      action: "write",
      resource: "insurance_intake",
      resourceId: id,
      metadata: {
        action: "approve",
        patientRef: record.patientRef,
        policyNumber: redactPolicyNumber(record.policyNumber ?? ""),
        usedFallback: result.usedFallback,
      },
      ip: extractIpFromRequest(request),
    });

    return NextResponse.json({ ok: true, reviewStatus: "approved", result, pmsInvoiceUrl });
  } catch (e) {
    return handleApiError(e);
  }
}

export const PATCH = withRequestLog(handler);
