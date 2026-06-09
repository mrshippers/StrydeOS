/**
 * CSV export of internal insurance records (PMS-agnostic).
 *
 * This is the fallback for clinics that decline API writes or run a PMS we do
 * not yet integrate. Values are exported in full (this is a deliberate data
 * export for the clinic's own use) — redaction applies to logs, not exports.
 * RFC 4180 quoting.
 */

import type { InsuranceRecord } from "./types";

export const INSURANCE_CSV_HEADER =
  "tenantId,patientRef,source,insurerName,scheme,policyNumber,authorisationCode,claimReference,excessPence,validFrom,validTo,confidence,capturedAt,reviewStatus";

function cell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toInsuranceCsv(records: InsuranceRecord[]): string {
  const rows = records.map((r) =>
    [
      r.tenantId,
      r.patientRef,
      r.source,
      r.insurerName,
      r.scheme,
      r.policyNumber,
      r.authorisationCode,
      r.claimReference,
      r.excessPence,
      r.validFrom,
      r.validTo,
      r.confidence,
      r.capturedAt,
      r.reviewStatus,
    ]
      .map(cell)
      .join(","),
  );
  return [INSURANCE_CSV_HEADER, ...rows].join("\n");
}
