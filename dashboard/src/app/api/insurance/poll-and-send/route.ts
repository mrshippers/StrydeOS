/**
 * Insurance Intake auto-send (Pulse delivery).
 *
 * Cron + manual trigger. For each clinic that has opted in
 * (featureFlags.insuranceIntake) and runs Cliniko, polls upcoming appointments,
 * picks new ones (windowed, deduped, idempotent via existing link docs), and
 * emails the patient a secure intake link before their appointment.
 *
 * Auth: Vercel cron (CRON_SECRET) or an authenticated owner/admin (manual run,
 * restricted to their own clinic).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyApiRequest, verifyCronRequest, handleApiError, requireRole, type VerifiedUser,
} from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";
import { isEncrypted, decryptCredential } from "@/lib/crypto/credentials";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import { testClinikoConnection } from "@/lib/integrations/pms/cliniko/client";
import { createIntakeLink } from "@/lib/insurance/create-link";
import { selectAppointmentsForIntake } from "@/lib/insurance/auto-send";
import { buildInsuranceIntakeEmail } from "@/lib/intelligence/emails/insurance-intake";
import { brandingFromClinicData } from "@/lib/comms/clinic-branding";
import { getResend } from "@/lib/resend";
import { writeAuditLog } from "@/lib/audit-log";
import type { PMSIntegrationConfig } from "@/types/pms";
import type { InsuranceFieldMap } from "@/lib/insurance/types";

const INTEGRATIONS_PMS = "integrations_config";
const PMS_DOC_ID = "pms";
const INTAKE_LINKS = "insurance_intake_links";
const WINDOW_DAYS = 3;
const MAX_SENDS_PER_CLINIC = 50;

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface ClinicResult {
  clinicId: string;
  ok: boolean;
  skipped?: string;
  candidates?: number;
  sent?: number;
  noEmail?: number;
  errors?: string[];
}

async function processClinic(
  db: FirebaseFirestore.Firestore,
  clinicId: string,
  clinicData: FirebaseFirestore.DocumentData,
): Promise<ClinicResult> {
  const flags = (clinicData.featureFlags ?? {}) as { insuranceIntake?: boolean };
  if (!flags.insuranceIntake) return { clinicId, ok: true, skipped: "intake not enabled" };

  const cfgSnap = await db.collection("clinics").doc(clinicId).collection(INTEGRATIONS_PMS).doc(PMS_DOC_ID).get();
  const cfg = cfgSnap.data() as PMSIntegrationConfig | undefined;
  if (!cfg?.apiKey?.trim() || cfg.provider !== "cliniko") {
    return { clinicId, ok: true, skipped: "no cliniko key" };
  }
  if (isEncrypted(cfg.apiKey)) cfg.apiKey = decryptCredential(cfg.apiKey, clinicId);

  // Resolve the region shard if the stored config does not pin a base URL.
  let baseUrl = cfg.baseUrl;
  if (!baseUrl) {
    const t = await testClinikoConnection({ apiKey: cfg.apiKey });
    if (t.resolvedBase) baseUrl = t.resolvedBase;
  }
  const adapter = createPMSAdapter({ ...cfg, baseUrl });

  const now = Date.now();
  const appts = await adapter.getAppointments({
    dateFrom: ymd(now),
    dateTo: ymd(now + WINDOW_DAYS * 86400000),
  });

  const linksSnap = await db.collection("clinics").doc(clinicId).collection(INTAKE_LINKS).get();
  const linked = new Set<string>();
  linksSnap.forEach((d) => { const a = (d.data() as { appointmentId?: string }).appointmentId; if (a) linked.add(String(a)); });

  const candidates = selectAppointmentsForIntake(
    appts.map((a) => ({ externalId: a.externalId, patientExternalId: a.patientExternalId, dateTime: a.dateTime, status: a.status })),
    linked,
    { nowMs: now, windowDays: WINDOW_DAYS },
  ).slice(0, MAX_SENDS_PER_CLINIC);

  let fieldMap: InsuranceFieldMap | null = null;
  try { fieldMap = adapter.discoverInsuranceFields ? await adapter.discoverInsuranceFields() : null; } catch { fieldMap = null; }

  const branding = brandingFromClinicData(clinicData);
  let sent = 0, noEmail = 0;
  const errors: string[] = [];

  for (const c of candidates) {
    try {
      const patient = await adapter.getPatient(c.patientRef);
      if (!patient.email) { noEmail++; continue; }

      const link = await createIntakeLink(db, clinicId, {
        patientRef: c.patientRef,
        appointmentId: c.appointmentId,
        insurerOptions: fieldMap?.insurerOptions ?? [],
        fallbackToInvoiceExtraInfo: fieldMap?.fallbackToInvoiceExtraInfo ?? true,
        createdBy: "auto-send",
        nowMs: Date.now(),
      });

      const name = [patient.firstName, patient.lastName].filter(Boolean).join(" ");
      const { html, text } = buildInsuranceIntakeEmail({
        patientName: name || undefined,
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
      if (error) { errors.push(typeof error === "string" ? error : (error.message ?? "send failed")); continue; }
      sent++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (sent > 0) {
    await writeAuditLog(db, clinicId, {
      userId: "system", userEmail: "",
      action: "write", resource: "insurance_intake_autosend",
      metadata: { sent, noEmail, candidates: candidates.length },
    });
  }

  return { clinicId, ok: true, candidates: candidates.length, sent, noEmail, errors: errors.length ? errors : undefined };
}

async function handler(request: NextRequest) {
  const { limited } = await checkRateLimitAsync(request, { limit: 10, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    let isCron = false;
    let authedUser: VerifiedUser | null = null;
    if (request.headers.get("authorization")?.startsWith("Bearer ")) {
      try { verifyCronRequest(request); isCron = true; }
      catch { authedUser = await verifyApiRequest(request); requireRole(authedUser, ["owner", "admin", "superadmin"]); }
    } else {
      authedUser = await verifyApiRequest(request);
      requireRole(authedUser, ["owner", "admin", "superadmin"]);
    }

    const db = getAdminDb();
    let clinicDocs: FirebaseFirestore.QueryDocumentSnapshot[];
    if (!isCron && authedUser && authedUser.role !== "superadmin") {
      const d = await db.collection("clinics").doc(authedUser.clinicId).get();
      clinicDocs = d.exists ? [d as FirebaseFirestore.QueryDocumentSnapshot] : [];
    } else {
      clinicDocs = (await db.collection("clinics").get()).docs;
    }

    const results: ClinicResult[] = [];
    for (const cd of clinicDocs) {
      try {
        results.push(await processClinic(db, cd.id, cd.data()));
      } catch (e) {
        results.push({ clinicId: cd.id, ok: false, errors: [e instanceof Error ? e.message : String(e)] });
      }
    }
    return NextResponse.json({ results });
  } catch (e) {
    return handleApiError(e);
  }
}

export const GET = withRequestLog(handler);
export const POST = withRequestLog(handler);
