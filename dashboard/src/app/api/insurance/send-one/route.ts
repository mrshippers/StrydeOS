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
import { buildInsuranceIntakeSms } from "@/lib/insurance/sms";
import { toE164UK } from "@/lib/insurance/phone";
import { checkIntakeSuppression } from "@/lib/insurance/dedupe";
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
    const force = body.force === true;
    if (!patientRef) return NextResponse.json({ error: "patientRef is required" }, { status: 400 });

    const db = getAdminDb();

    // Anti-spam: refuse a duplicate send unless staff explicitly force it. The
    // patient has either already submitted (within validity) or was texted/
    // emailed within the cooldown window.
    if (!force) {
      const supp = await checkIntakeSuppression(db, clinicId, patientRef, Date.now());
      if (supp.suppress) {
        return NextResponse.json(
          { ok: false, suppressed: true, reason: supp.reason, lastSentAt: supp.lastSentAt },
          { status: 409 },
        );
      }
    }

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

    // Email — best-effort. A throw (missing Resend key, network) must NOT abort
    // the request before SMS is even attempted, and must not be reported as sent.
    let emailed = false;
    if (patient.email) {
      try {
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
        if (error) console.error("[send-one] Resend send failed:", error);
      } catch (e) {
        emailed = false;
        console.error("[send-one] Resend threw:", e instanceof Error ? e.message : e);
      }
    }

    // SMS — the patient's mobile is often the faster channel. Best-effort, but a
    // config failure is logged so a silently-dark Twilio is visible in ops.
    let texted = false;
    const smsTo = toE164UK(patient.phone) ?? "";
    if (smsTo) {
      try {
        await getTwilio().messages.create({
          from: branding.smsSender,
          to: smsTo,
          body: buildInsuranceIntakeSms({
            patientName: [patient.firstName, patient.lastName].filter(Boolean).join(" ") || undefined,
            link: link.shortUrl,
            clinicName: branding.clinicName,
          }),
        });
        texted = true;
      } catch (e) {
        texted = false;
        console.error("[send-one] Twilio send failed:", e instanceof Error ? e.message : e);
      }
    }

    // Delivery gate: if NOTHING actually went out, the issued link must not count
    // as a "recent send" (it would 409-suppress retries for 24h) and the response
    // must not claim success. Roll the link back and surface the failure.
    if (!emailed && !texted) {
      await db.collection("clinics").doc(clinicId).collection("insurance_intake_links").doc(link.linkId).delete().catch(() => {});
      await db.collection("intake_shortlinks").doc(link.slug).delete().catch(() => {});
      return NextResponse.json(
        { ok: false, error: "Nothing was delivered (no working email or SMS channel for this patient).", emailed, texted, email: patient.email ?? null },
        { status: 502 },
      );
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
