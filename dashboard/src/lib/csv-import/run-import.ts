import type { Firestore } from "firebase-admin/firestore";
import { computeWeeklyMetricsForClinic } from "@/lib/metrics/compute-weekly";
import { BUILTIN_SCHEMAS, getSchemaById } from "./schemas";
import { detectSchema } from "./detect";
import { validateCSV } from "./validate";
import { resolveField, buildDateTimeWithFormat, resolveStatus } from "./resolve";
import type { CSVSchema, CSVFileType, ValidationWarning } from "./types";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  const headers = parseCSVRow(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

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

function parsePrice(raw: string): number | undefined {
  if (!raw) return undefined;
  const n = parseFloat(raw.replace(/[£$€,\s]/g, ""));
  if (isNaN(n)) return undefined;
  return Math.round(n * 100);
}

function extractHeaders(text: string): string[] {
  const firstLine = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")[0] ?? "";
  return parseCSVRow(firstLine).map((h) => h.trim());
}

async function loadCustomSchemas(
  db: Firestore,
  clinicId: string
): Promise<CSVSchema[]> {
  try {
    const snap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("csv_schemas")
      .get();
    if (snap.empty) return [];
    return snap.docs.map((doc) => doc.data() as CSVSchema);
  } catch {
    return [];
  }
}

export interface ImportInput {
  csvText: string;
  fileName: string;
  fileType: CSVFileType;
  clinicId: string;
  importedBy: string;
  schemaId?: string;
}

interface NeedsMappingResult {
  ok: false;
  needsMapping: true;
  headers: string[];
  sampleRows: Record<string, string>[];
  message: string;
}

interface ValidationFailResult {
  ok: false;
  needsMapping?: undefined;
  validationErrors: { type: string; message: string; details?: Record<string, unknown> }[];
  warnings: ValidationWarning[];
  stats: Record<string, unknown>;
  schemaUsed: string;
  message: string;
}

interface SuccessResult {
  ok: true;
  needsMapping?: undefined;
  written: number;
  skipped: number;
  metricsWritten: number;
  errors: string[];
  schemaUsed: string;
  warnings: ValidationWarning[];
  message: string;
}

interface ErrorResult {
  ok: false;
  needsMapping?: undefined;
  error: string;
}

export type ImportResult = NeedsMappingResult | ValidationFailResult | SuccessResult | ErrorResult;

export async function runCSVImport(
  db: Firestore,
  input: ImportInput
): Promise<ImportResult> {
  const { csvText, fileName, fileType, clinicId, importedBy, schemaId: requestedSchemaId } = input;

  const rows = parseCSV(csvText);
  if (rows.length === 0) {
    return { ok: false, error: "CSV is empty or could not be parsed" };
  }

  const now = new Date().toISOString();
  const clinicRef = db.collection("clinics").doc(clinicId);

  const headers = extractHeaders(csvText);
  const customSchemas = await loadCustomSchemas(db, clinicId);
  let schema: CSVSchema | undefined;

  if (requestedSchemaId) {
    schema = getSchemaById(requestedSchemaId)
      ?? customSchemas.find((s) => s.id === requestedSchemaId);
    if (!schema) {
      return { ok: false, error: `Schema not found: ${requestedSchemaId}` };
    }
  } else {
    const allSchemas = [...BUILTIN_SCHEMAS, ...customSchemas];
    const detection = detectSchema(headers, allSchemas, fileType);
    if (!detection) {
      return {
        ok: false,
        needsMapping: true,
        headers,
        sampleRows: rows.slice(0, 5),
        message: "Could not auto-detect CSV format. Manual column mapping required.",
      };
    }
    schema = detection.schema;
  }

  const validation = await validateCSV(rows, schema, clinicId, db, csvText);
  if (validation.errors.length > 0) {
    return {
      ok: false,
      validationErrors: validation.errors,
      warnings: validation.warnings,
      stats: validation.stats as unknown as Record<string, unknown>,
      schemaUsed: schema.id,
      message: `Validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
    };
  }

  const { fieldMap, statusMap, dateFormat } = schema;
  let written = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (fileType === "appointments") {
    const apptColl = clinicRef.collection("appointments");
    const batch = db.batch();
    let batchCount = 0;

    for (const row of rows) {
      const dateStr = resolveField(row, fieldMap, "date");
      const timeStr = resolveField(row, fieldMap, "time");
      const practitioner = resolveField(row, fieldMap, "practitioner");
      const patientIdRaw = resolveField(row, fieldMap, "patientId");
      const statusRaw = resolveField(row, fieldMap, "status");
      const apptType = resolveField(row, fieldMap, "type");

      if (!dateStr && !practitioner) { skipped++; continue; }

      const dateTime = buildDateTimeWithFormat(dateStr, timeStr, dateFormat);
      const endDateStr = resolveField(row, fieldMap, "endDate") || dateStr;
      const endTimeStr = resolveField(row, fieldMap, "endTime");
      const endTime = buildDateTimeWithFormat(endDateStr, endTimeStr, dateFormat);

      const patientId = patientIdRaw || `csv_${resolveField(row, fieldMap, "patientFirst")}_${resolveField(row, fieldMap, "patientLast")}`.replace(/\s+/g, "_").toLowerCase();

      const docId = `csv_${dateTime}_${practitioner}_${patientId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);

      batch.set(apptColl.doc(docId), {
        externalId: docId,
        patientExternalId: patientId,
        clinicianExternalId: practitioner,
        clinicianName: practitioner,
        dateTime,
        endTime,
        status: resolveStatus(statusRaw, statusMap),
        appointmentType: apptType || undefined,
        revenueAmountPence: parsePrice(resolveField(row, fieldMap, "price")),
        notes: resolveField(row, fieldMap, "notes") || undefined,
        source: "csv_import",
        importedAt: now,
      }, { merge: true });
      batchCount++;
      written++;

      if (batchCount >= 450) {
        await batch.commit();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();

    const patientBatch = db.batch();
    let pBatchCount = 0;
    const patientColl = clinicRef.collection("patients");

    for (const row of rows) {
      const patientIdRaw = resolveField(row, fieldMap, "patientId");
      const firstName = resolveField(row, fieldMap, "patientFirst");
      const lastName = resolveField(row, fieldMap, "patientLast");
      if (!patientIdRaw && !firstName && !lastName) continue;

      const pid = patientIdRaw || `csv_${firstName}_${lastName}`.replace(/\s+/g, "_").toLowerCase();
      const docId = `p_${pid}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);

      patientBatch.set(patientColl.doc(docId), {
        pmsExternalId: pid,
        firstName: firstName || "Unknown",
        lastName: lastName || "",
        email: resolveField(row, fieldMap, "patientEmail") || undefined,
        phone: resolveField(row, fieldMap, "patientPhone") || undefined,
        dob: resolveField(row, fieldMap, "patientDob") || undefined,
        source: "csv_import",
        importedAt: now,
      }, { merge: true });
      pBatchCount++;

      if (pBatchCount >= 450) {
        await patientBatch.commit();
        pBatchCount = 0;
      }
    }
    if (pBatchCount > 0) await patientBatch.commit();

  } else {
    const patientColl = clinicRef.collection("patients");
    const batch = db.batch();
    let batchCount = 0;

    for (const row of rows) {
      const patientIdRaw = resolveField(row, fieldMap, "patientId");
      const firstName = resolveField(row, fieldMap, "patientFirst");
      const lastName = resolveField(row, fieldMap, "patientLast");
      if (!patientIdRaw && !firstName && !lastName) { skipped++; continue; }

      const pid = patientIdRaw || `csv_${firstName}_${lastName}`.replace(/\s+/g, "_").toLowerCase();
      const docId = `p_${pid}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);

      batch.set(patientColl.doc(docId), {
        pmsExternalId: pid,
        firstName: firstName || "Unknown",
        lastName: lastName || "",
        email: resolveField(row, fieldMap, "patientEmail") || undefined,
        phone: resolveField(row, fieldMap, "patientPhone") || undefined,
        dob: resolveField(row, fieldMap, "patientDob") || undefined,
        source: "csv_import",
        importedAt: now,
      }, { merge: true });
      batchCount++;
      written++;

      if (batchCount >= 450) {
        await batch.commit();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();
  }

  let metricsWritten = 0;
  if (fileType === "appointments") {
    try {
      const { written: mw } = await computeWeeklyMetricsForClinic(db, clinicId, 13);
      metricsWritten = mw;
    } catch (e) {
      errors.push(`Metrics recompute: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await clinicRef.set(
    {
      pmsType: "csv_import",
      pmsLastSyncAt: now,
      "onboarding.pmsConnected": true,
      updatedAt: now,
    },
    { merge: true }
  );

  try {
    await clinicRef.collection("csv_import_history").add({
      fileName,
      fileHash: validation.stats.duplicateHash,
      fileType,
      schemaId: schema.id,
      provider: schema.provider,
      rowsWritten: written,
      rowsSkipped: skipped,
      warnings: validation.warnings,
      importedAt: now,
      importedBy,
    });
  } catch {
    errors.push("Failed to write import history record");
  }

  return {
    ok: true,
    written,
    skipped,
    metricsWritten,
    errors,
    schemaUsed: schema.id,
    warnings: validation.warnings,
    message: `Imported ${written} ${fileType} records${metricsWritten ? `, recomputed ${metricsWritten} metric weeks` : ""}`,
  };
}
