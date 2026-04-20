"use client";

/**
 * Rainbow-CSV-style preview for a CSV that failed to import.
 *
 * Renders the first ~20 rows of the offending file with:
 *   - Alternating column tints (paletted, not zebra) for readability
 *   - Per-column badge showing mapped canonical field OR "unmapped"
 *   - Required fields in green, optional-mapped in blue, unmapped in amber
 *   - Validation errors + warnings as chips above the table
 *   - Stats line (rows seen / date-parse failures / unknown statuses)
 *
 * The component is purely presentational — it consumes a FailureSnapshot
 * written by the inbound route and requires no Firestore access itself.
 */

import {
  AlertTriangle,
  FileText,
  Info,
  Mail,
  CircleAlert,
  Calendar,
} from "lucide-react";
import type { FailureSnapshot } from "@/lib/csv-import/failure-snapshot";
import {
  columnTintClass,
  columnStatusClass,
  columnStatusLabel,
} from "@/lib/csv-import/preview-styling";

interface CSVFailurePreviewProps {
  snapshot: FailureSnapshot;
  sender?: string;
  receivedAt?: string;
}

const REASON_LABELS: Record<FailureSnapshot["errorReason"], string> = {
  needs_mapping: "Format not recognised",
  validation_failed: "Validation failed",
  empty_file: "Empty file",
  parse_error: "Could not parse CSV",
  schema_not_found: "Schema not found",
};

const REASON_BODIES: Record<FailureSnapshot["errorReason"], string> = {
  needs_mapping:
    "We couldn't auto-detect which PMS this export came from. Check the highlighted columns below — if this is WriteUpp/Cliniko/etc., the column names may have changed.",
  validation_failed:
    "We matched this to a known format, but some rows didn't meet the validation thresholds. See the errors below.",
  empty_file: "The CSV had no data rows — just headers or blank.",
  parse_error: "We couldn't parse this CSV. Check for mixed line endings or unclosed quotes.",
  schema_not_found: "The requested schema ID doesn't exist.",
};

export default function CSVFailurePreview({
  snapshot,
  sender,
  receivedAt,
}: CSVFailurePreviewProps) {
  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="p-5 border-b border-border bg-cloud-light/40">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-warn/10 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-warn" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-navy truncate">
                {snapshot.fileName}
              </p>
              <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-warn/10 text-warn shrink-0">
                {REASON_LABELS[snapshot.errorReason]}
              </span>
            </div>
            <p className="text-[11px] text-muted mt-0.5">
              {REASON_BODIES[snapshot.errorReason]}
            </p>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-muted">
              {sender && (
                <span className="flex items-center gap-1">
                  <Mail size={10} />
                  {sender}
                </span>
              )}
              {receivedAt && (
                <span className="flex items-center gap-1">
                  <Calendar size={10} />
                  {formatDate(receivedAt)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <FileText size={10} />
                {snapshot.totalRowCount} row{snapshot.totalRowCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Schema detection summary ───────────────────────────────────────── */}
      {snapshot.schema && (
        <div className="px-5 py-3 border-b border-border bg-blue/[0.02]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-muted">Detected as</p>
              <p className="text-sm font-semibold text-navy">
                {snapshot.schema.provider}{" "}
                <span className="text-[10px] text-muted font-normal">
                  ({Math.round(snapshot.schema.confidence * 100)}% confidence)
                </span>
              </p>
            </div>
            {snapshot.missingRequired.length > 0 && (
              <div className="text-right">
                <p className="text-[10px] text-warn font-semibold uppercase tracking-wide">
                  Missing required
                </p>
                <p className="text-[11px] text-warn">
                  {snapshot.missingRequired.join(", ")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Errors / warnings ───────────────────────────────────────────────── */}
      {(snapshot.errors.length > 0 || snapshot.warnings.length > 0) && (
        <div className="px-5 py-3 space-y-2 border-b border-border">
          {snapshot.errors.map((err, i) => (
            <div
              key={`err-${i}`}
              className="flex items-start gap-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              <CircleAlert size={12} className="mt-0.5 shrink-0" />
              <span>{err.message}</span>
            </div>
          ))}
          {snapshot.warnings.map((warn, i) => (
            <div
              key={`warn-${i}`}
              className="flex items-start gap-2 text-[11px] text-warn bg-warn/5 border border-warn/20 rounded-lg px-3 py-2"
            >
              <Info size={12} className="mt-0.5 shrink-0" />
              <span>{warn.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Preview table ───────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              {snapshot.columns.map((col, idx) => (
                <th
                  key={`${col.header}-${idx}`}
                  className={`text-left px-3 py-2 font-semibold text-navy ${columnTintClass(idx)}`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="truncate">{col.header}</span>
                    <span
                      className={`inline-flex items-center self-start gap-1 px-1.5 py-0.5 rounded-full border text-[9px] uppercase tracking-wide font-semibold ${columnStatusClass(col)}`}
                    >
                      {columnStatusLabel(col)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-border/40">
                {row.map((cell, colIdx) => (
                  <td
                    key={colIdx}
                    className={`px-3 py-2 text-navy font-mono text-[11px] ${columnTintClass(colIdx)}`}
                  >
                    {cell || <span className="text-muted/60">—</span>}
                  </td>
                ))}
              </tr>
            ))}
            {snapshot.rows.length === 0 && (
              <tr>
                <td
                  colSpan={Math.max(1, snapshot.columns.length)}
                  className="px-3 py-6 text-center text-muted text-[11px]"
                >
                  No data rows in this file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer stats ────────────────────────────────────────────────────── */}
      {snapshot.stats && (
        <div className="px-5 py-3 border-t border-border bg-cloud-light/40 flex items-center gap-5 text-[10px] text-muted">
          <span>
            <span className="font-semibold text-navy">{snapshot.stats.validRows}</span>{" "}
            valid
          </span>
          <span>
            <span className="font-semibold text-navy">{snapshot.stats.skippedRows}</span>{" "}
            skipped
          </span>
          <span>
            <span className="font-semibold text-navy">
              {snapshot.stats.dateParseFailures}
            </span>{" "}
            bad dates
          </span>
          {snapshot.stats.unknownStatuses.length > 0 && (
            <span>
              Unknown statuses:{" "}
              <span className="font-semibold text-warn">
                {snapshot.stats.unknownStatuses.join(", ")}
              </span>
            </span>
          )}
        </div>
      )}

      {snapshot.totalRowCount > snapshot.rows.length && (
        <div className="px-5 py-2 text-[10px] text-muted border-t border-border/50 bg-white">
          Showing first {snapshot.rows.length} of {snapshot.totalRowCount} rows
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
