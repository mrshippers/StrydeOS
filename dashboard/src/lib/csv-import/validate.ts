import { createHash } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import type {
  CSVSchema,
  CanonicalField,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from "./types";
import { resolveField, isDateParseable } from "./resolve";

// Firestore index needed for duplicate detection:
// Collection: clinics/{clinicId}/csv_import_history
// Composite index: fileHash ASC, importedAt DESC

function normaliseKey(key: string): string {
  return key.toLowerCase().trim().replace(/\s+/g, "_");
}

/**
 * Detect a slash-separated date string that looks like US M/D/YYYY — i.e.
 * the first segment is a valid month (1-12) and the second segment is a
 * valid day-of-month (1-31). Used to distinguish "owner picked the wrong
 * export format" from "file is genuinely malformed".
 */
function looksLikeUsDate(raw: string): boolean {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/\d{2,4}$/);
  if (!match) return false;
  const first = parseInt(match[1], 10);
  const second = parseInt(match[2], 10);
  return first >= 1 && first <= 12 && second >= 1 && second <= 31;
}

/**
 * Check which of the schema's required canonical fields are present in the CSV headers.
 */
function findMissingRequired(
  headers: string[],
  schema: CSVSchema
): CanonicalField[] {
  const normHeaders = new Set(headers.map(normaliseKey));
  const coveredCanonicals = new Set<CanonicalField>();

  for (const [sourceCol, canonical] of Object.entries(schema.fieldMap)) {
    if (normHeaders.has(normaliseKey(sourceCol))) {
      coveredCanonicals.add(canonical);
    }
  }

  return schema.requiredFields.filter((f) => !coveredCanonicals.has(f));
}

/**
 * Compute field coverage: ratio of schema fieldMap keys that have matching CSV headers.
 */
function computeFieldCoverage(headers: string[], schema: CSVSchema): number {
  const normHeaders = new Set(headers.map(normaliseKey));
  const fieldMapKeys = Object.keys(schema.fieldMap);
  const uniqueCanonicals = new Set(Object.values(schema.fieldMap));

  const matchedCanonicals = new Set<CanonicalField>();
  for (const key of fieldMapKeys) {
    if (normHeaders.has(normaliseKey(key))) {
      matchedCanonicals.add(schema.fieldMap[key]);
    }
  }

  return uniqueCanonicals.size > 0
    ? matchedCanonicals.size / uniqueCanonicals.size
    : 0;
}

/**
 * Validate a parsed CSV against a detected schema before Firestore writes.
 */
