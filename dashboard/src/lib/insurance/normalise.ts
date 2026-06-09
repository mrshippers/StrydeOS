/**
 * Normalisation: raw capture payloads (form / voice) → canonical InsuranceRecord.
 *
 * Pure functions. The caller supplies `capturedAt` and context so behaviour is
 * deterministic and testable — nothing here reads the clock.
 */

import type {
  CaptureContext,
  InsuranceRecord,
  RawFormSubmission,
  RawVoiceExtraction,
} from "./types";
import { formConfidence, voiceConfidence } from "./confidence";

/**
 * Parse a free-typed excess into pence. Accepts "£50", "50", "50.25", or a
 * number (interpreted as pounds). Returns undefined for empty/unparseable input.
 */
export function excessToPence(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    return Number.isNaN(value) ? undefined : Math.round(value * 100);
  }
  const cleaned = value.replace(/[£$,\s]/g, "").trim();
  if (cleaned === "") return undefined;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const pounds = Number(cleaned);
  return Number.isNaN(pounds) ? undefined : Math.round(pounds * 100);
}

function clean(value?: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function applyOptional(record: InsuranceRecord, input: {
  scheme?: string;
  authorisationCode?: string;
  claimReference?: string;
  excess?: string | number;
  validFrom?: string;
  validTo?: string;
  addressLine1?: string;
  addressLine2?: string;
  town?: string;
  county?: string;
  postcode?: string;
  country?: string;
}): void {
  const scheme = clean(input.scheme);
  if (scheme) record.scheme = scheme;
  const auth = clean(input.authorisationCode);
  if (auth) record.authorisationCode = auth;
  const claim = clean(input.claimReference);
  if (claim) record.claimReference = claim;
  const excess = excessToPence(input.excess);
  if (excess !== undefined) record.excessPence = excess;
  const validFrom = clean(input.validFrom);
  if (validFrom) record.validFrom = validFrom;
  const validTo = clean(input.validTo);
  if (validTo) record.validTo = validTo;

  const line1 = clean(input.addressLine1);
  if (line1) record.addressLine1 = line1;
  const line2 = clean(input.addressLine2);
  if (line2) record.addressLine2 = line2;
  const town = clean(input.town);
  if (town) record.town = town;
  const county = clean(input.county);
  if (county) record.county = county;
  const postcode = clean(input.postcode);
  if (postcode) record.postcode = postcode.toUpperCase();
  const country = clean(input.country);
  if (country) record.country = country;
}

export function normaliseFormSubmission(
  input: RawFormSubmission,
  ctx: CaptureContext,
): InsuranceRecord {
  const capturedBy = ctx.capturedBy ?? "patient";
  const record: InsuranceRecord = {
    tenantId: ctx.tenantId,
    patientRef: ctx.patientRef,
    source: "form",
    insurerName: (input.insurerName ?? "").trim(),
    policyNumber: (input.policyNumber ?? "").trim(),
    confidence: formConfidence(),
    capturedAt: ctx.capturedAt,
    capturedBy,
    reviewStatus: "pending",
    audit: [{ at: ctx.capturedAt, actor: capturedBy, action: "captured" }],
  };

  applyOptional(record, input);

  if (input.consent) {
    record.consentAt = ctx.capturedAt;
    if (ctx.consentVersion) record.consentVersion = ctx.consentVersion;
  }

  return record;
}

export function normaliseVoiceExtraction(
  input: RawVoiceExtraction,
  ctx: CaptureContext,
): InsuranceRecord {
  const capturedBy = ctx.capturedBy ?? "ava";
  const insurerName = (input.insurerName ?? "").trim();
  const policyNumber = (input.policyNumber ?? "").trim();
  const readBackConfirmed = input.readBackConfirmed ?? false;

  const record: InsuranceRecord = {
    tenantId: ctx.tenantId,
    patientRef: ctx.patientRef,
    source: "voice",
    insurerName,
    policyNumber,
    confidence: voiceConfidence({
      readBackConfirmed,
      sttConfidence: input.sttConfidence,
      hasInsurer: insurerName.length > 0,
      hasPolicyNumber: policyNumber.length > 0,
    }),
    readBackConfirmed,
    capturedAt: ctx.capturedAt,
    capturedBy,
    reviewStatus: "pending",
    audit: [{ at: ctx.capturedAt, actor: capturedBy, action: "captured" }],
  };

  applyOptional(record, input);

  return record;
}
