/**
 * Stage a captured insurance record into the clinic's PMS (the actual write).
 *
 * This is the shared core behind two callers:
 *  - auto-stage on submit (public intake POST) — StrydeOS is meant to be
 *    invisible, so a patient's submission writes straight to the PMS patient
 *    record with no human approval. It is the patient's own data and fully
 *    reversible in the PMS, so a manual gate is pure friction.
 *  - manual approve (staff exception path) — retains its own auth + audit shell.
 *
 * The write itself is `PATCH /patients/{id}` setting invoice_extra_information
 * (+ confirmed address). The PMS snapshots that block onto any invoice raised
 * for the patient afterwards, so the clinic's normal billing comes out
 * claim-ready with zero added workload. Cliniko's API cannot create the invoice
 * itself (no POST /invoices — verified), so a one-click deep link to the
 * pre-filled new-invoice screen is the closest programmatic close.
 *
 * Never throws on a config/PMS miss: returns a typed result so the caller
 * decides whether to leave the record pending (queue) or mark it written.
 */

import type { Firestore } from "firebase-admin/firestore";
import { isEncrypted, decryptCredential } from "@/lib/crypto/credentials";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import {
  clinikoInvoiceDeepLink,
  resolveClinikoAttendeeId,
} from "@/lib/integrations/pms/cliniko/insurance";
import type { PMSIntegrationConfig } from "@/types/pms";
import type { InsuranceRecord } from "./types";

const INTEGRATIONS_PMS = "integrations_config";
const PMS_DOC_ID = "pms";

export interface StageResult {
  /** True when the PMS write succeeded. */
  ok: boolean;
  /** True when the clinic has no PMS configured / no insurance-write support —
   *  the caller should leave the record pending rather than treat it as failed. */
  noPms: boolean;
  /** One-click deep link to the pre-filled PMS invoice screen (null if N/A). */
  pmsInvoiceUrl: string | null;
  /** True when there is no structured insurance form (wrote to billing info). */
  usedFallback: boolean;
  /** True when the clinic needs an onboarding task to configure insurance fields. */
  onboardingTaskNeeded: boolean;
  /** Redacted error message on a genuine write failure. */
  error?: string;
}

export async function stageIntakeToPms(
  db: Firestore,
  clinicId: string,
  record: InsuranceRecord,
): Promise<StageResult> {
  const cfgSnap = await db
    .collection("clinics").doc(clinicId)
    .collection(INTEGRATIONS_PMS).doc(PMS_DOC_ID).get();
  const cfg = cfgSnap.data() as PMSIntegrationConfig | undefined;
  if (!cfg?.apiKey?.trim() || !cfg?.provider) {
    return { ok: false, noPms: true, pmsInvoiceUrl: null, usedFallback: false, onboardingTaskNeeded: false };
  }
  if (isEncrypted(cfg.apiKey)) cfg.apiKey = decryptCredential(cfg.apiKey, clinicId);

  const adapter = createPMSAdapter(cfg);
  if (!adapter.discoverInsuranceFields || !adapter.writeInsurance) {
    return { ok: false, noPms: true, pmsInvoiceUrl: null, usedFallback: false, onboardingTaskNeeded: false };
  }

  const fieldMap = await adapter.discoverInsuranceFields();
  const result = await adapter.writeInsurance(record, fieldMap);
  if (!result.ok) {
    return {
      ok: false,
      noPms: false,
      pmsInvoiceUrl: null,
      usedFallback: result.usedFallback,
      onboardingTaskNeeded: false,
      error: result.error,
    };
  }

  // Prefer the appointment-scoped invoice link (inherits the correct business +
  // practitioner + appointment); fall back to patient-scoped. Best-effort.
  let pmsInvoiceUrl: string | null = null;
  if (cfg.provider === "cliniko") {
    const attendeeId = await resolveClinikoAttendeeId(
      { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl },
      record.appointmentId,
    );
    pmsInvoiceUrl = clinikoInvoiceDeepLink(cfg.webBaseUrl, {
      patientRef: record.patientRef,
      attendeeId,
    });
  }

  return {
    ok: true,
    noPms: false,
    pmsInvoiceUrl,
    usedFallback: result.usedFallback,
    onboardingTaskNeeded: result.onboardingTaskNeeded,
  };
}
