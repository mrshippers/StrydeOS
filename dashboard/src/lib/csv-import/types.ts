import type { AppointmentStatus } from "@/types";

// ─── Canonical Fields ────────────────────────────────────────────────────────

export type CanonicalField =
  | "date"
  | "time"
  | "endDate"
  | "endTime"
  | "patientId"
  | "patientFirst"
  | "patientLast"
  | "patientEmail"
  | "patientPhone"
  | "patientDob"
  | "practitioner"
  | "practitionerId"
  | "type"
  | "status"
  | "notes"
  | "price"
  | "duration";

export type CSVFileType = "appointments" | "patients" | "both";
export type DateFormat = "uk" | "us" | "iso";

// ─── Schema ──────────────────────────────────────────────────────────────────

export interface CSVSchema {
  id: string;
  provider: string;
  version: string;
  fileType: CSVFileType;
  fieldMap: Record<string, CanonicalField>;
  dateFormat: DateFormat;
  statusMap: Record<string, AppointmentStatus>;
  requiredFields: CanonicalField[];
  priority: number;
}

// ─── Detection ───────────────────────────────────────────────────────────────

export interface DetectionResult {
  schema: CSVSchema;
  confidence: number;
  matchedFields: number;
  unmatchedHeaders: string[];
  missingRequired: CanonicalField[];
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type ValidationErrorType =
  | "missing_required_column"
  | "empty_file"
  | "date_parse_failure_threshold"
  | "too_few_rows";

export type ValidationWarningType =
  | "unknown_status_values"
  | "low_field_coverage"
  | "possible_duplicate"
  | "large_file";

export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationWarning {
  type: ValidationWarningType;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationStats {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  dateParseFailures: number;
  unknownStatuses: string[];
  duplicateHash: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: ValidationStats;
}
