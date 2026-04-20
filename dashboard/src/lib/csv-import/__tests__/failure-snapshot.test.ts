/**
 * Tests for buildFailureSnapshot — the helper that captures a structured
 * debugging view of a CSV that failed import.
 *
 * The snapshot is what the Settings page Rainbow-CSV-style preview renders:
 * parsed header + first N rows + which columns mapped to which canonical
 * fields + flagged rows from validation.
 *
 * Run: npx vitest run src/lib/csv-import/__tests__/failure-snapshot.test.ts
 */

import { describe, it, expect } from "vitest";
import { buildFailureSnapshot } from "../failure-snapshot";
import type { CSVSchema, ValidationResult, DetectionResult } from "../types";

const WRITEUPP_SCHEMA: CSVSchema = {
  id: "writeupp_activity_by_date",
  provider: "WriteUpp",
  version: "1",
  fileType: "appointments",
  fieldMap: {
    Date: "date",
    Time: "time",
    Patient: "patientId",
    Clinician: "practitioner",
    Status: "status",
    Type: "type",
  },
  dateFormat: "uk",
  statusMap: { Attended: "attended", Cancelled: "cancelled", "No show": "no_show" },
  requiredFields: ["date", "practitioner"],
  priority: 10,
};

const VALID_CSV = [
  "Date,Time,Patient,Clinician,Status,Type",
  "01/04/2026,09:00,P0001,Andrew,Attended,Physio",
  "01/04/2026,10:00,P0002,Max,Attended,Physio",
  "02/04/2026,09:45,P0003,Andrew,Cancelled,Physio",
].join("\n");

describe("buildFailureSnapshot — needsMapping path (detection failed)", () => {
  it("captures headers, sample rows, and marks ALL columns as unmatched", () => {
    const randomCsv = [
      "foo,bar,baz",
      "1,2,3",
      "4,5,6",
    ].join("\n");

    const snap = buildFailureSnapshot({
      csvText: randomCsv,
      fileName: "random.csv",
      fileType: "appointments",
      errorReason: "needs_mapping",
      message: "Could not auto-detect CSV format",
    });

    expect(snap.fileName).toBe("random.csv");
    expect(snap.headers).toEqual(["foo", "bar", "baz"]);
    expect(snap.rows).toHaveLength(2);
    expect(snap.rows[0]).toEqual(["1", "2", "3"]);
    expect(snap.columns).toHaveLength(3);
    // All columns unmatched when detection failed
    for (const col of snap.columns) {
      expect(col.mapped).toBe(false);
      expect(col.canonicalField).toBeUndefined();
    }
    expect(snap.schema).toBeNull();
    expect(snap.errorReason).toBe("needs_mapping");
  });

  it("caps sample rows at 20 even for large files", () => {
    const lines = ["a,b,c"];
    for (let i = 0; i < 50; i++) lines.push(`${i},${i + 1},${i + 2}`);
    const snap = buildFailureSnapshot({
      csvText: lines.join("\n"),
      fileName: "big.csv",
      fileType: "appointments",
      errorReason: "needs_mapping",
    });
    expect(snap.rows).toHaveLength(20);
    expect(snap.totalRowCount).toBe(50);
  });

  it("returns empty rows for a header-only file", () => {
    const snap = buildFailureSnapshot({
      csvText: "a,b,c",
      fileName: "headers-only.csv",
      fileType: "appointments",
      errorReason: "empty_file",
    });
    expect(snap.headers).toEqual(["a", "b", "c"]);
    expect(snap.rows).toEqual([]);
    expect(snap.totalRowCount).toBe(0);
  });
});