export async function validateCSV(
  rows: Record<string, string>[],
  schema: CSVSchema,
  clinicId: string,
  db: Firestore,
  fileContent?: string
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Stats accumulators
  let dateParseFailures = 0;
  let skippedRows = 0;
  const unknownStatusSet = new Set<string>();

  // ── 1. Empty file ──────────────────────────────────────────────────────────
  if (rows.length === 0) {
    errors.push({
      type: "empty_file",
      message: "The CSV file contains no data rows.",
    });
    return {
      valid: false,
      errors,
      warnings,
      stats: {
        totalRows: 0,
        validRows: 0,
        skippedRows: 0,
        dateParseFailures: 0,
        unknownStatuses: [],
        duplicateHash: null,
      },
    };
  }

  // ── 2. Too few rows ────────────────────────────────────────────────────────
  if (rows.length < 3) {
    errors.push({
      type: "too_few_rows",
      message: `CSV has only ${rows.length} data row(s). Minimum 3 required for a valid import.`,
      details: { rowCount: rows.length },
    });
  }

  // ── 3. Missing required columns ────────────────────────────────────────────
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const missingRequired = findMissingRequired(headers, schema);

  if (missingRequired.length > 0) {
    errors.push({
      type: "missing_required_column",
      message: `Missing required columns: ${missingRequired.join(", ")}`,
      details: { missingFields: missingRequired },
    });
  }

  // ── 4. Date parse failures ─────────────────────────────────────────────────
  const failedDateStrings: string[] = [];
  for (const row of rows) {
    const dateStr = resolveField(row, schema.fieldMap, "date");
    if (!dateStr) {
      skippedRows++;
      continue;
    }
    if (!isDateParseable(dateStr, schema.dateFormat)) {
      dateParseFailures++;
      failedDateStrings.push(dateStr);
    }
  }

  // ── 4a. Date format mismatch (more specific than parse-rate) ───────────────
  // If the schema expects UK (DD/MM/YYYY) and >50% of failed rows look like
  // US-format M/D/YYYY (first segment 1-12, second 1-31), surface a typed,
  // owner-readable hint before the generic date-parse-rate error.
  if (schema.dateFormat === "uk" && failedDateStrings.length > 0) {
    const usLike = failedDateStrings.filter(looksLikeUsDate);
    const usLikeRate = usLike.length / failedDateStrings.length;
    if (usLikeRate > 0.5) {
      errors.push({
        type: "date_format_mismatch",
        message:
          "Looks like US-format dates (e.g. '3/14/2026'). WriteUpp exports DD/MM/YYYY (e.g. '14/03/2026'). Check your WriteUpp export settings.",
        details: {
          expected: "uk",
          detected: "us",
          sampleBadDates: usLike.slice(0, 3),
        },
      });
    }
  }

  const dateFailureRate = rows.length > 0 ? dateParseFailures / rows.length : 0;
  if (dateFailureRate > 0.15) {
    errors.push({
      type: "date_parse_failure_threshold",
      message: `${(dateFailureRate * 100).toFixed(1)}% of rows have unparseable dates (threshold: 15%). Check the date format matches ${schema.dateFormat.toUpperCase()}.`,
      details: { dateParseFailures, totalRows: rows.length, rate: dateFailureRate },
    });
  }

  // ── 5. Unknown statuses ────────────────────────────────────────────────────
  for (const row of rows) {
    const statusRaw = resolveField(row, schema.fieldMap, "status");
    if (!statusRaw) continue;
    const key = statusRaw.toLowerCase().trim();
    if (!(key in schema.statusMap)) {
      unknownStatusSet.add(statusRaw.trim());
    }
  }

  if (unknownStatusSet.size > 0) {
    warnings.push({
      type: "unknown_status_values",
      message: `${unknownStatusSet.size} unknown status value(s) found: ${[...unknownStatusSet].join(", ")}. These will default to "scheduled".`,
      details: { unknownStatuses: [...unknownStatusSet] },
    });
  }

  // ── 6. Low field coverage ──────────────────────────────────────────────────
  const coverage = computeFieldCoverage(headers, schema);
  if (coverage < 0.5) {
    warnings.push({
      type: "low_field_coverage",
      message: `Only ${(coverage * 100).toFixed(0)}% of expected fields matched. Some data may be missing.`,
      details: { coverage },
    });
  }

  // ── 7. Duplicate detection ─────────────────────────────────────────────────
  let duplicateHash: string | null = null;

  if (fileContent) {
    duplicateHash = createHash("sha256").update(fileContent).digest("hex");

    try {
      const historySnap = await db
        .collection("clinics")
        .doc(clinicId)
        .collection("csv_import_history")
        .where("fileHash", "==", duplicateHash)
        .limit(1)
        .get();

      if (!historySnap.empty) {
        const prev = historySnap.docs[0].data();
        warnings.push({
          type: "possible_duplicate",
          message: `This file appears to have been imported before (${prev.importedAt ?? "unknown date"}).`,
          details: { previousImportId: historySnap.docs[0].id, previousImportAt: prev.importedAt },
        });
      }
    } catch {
      // Firestore query failed — skip duplicate check rather than blocking import
    }
  }

  // ── 8. Large file ──────────────────────────────────────────────────────────
  if (rows.length > 10000) {
    warnings.push({
      type: "large_file",
      message: `Large file: ${rows.length.toLocaleString()} rows. Import will proceed but may take longer.`,
      details: { rowCount: rows.length },
    });
  }

  // ── Assemble result ────────────────────────────────────────────────────────
  const validRows = rows.length - skippedRows - dateParseFailures;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalRows: rows.length,
      validRows: Math.max(0, validRows),
      skippedRows,
      dateParseFailures,
      unknownStatuses: [...unknownStatusSet],
      duplicateHash,
    },
  };
}
