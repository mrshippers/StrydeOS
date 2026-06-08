/**
 * POST /api/insurance/intake-link
 *
 * Staff-only. Generates a secure, time-limited link a patient uses to submit
 * their insurance details before an appointment. Discovers the tenant's insurer
 * dropdown options once and snapshots them onto the link doc so the public form
 * never has to call the PMS.
 *
 * Body: { patientRef: string, appointmentId?: string }
 * Returns: { url, token, linkId, expiresAt, insurerOptions }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { isEncrypted, decryptCredential } from "@/lib/crypto/credentials";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import { createIntakeLink } from "@/lib/insurance/create-link";
import type { PMSIntegrationConfig } from "@/types/pms";
import type { InsuranceFieldMap } from "@/lib/insurance/types";

const INTEGRATIONS_PMS = "integrations_config";
const PMS_DOC_ID = "pms";

async function handler(request: NextRequest) {
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 20, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } },
    );
  }

  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const patientRef = (body.patientRef as string | undefined)?.trim();
    const appointmentId = (body.appointmentId as string | undefined)?.trim() || null;
    if (!patientRef) {
      return NextResponse.json({ error: "patientRef is required" }, { status: 400 });
    }

    const db = getAdminDb();

    // Best-effort discovery of insurer options. A discovery failure must not block
    // link creation — the form degrades to the default insurer list.
    let insurerOptions: string[] = [];
    let fieldMap: InsuranceFieldMap | null = null;
    try {
      const cfgSnap = await db
        .collection("clinics").doc(clinicId)
        .collection(INTEGRATIONS_PMS).doc(PMS_DOC_ID).get();
      const cfg = cfgSnap.data() as PMSIntegrationConfig | undefined;
      if (cfg?.apiKey?.trim() && cfg?.provider) {
        if (isEncrypted(cfg.apiKey)) cfg.apiKey = decryptCredential(cfg.apiKey, clinicId);
        const adapter = createPMSAdapter(cfg);
        if (adapter.discoverInsuranceFields) {
          fieldMap = await adapter.discoverInsuranceFields();
          insurerOptions = fieldMap.insurerOptions;
        }
      }
    } catch (err) {
      console.warn("[intake-link] field discovery failed:", err instanceof Error ? err.message : err);
    }

    const link = await createIntakeLink(db, clinicId, {
      patientRef,
      appointmentId,
      insurerOptions,
      fallbackToInvoiceExtraInfo: fieldMap?.fallbackToInvoiceExtraInfo ?? true,
      createdBy: user.uid,
      nowMs: Date.now(),
    });

    await writeAuditLog(db, clinicId, {
      userId: user.uid,
      userEmail: user.email,
      action: "write",
      resource: "insurance_intake_link",
      resourceId: link.linkId,
      metadata: { patientRef, appointmentId },
      ip: extractIpFromRequest(request),
    });

    return NextResponse.json({ ok: true, ...link });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
