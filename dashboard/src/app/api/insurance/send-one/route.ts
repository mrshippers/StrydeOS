/**
 * POST /api/insurance/send-one
 *
 * Manual failsafe: staff send the insurance intake form to a single patient
 * (the Retention "Send insurance form" button). Generates a secure link and
 * emails the patient. Owner/admin/superadmin only.
 *
 * Body: { patientRef: string, appointmentId?: string }
 * Returns: { ok, url, emailed, email }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { isEncrypted, decryptCredential } from "@/lib/crypto/credentials";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import { testClinikoConnection } from "@/lib/integrations/pms/cliniko/client";
import { createIntakeLink } from "@/lib/insurance/create-link";
import { buildInsuranceIntakeEmail } from "@/lib/intelligence/emails/insurance-intake";
import { getResend } from "@/lib/resend";
import { getTwilio } from "@/lib/twilio";
import { getClinicBranding } from "@/lib/comms/clinic-branding";
import type { PMSIntegrationConfig } from "@/types/pms";
import type { InsuranceFieldMap } from "@/lib/insurance/types";

const INTEGRATIONS_PMS = "integrations_config";
const PMS_DOC_ID = "pms";

async function handler(request: NextRequest) {
  const { limited } = await checkRateLimitAsync(request, { limit: 20, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) return NextResponse.json({ error: "No clinic" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const patientRef = (body.patientRef as string | undefined)?.trim();
    const appointmentId = (body.appointmentId as string | undefined)?.trim() || null;
    if (!patientRef) return NextResponse.json({ error: "patientRef is required" }, { status: 400 });

    const db = getAdminDb();
    const branding = await getClinicBranding(db, clinicId);
    const cfgSnap = await db.collection("clinics").doc(clinicId).collection(INTEGRATIONS_PMS).doc(PMS_DOC_ID).get();
    const cfg = cfgSnap.data() as PMSIntegrationConfig | undefined;
    if (!cfg?.apiKey?.trim() || !cfg.provider) {
      return NextResponse.json({ error: "No PMS configured for this clinic" }, { status: 400 });
    }
    if (isEncrypted(cfg.apiKey)) cfg.apiKey = decryptCredential(cfg.apiKey, clinicId);
    let baseUrl = cfg.baseUrl;
    if (!baseUrl && cfg.provider === "cliniko") {
      const t = await testClinikoConnection({ apiKey: cfg.apiKey });
      if (t.resolvedBase) baseUrl = t.resolvedBase;
    }
    const adapter = createPMSAdapter({ ...cfg, baseUrl });

    let fieldMap: InsuranceFieldMap | null = null;
    try { fieldMap = adapter.discoverInsuranceFields ? await adapter.discoverInsuranceFields() : null; } catch { fieldMap = null; }

    const patient = await adapter.getPatient(patientRef);

    const link = await createIntakeLink(db, clinicId, {
      patientRef,
      appointmentId,
      insurerOptions: fieldMap?.insurerOptions ?? [],
      fallbackToInvoiceExtraInfo: fieldMap?.fallbackToInvoiceExtraInfo ?? true,
      createdBy: user.uid,
      nowMs: Date.now(),
    });

    let emailed = false;
    if (patient.email) {
      const { html, text } = buildInsuranceIntakeEmail({
        patientName: [patient.firstName, patient.lastName].filter(Boolean).join(" ") || undefined,
        clinicName: branding.clinicName,
        url: link.url,
      });
      const { error } = await getResend().emails.send({
        from: branding.emailFrom,
        to: patient.email,
        subject: "Confirm your insurance before your appointment",
        html,
        text,
      });
      emailed = !error;
    }

    // SMS — the patient's mobile is often the faster channel. Best-effort.
    let texted = false;
    const rawPhone = (patient.phone ?? "").replace(/[^\d+]/g, "");
    const smsTo = rawPhone.startsWith("+")
      ? rawPhone
      : rawPhone.startsWith("0")
        ? `+44${rawPhone.slice(1)}`
        : rawPhone
          ? `+${rawPhone}`
          : "";
    if (smsTo) {
      try {
        const firstName = patient.firstName ? ` ${patient.firstName}` : "";
        await getTwilio().messages.create({
          from: branding.smsSender,
          to: smsTo,
          body: `Hi${firstName}, please confirm your insurance details for your upcoming appointment using this secure link: ${link.shortUrl} - takes under a minute. Reply STOP to opt out.`,
        });
        texted = true;
      } catch {
        texted = false;
      }
    }

    await writeAuditLog(db, clinicId, {
      userId: user.uid, userEmail: user.email,
      action: "write", resource: "insurance_intake_send", resourceId: link.linkId,
      metadata: { patientRef, emailed, texted }, ip: extractIpFromRequest(request),
    });

    return NextResponse.json({ ok: true, url: link.url, emailed, texted, email: patient.email ?? null });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
