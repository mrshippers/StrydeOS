/**
 * Build a structured debug snapshot from a CSV that failed import.
 *
 * The snapshot is a serialisable summary of the offending file + the import
 * pipeline's verdict on it. It is persisted to Firestore as part of the
 * csv_import_history entry and rendered by the Settings-page preview so the
 * clinic owner can see exactly which columns mapped, which didn't, and which
 * rows triggered validation errors — without leaving the app.
 *
 * Size bounds (by design):
 *   - at most 20 rows
 *   - each cell capped at 300 chars
 *   - validation / detection are already bounded by the upstream contract
 *
 * This module is pure — no Firestore writes, no network. Callers own persistence.
 */

import type {
  CanonicalField,
  CSVFileType,
  DetectionResult,
  ValidationError,
  ValidationResult,
  ValidationStats,
  ValidationWarning,
} from "./types";

const MAX_SAMPLE_ROWS = 20;
const MAX_CELL_LENGTH = 300;

export type FailureReason =
  | "needs_mapping"
  | "validation_failed"
  | "empty_file"
  | "parse_error"
  | "schema_not_found";

export interface ColumnSnapshot {
  /** The raw header as it appeared in the CSV. */
  header: string;
  /** Whether the detector mapped this column to a canonical field. */
  mapped: boolean;
  /** If mapped, which canonical field it maps to. */
  canonicalField?: CanonicalField;
  /** Whether the mapped canonical field is a required field for the schema. */
  isRequired: boolean;
}

export interface FailureSnapshot {
  fileName: string;
  fileType: CSVFileType;
  errorReason: FailureReason;
  message?: string;
  headers: string[];
  rows: string[][];
  totalRowCount: number;
  columns: ColumnSnapshot[];
  schema: { id: string; provider: string; confidence: number } | null;
  missingRequired: CanonicalField[];
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: ValidationStats | null;
  createdAt: string;
}

export interface BuildFailureSnapshotInput {
  csvText: string;
  fileName: string;
  fileType: CSVFileType;
  errorReason: FailureReason;
  message?: string;
  detection?: DetectionResult;
  validation?: ValidationResult;
}

// ── CSV parsing (mirror of run-import's parser; kept local so this module
//    remains a leaf with no cross-file coupling to the write pipeline) ──────

function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function cap(value: string): string {
  return value.length > MAX_CELL_LENGTH ? value.slice(0, MAX_CELL_LENGTH) : value;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function buildFailureSnapshot(input: BuildFailureSnapshotInput): FailureSnapshot {
  const lines = splitLines(input.csvText);
  const headerLine = lines[0] ?? "";
  const headers = parseCSVRow(headerLine).map((h) => h.trim());

  // Parse data rows, skipping blanks
  const parsedRows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    parsedRows.push(parseCSVRow(line).map((v) => cap(v.trim())));
  }

  const sampleRows = parsedRows.slice(0, MAX_SAMPLE_ROWS);

  // Build column map from detection if available
  const columns = buildColumnSnapshots(headers, input.detection);

  const schema = input.detection
    ? {
        id: input.detection.schema.id,
        provider: input.detection.schema.provider,
        confidence: input.detection.confidence,
      }
    : null;

  return {
    fileName: input.fileName,
    fileType: input.fileType,
    errorReason: input.errorReason,
    message: input.message,
    headers,
    rows: sampleRows,
    totalRowCount: parsedRows.length,
    columns,
    schema,
    missingRequired: input.detection?.missingRequired ?? [],
    errors: input.validation?.errors ?? [],
    warnings: input.validation?.warnings ?? [],
    stats: input.validation?.stats ?? null,
    createdAt: new Date().toISOString(),
  };
}

function buildColumnSnapshots(
  headers: string[],
  detection: DetectionResult | undefined,
): ColumnSnapshot[] {
  if (!detection) {
    // Detection failed — every column is unmatched
    return headers.map((header) => ({ header, mapped: false, isRequired: false }));
  }

  const schema = detection.schema;
  const requiredSet = new Set<CanonicalField>(schema.requiredFields);
  const unmatchedSet = new Set(detection.unmatchedHeaders.map((h) => h.toLowerCase()));

  // Build header → canonical map by case-insensitive lookup against schema.fieldMap keys
  const headerToCanonical = new Map<string, CanonicalField>();
  for (const [aliasKey, canonical] of Object.entries(schema.fieldMap)) {
    headerToCanonical.set(aliasKey.toLowerCase().trim(), canonical);
  }

  return headers.map((header) => {
    const lower = header.toLowerCase().trim();
    if (unmatchedSet.has(lower)) {
      return { header, mapped: false, isRequired: false };
    }
    const canonical = headerToCanonical.get(lower);
    if (!canonical) {
      return { header, mapped: false, isRequired: false };
    }
    return {
      header,
      mapped: true,
      canonicalField: canonical,
      isRequired: requiredSet.has(canonical),
    };
  });
}
