/**
 * Tests for clinician matching wired into runCSVImport().
 *
 * Verifies:
 *   a. All exact matches → 3 rows written with correct clinicianId.
 *   b. Fuzzy match above threshold → row written + flagged in fuzzyMatchedClinicians.
 *   c. Fuzzy match below threshold → row skipped + listed in unmatchedClinicians.
 *   d. Ambiguous match → row skipped + listed in ambiguousClinicians (with alternatives).
 *   e. PMS external ID beats name → row written, no warnings.
 *   f. Row count aggregation → 5 unmatched rows for one practitioner produce one entry with rowCount=5.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { runCSVImport, type ImportInput } from "../run-import";

// ─── Mock the metrics recompute (out of scope for this test) ─────────────────

vi.mock("@/lib/metrics/compute-weekly", () => ({
  computeWeeklyMetricsForClinic: vi.fn().mockResolvedValue({ written: 0 }),
}));

// ─── Firestore mock helpers ─────────────────────────────────────────────────

interface MockClinicianDoc {
  id: string;
  data: () => Record<string, unknown>;
}

interface MockBatch {
  set: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
}

interface MockDb {
  db: Firestore;
  apptSet: ReturnType<typeof vi.fn>;
  patientSet: ReturnType<typeof vi.fn>;
  historyAdd: ReturnType<typeof vi.fn>;
  clinicSet: ReturnType<typeof vi.fn>;
}

function createMockDb(clinicianDocs: MockClinicianDoc[], clinicData: Record<string, unknown> = {}): MockDb {
  const apptSet = vi.fn();
  const patientSet = vi.fn();
  const historyAdd = vi.fn().mockResolvedValue({ id: "history-1" });
  const clinicSet = vi.fn().mockResolvedValue(undefined);

  // Each batch tracks which collection it's writing to via the doc() factory.
  // We capture writes per-collection via per-collection `set` mocks attached to docRefs.
  const batches: MockBatch[] = [];
  const makeBatch = (): MockBatch => {
    const b: MockBatch = {
      set: vi.fn((docRef: { _kind: string }, data: Record<string, unknown>) => {
        if (docRef._kind === "appt") apptSet(data);
        if (docRef._kind === "patient") patientSet(data);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    batches.push(b);
    return b;
  };

  // Subcollection ref factories
  const apptColl = {
    doc: vi.fn((id: string) => ({ _kind: "appt", id })),
  };
  const patientColl = {
    doc: vi.fn((id: string) => ({ _kind: "patient", id })),
  };
  const cliniciansColl = {
    get: vi.fn().mockResolvedValue({ docs: clinicianDocs }),
  };
  const csvSchemasColl = {
    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  };
  const historyColl = {
    add: historyAdd,
  };

  const clinicDocRef = {
    set: clinicSet,
    get: vi.fn().mockResolvedValue({ exists: true, data: () => clinicData }),
    collection: vi.fn((name: string) => {
      if (name === "appointments") return apptColl;
      if (name === "patients") return patientColl;
      if (name === "clinicians") return cliniciansColl;
      if (name === "csv_schemas") return csvSchemasColl;
      if (name === "csv_import_history") return historyColl;
      return { get: vi.fn().mockResolvedValue({ empty: true, docs: [] }) };
    }),
  };

  const db = {
    collection: vi.fn((name: string) => {
      if (name === "clinics") {
        return { doc: vi.fn(() => clinicDocRef) };
      }
      return { doc: vi.fn() };
    }),
    batch: vi.fn(() => makeBatch()),
  };

  return {
    db: db as unknown as Firestore,
    apptSet,
    patientSet,
    historyAdd,
    clinicSet,
  };
}

function clinicianDoc(id: string, data: Record<string, unknown>): MockClinicianDoc {
  return { id, data: () => ({ ...data, id }) };
}

// ─── CSV builders ──────────────────────────────────────────────────────────

const CSV_HEADER = "Appointment Date,Appointment Time,Practitioner,Patient ID,Status";

function csvFromRows(rows: string[]): string {
  return [CSV_HEADER, ...rows].join("\n");
}

const CSV_HEADER_WITH_PID =
  "Appointment Date,Appointment Time,Practitioner,Practitioner ID,Patient ID,Status";

function csvWithPidFromRows(rows: string[]): string {
  return [CSV_HEADER_WITH_PID, ...rows].join("\n");
}

const baseInput = (csvText: string): ImportInput => ({
  csvText,
  fileName: "test.csv",
  fileType: "appointments",
  clinicId: "clinic-1",
  importedBy: "test-user",
  schemaId: "writeupp",
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("runCSVImport — clinician matching wire-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("(a) writes all rows with correct clinicianId on exact matches", async () => {
    const { db, apptSet } = createMockDb([
      clinicianDoc("c-andrew", { name: "Andrew Henry", active: true }),
      clinicianDoc("c-max", { name: "Max Hubbard", active: true }),
      clinicianDoc("c-jamal", { name: "Jamal", active: true }),
    ]);

    const csv = csvFromRows([
      "14/03/2026,09:00,Andrew Henry,p-1,Attended",
      "14/03/2026,10:00,Max Hubbard,p-2,Attended",
      "14/03/2026,11:00,Jamal,p-3,Attended",
    ]);

    const result = await runCSVImport(db, baseInput(csv));

    if (!result.ok) throw new Error(`Expected ok=true, got: ${JSON.stringify(result)}`);
    expect(result.written).toBe(3);
    expect(result.unmatchedClinicians).toEqual([]);
    expect(result.ambiguousClinicians).toEqual([]);
    expect(result.fuzzyMatchedClinicians).toEqual([]);
    expect(apptSet).toHaveBeenCalledTimes(3);

    const writtenIds = apptSet.mock.calls.map((c) => (c[0] as { clinicianId: string }).clinicianId);
    expect(writtenIds.sort()).toEqual(["c-andrew", "c-jamal", "c-max"]);

    // Audit trail preserved
    const externalIds = apptSet.mock.calls.map(
      (c) => (c[0] as { clinicianExternalId: string }).clinicianExternalId
    );
    expect(externalIds.sort()).toEqual(["Andrew Henry", "Jamal", "Max Hubbard"]);
  });

  it("(b) writes a row when fuzzy confidence ≥ 0.85 and flags it", async () => {
    // "Andy Henry" → "Andy Henryy" is 1 char off (10/11 chars match) ≈ 0.91 confidence.
    // Need ≥3 rows so validation passes; fill the rest with exact matches.
    const { db, apptSet } = createMockDb([
      clinicianDoc("c-andrew", { name: "Andy Henryy", active: true }),
      clinicianDoc("c-max", { name: "Max Hubbard", active: true }),
    ]);

    const csv = csvFromRows([
      "14/03/2026,09:00,Andy Henry,p-1,Attended",
      "14/03/2026,10:00,Max Hubbard,p-2,Attended",
      "14/03/2026,11:00,Max Hubbard,p-3,Attended",
    ]);

    const result = await runCSVImport(db, baseInput(csv));

    if (!result.ok) throw new Error(`Expected ok=true, got: ${JSON.stringify(result)}`);
    expect(result.written).toBe(3);
    expect(apptSet).toHaveBeenCalledTimes(3);

    const fuzzyWrite = apptSet.mock.calls.find(
      (c) => (c[0] as { clinicianExternalId: string }).clinicianExternalId === "Andy Henry"
    );
    expect(fuzzyWrite).toBeDefined();
    expect((fuzzyWrite![0] as { clinicianId: string }).clinicianId).toBe("c-andrew");

    expect(result.fuzzyMatchedClinicians).toHaveLength(1);
    const fuzzy = result.fuzzyMatchedClinicians[0];
    expect(fuzzy.csvName).toBe("Andy Henry");
    expect(fuzzy.matchedTo.id).toBe("c-andrew");
    expect(fuzzy.confidence).toBeGreaterThanOrEqual(0.85);
    expect(fuzzy.rowCount).toBe(1);
  });

  it("(c) skips rows when fuzzy confidence is below 0.85 and lists in unmatchedClinicians", async () => {
    const { db, apptSet } = createMockDb([
      clinicianDoc("c-andrew", { name: "Andrew Henry", active: true }),
      clinicianDoc("c-max", { name: "Max Hubbard", active: true }),
    ]);

    // Need ≥3 rows for validation to pass; only one is unmatched.
    const csv = csvFromRows([
      "14/03/2026,09:00,Zzz Unknown,p-1,Attended",
      "14/03/2026,10:00,Andrew Henry,p-2,Attended",
      "14/03/2026,11:00,Max Hubbard,p-3,Attended",
    ]);

    const result = await runCSVImport(db, baseInput(csv));

    if (!result.ok) throw new Error(`Expected ok=true, got: ${JSON.stringify(result)}`);
    expect(result.written).toBe(2); // two valid rows
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(apptSet).toHaveBeenCalledTimes(2);

    expect(result.unmatchedClinicians).toEqual([
      { name: "Zzz Unknown", rowCount: 1 },
    ]);
    expect(result.ambiguousClinicians).toEqual([]);
  });

  it("(d) skips ambiguous-match rows and surfaces alternatives", async () => {
    const { db, apptSet } = createMockDb([
      clinicianDoc("c-john-s", { name: "John Smith", active: true }),
      clinicianDoc("c-john-p", { name: "John Pemberton", active: true }),
      clinicianDoc("c-max", { name: "Max Hubbard", active: true }),
    ]);

    const csv = csvFromRows([
      "14/03/2026,09:00,John,p-1,Attended",
      "14/03/2026,10:00,Max Hubbard,p-2,Attended",
      "14/03/2026,11:00,Max Hubbard,p-3,Attended",
    ]);

    const result = await runCSVImport(db, baseInput(csv));

    if (!result.ok) throw new Error(`Expected ok=true, got: ${JSON.stringify(result)}`);
    expect(result.written).toBe(2); // Max twice, John skipped
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(apptSet).toHaveBeenCalledTimes(2);

    expect(result.ambiguousClinicians).toHaveLength(1);
    const amb = result.ambiguousClinicians[0];
    expect(amb.name).toBe("John");
    expect(amb.rowCount).toBe(1);
    const altIds = amb.alternatives.map((a) => a.id).sort();
    expect(altIds).toEqual(["c-john-p", "c-john-s"]);
    expect(result.unmatchedClinicians).toEqual([]);
  });

  it("(e) PMS external ID beats name mismatch, no warnings", async () => {
    const { db, apptSet } = createMockDb([
      clinicianDoc("c-andrew", { name: "Andrew Henry", active: true, pmsExternalId: "andy-1" }),
      clinicianDoc("c-max", { name: "Max Hubbard", active: true, pmsExternalId: "max-1" }),
    ]);

    const csv = csvWithPidFromRows([
      "14/03/2026,09:00,Totally Different Name,andy-1,p-1,Attended",
      "14/03/2026,10:00,Max Hubbard,max-1,p-2,Attended",
      "14/03/2026,11:00,Max Hubbard,max-1,p-3,Attended",
    ]);

    const result = await runCSVImport(db, baseInput(csv));

    if (!result.ok) throw new Error(`Expected ok=true, got: ${JSON.stringify(result)}`);
    expect(result.written).toBe(3);
    expect(result.fuzzyMatchedClinicians).toEqual([]);
    expect(result.unmatchedClinicians).toEqual([]);
    expect(result.ambiguousClinicians).toEqual([]);

    const ids = apptSet.mock.calls.map((c) => (c[0] as { clinicianId: string }).clinicianId);
    expect(ids).toContain("c-andrew");
    // The "Totally Different Name" row resolves via pmsExternalId, not name.
  });

  it("(f) aggregates rowCount across multiple unmatched rows for the same practitioner", async () => {
    const { db } = createMockDb([
      clinicianDoc("c-andrew", { name: "Andrew Henry", active: true }),
      clinicianDoc("c-max", { name: "Max Hubbard", active: true }),
    ]);

    const csv = csvFromRows([
      "14/03/2026,09:00,Zzz Unknown,p-1,Attended",
      "14/03/2026,10:00,Zzz Unknown,p-2,Attended",
      "14/03/2026,11:00,Zzz Unknown,p-3,Attended",
      "14/03/2026,12:00,Zzz Unknown,p-4,Attended",
      "14/03/2026,13:00,Zzz Unknown,p-5,Attended",
    ]);

    const result = await runCSVImport(db, baseInput(csv));

    if (!result.ok) throw new Error(`Expected ok=true, got: ${JSON.stringify(result)}`);
    expect(result.unmatchedClinicians).toHaveLength(1);
    expect(result.unmatchedClinicians[0]).toEqual({ name: "Zzz Unknown", rowCount: 5 });
    expect(result.skipped).toBeGreaterThanOrEqual(5);
  });
});
