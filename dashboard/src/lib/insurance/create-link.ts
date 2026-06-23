/**
 * Shared intake-link creator. Used by the manual staff endpoint and the
 * auto-send cron so the link document shape + token signing stay in one place.
 */

import { randomBytes } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { signIntakeToken } from "./intake-token";
import { resolveInsurerOptions } from "./insurers";

const INTAKE_LINKS = "insurance_intake_links";
const SHORTLINKS = "intake_shortlinks";
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const INTAKE_CONSENT_VERSION = "intake-v1";

export interface CreateIntakeLinkParams {
  patientRef: string;
  appointmentId?: string | null;
  /** Discovered insurer options (may be empty — resolved to the default UK list). */
  insurerOptions: string[];
  /**
   * Insurer derived from the booked appointment type (insurance-intake gate).
   * When set, the form pre-fills and LOCKS the insurer instead of asking the
   * patient to pick one. Null/undefined → patient selects from insurerOptions.
   */
  derivedInsurer?: string | null;
  fallbackToInvoiceExtraInfo?: boolean;
  createdBy: string;
  /** Injected for testability; pass Date.now() at the call site. */
  nowMs: number;
}

export interface IntakeLinkResult {
  linkId: string;
  token: string;
  /** Full self-verifying link (long signed token in the path). */
  url: string;
  /** Short, shareable link (slug → token) — use this for SMS. */
  shortUrl: string;
  slug: string;
  expiresAt: string;
  insurerOptions: string[];
  /** Insurer derived from the appointment type, echoed back (null when none). */
  derivedInsurer: string | null;
}

/** Short, URL-safe slug for shareable links (no lookalike-confusing chars). */
function makeSlug(): string {
  return randomBytes(6).toString("base64url"); // 8 chars, ~2.8e14 space
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
  const derivedInsurer = params.derivedInsurer?.trim() || null;

  const ref = db.collection("clinics").doc(clinicId).collection(INTAKE_LINKS).doc();
  await ref.set({
    patientRef: params.patientRef,
    appointmentId: params.appointmentId ?? null,
    insurerOptions,
    derivedInsurer,
    fallbackToInvoiceExtraInfo: params.fallbackToInvoiceExtraInfo ?? true,
    consentVersion: INTAKE_CONSENT_VERSION,
    status: "issued",
    createdBy: params.createdBy,
    createdAt: new Date(params.nowMs).toISOString(),
    expiresAt: new Date(exp).toISOString(),
  });

  const token = signIntakeToken({ clinicId, linkId: ref.id, exp });
  const expiresAt = new Date(exp).toISOString();

  // Short-link pointer (slug → token) so SMS carries a clean, clickable URL
  // instead of a 200-char signed token. Resolved by /i/[slug] via Admin SDK.
  const slug = makeSlug();
  await db.collection(SHORTLINKS).doc(slug).set({
    token,
    clinicId,
    linkId: ref.id,
    expiresAt,
    createdAt: new Date(params.nowMs).toISOString(),
  });

  const base = appBaseUrl();
  return {
    linkId: ref.id,
    token,
    url: `${base}/intake/${token}`,
    shortUrl: `${base}/i/${slug}`,
    slug,
    expiresAt,
    insurerOptions,
    derivedInsurer,
  };
}
