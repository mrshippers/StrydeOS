/**
 * PHI redaction helpers. Policy and authorisation values must never appear
 * in full in logs, analytics, or error reports — only the last 4 characters.
 */

import type { InsuranceRecord } from "./types";

const MASK = "•";

/** Mask all but the last 4 characters. Whitespace is trimmed before measuring. */
export function redactPolicyNumber(value: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length <= 4) return MASK.repeat(trimmed.length);
  return MASK.repeat(trimmed.length - 4) + trimmed.slice(-4);
}

/**
 * Returns a shallow copy of the record safe to log: policy number and
 * authorisation code are redacted to last 4. The original is never mutated.
 */
export function redactRecordForLog(record: InsuranceRecord): InsuranceRecord {
  return {
    ...record,
    policyNumber: redactPolicyNumber(record.policyNumber),
    authorisationCode: record.authorisationCode
      ? redactPolicyNumber(record.authorisationCode)
      : record.authorisationCode,
  };
}