describe("buildFailureSnapshot — validation-failed path", () => {
  const detection: DetectionResult = {
    schema: WRITEUPP_SCHEMA,
    confidence: 0.85,
    matchedFields: 6,
    unmatchedHeaders: [],
    missingRequired: [],
  };

  it("marks each column with its mapped canonical field when detection succeeded", () => {
    const snap = buildFailureSnapshot({
      csvText: VALID_CSV,
      fileName: "writeupp.csv",
      fileType: "appointments",
      errorReason: "validation_failed",
      detection,
    });

    const byHeader = Object.fromEntries(snap.columns.map((c) => [c.header, c]));
    expect(byHeader["Date"].mapped).toBe(true);
    expect(byHeader["Date"].canonicalField).toBe("date");
    expect(byHeader["Date"].isRequired).toBe(true);
    expect(byHeader["Clinician"].canonicalField).toBe("practitioner");
    expect(byHeader["Clinician"].isRequired).toBe(true);
    expect(byHeader["Time"].isRequired).toBe(false);
  });

  it("flags unmatched headers as mapped=false", () => {
    const csvWithExtra = [
      "Date,Time,Patient,Clinician,Status,Type,InternalID,Notes",
      "01/04/2026,09:00,P0001,Andrew,Attended,Physio,X1,—",
    ].join("\n");

    const snap = buildFailureSnapshot({
      csvText: csvWithExtra,
      fileName: "writeupp.csv",
      fileType: "appointments",
      errorReason: "validation_failed",
      detection: {
        ...detection,
        unmatchedHeaders: ["InternalID", "Notes"],
      },
    });

    const byHeader = Object.fromEntries(snap.columns.map((c) => [c.header, c]));
    expect(byHeader["InternalID"].mapped).toBe(false);
    expect(byHeader["Notes"].mapped).toBe(false);
    expect(byHeader["Date"].mapped).toBe(true);
  });

  it("captures validation errors and warnings on the snapshot", () => {
    const validation: ValidationResult = {
      valid: false,
      errors: [
        {
          type: "date_parse_failure_threshold",
          message: "30% of rows have unparseable dates",
        },
      ],
      warnings: [
        {
          type: "unknown_status_values",
          message: "Found unknown status: Booked",
          details: { values: ["Booked"] },
        },
      ],
      stats: {
        totalRows: 3,
        validRows: 2,
        skippedRows: 1,
        dateParseFailures: 1,
        unknownStatuses: ["Booked"],
        duplicateHash: null,
      },
    };

    const snap = buildFailureSnapshot({
      csvText: VALID_CSV,
      fileName: "writeupp.csv",
      fileType: "appointments",
      errorReason: "validation_failed",
      detection,
      validation,
    });

    expect(snap.errors).toHaveLength(1);
    expect(snap.errors[0].type).toBe("date_parse_failure_threshold");
    expect(snap.warnings).toHaveLength(1);
    expect(snap.warnings[0].type).toBe("unknown_status_values");
    expect(snap.stats?.validRows).toBe(2);
  });

  it("exposes schema name for display when detection succeeded", () => {
    const snap = buildFailureSnapshot({
      csvText: VALID_CSV,
      fileName: "writeupp.csv",
      fileType: "appointments",
      errorReason: "validation_failed",
      detection,
    });
    expect(snap.schema).toEqual({
      id: "writeupp_activity_by_date",
      provider: "WriteUpp",
      confidence: 0.85,
    });
  });

  it("missing required fields show up as required columns not in headers", () => {
    const noPractitionerCsv = [
      "Date,Patient,Status,Type",
      "01/04/2026,P0001,Attended,Physio",
    ].join("\n");

    const snap = buildFailureSnapshot({
      csvText: noPractitionerCsv,
      fileName: "broken.csv",
      fileType: "appointments",
      errorReason: "validation_failed",
      detection: {
        ...detection,
        matchedFields: 4,
        missingRequired: ["practitioner"],
      },
    });

    expect(snap.missingRequired).toEqual(["practitioner"]);
  });
});

describe("buildFailureSnapshot — resilience", () => {
  it("handles CRLF line endings", () => {
    const crlf = "a,b\r\n1,2\r\n3,4\r\n";
    const snap = buildFailureSnapshot({
      csvText: crlf,
      fileName: "crlf.csv",
      fileType: "appointments",
      errorReason: "needs_mapping",
    });
    expect(snap.headers).toEqual(["a", "b"]);
    expect(snap.rows).toHaveLength(2);
  });

  it("handles quoted commas inside values", () => {
    const quoted = [
      "name,note",
      `"Jane Doe","Got back pain, severe"`,
    ].join("\n");
    const snap = buildFailureSnapshot({
      csvText: quoted,
      fileName: "quoted.csv",
      fileType: "appointments",
      errorReason: "needs_mapping",
    });
    expect(snap.rows[0]).toEqual(["Jane Doe", "Got back pain, severe"]);
  });

  it("truncates extremely long cell values to keep snapshot bounded", () => {
    const huge = "x".repeat(5000);
    const snap = buildFailureSnapshot({
      csvText: `header\n${huge}`,
      fileName: "huge.csv",
      fileType: "appointments",
      errorReason: "needs_mapping",
    });
    expect(snap.rows[0][0].length).toBeLessThanOrEqual(300);
  });
});
