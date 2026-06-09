/**
 * Shared intake-link creator. Used by the manual staff endpoint and the
 * auto-send cron so the link document shape + token signing stay in one place.
 */

import type { Firestore } from "firebase-admin/firestore";
import { signIntakeToken } from "./intake-token";
import { resolveInsurerOptions } from "./insurers";

const INTAKE_LINKS = "insurance_intake_links";
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const INTAKE_CONSENT_VERSION = "intake-v1";

export interface CreateIntakeLinkParams {
  patientRef: string;
  appointmentId?: string | null;
  /** Discovered insurer options (may be empty — resolved to the default UK list). */
  insurerOptions: string[];
  fallbackToInvoiceExtraInfo?: boolean;
  createdBy: string;
  /** Injected for testability; pass Date.now() at the call site. */
  nowMs: number;
}

export interface IntakeLinkResult {
  linkId: string;
  token: string;
  url: string;
  expiresAt: string;
  insurerOptions: string[];
}

function appBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://portal.strydeos.com").replace(/\/$/, "");
}

export async function createIntakeLink(
  db: Firestore,
  clinicId: string,
  params: CreateIntakeLinkParams,
): Promise<IntakeLinkResult> {
  const exp = params.nowMs + LINK_TTL_MS;
  const insurerOptions = resolveInsurerOptions(params.insurerOptions);

  const ref = db.collection("clinics").doc(clinicId).collection(INTAKE_LINKS).doc();
  await ref.set({
    patientRef: params.patientRef,
    appointmentId: params.appointmentId ?? null,
    insurerOptions,
    fallbackToInvoiceExtraInfo: params.fallbackToInvoiceExtraInfo ?? true,
    consentVersion: INTAKE_CONSENT_VERSION,
    status: "issued",
    createdBy: params.createdBy,
    createdAt: new Date(params.nowMs).toISOString(),
    expiresAt: new Date(exp).toISOString(),
  });

  const token = signIntakeToken({ clinicId, linkId: ref.id, exp });
  return {
    linkId: ref.id,
    token,
    url: `${appBaseUrl()}/intake/${token}`,
    expiresAt: new Date(exp).toISOString(),
    insurerOptions,
  };
}
