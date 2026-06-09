import { describe, it, expect } from "vitest";
import { toInsuranceCsv, INSURANCE_CSV_HEADER } from "../csv";
import type { InsuranceRecord } from "../types";

function rec(overrides: Partial<InsuranceRecord> = {}): InsuranceRecord {
  return {
    tenantId: "clinic-1",
    patientRef: "p-1",
    source: "form",
    insurerName: "Bupa",
    scheme: "Comprehensive",
    policyNumber: "AB123456",
    authorisationCode: "AUTH9",
    claimReference: "CLM-1",
    excessPence: 5000,
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    confidence: 1,
    capturedAt: "2026-06-08T09:30:00.000Z",
    capturedBy: "patient",
    reviewStatus: "approved",
    audit: [],
    ...overrides,
  };
}

describe("toInsuranceCsv", () => {
  it("starts with the canonical header row", () => {
    const csv = toInsuranceCsv([rec()]);
    expect(csv.split("\n")[0]).toBe(INSURANCE_CSV_HEADER);
  });

  it("emits one data row per record", () => {
    const csv = toInsuranceCsv([rec(), rec({ patientRef: "p-2" })]);
    expect(csv.trim().split("\n")).toHaveLength(3); // header + 2
  });

  it("renders the core fields in the data row", () => {
    const csv = toInsuranceCsv([rec()]);
    const row = csv.trim().split("\n")[1];
    expect(row).toContain("clinic-1");
    expect(row).toContain("Bupa");
    expect(row).toContain("AB123456");
  });

  it("quotes fields that contain commas", () => {
    const csv = toInsuranceCsv([rec({ insurerName: "Smith, Jones & Co" })]);
    expect(csv).toContain('"Smith, Jones & Co"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    const csv = toInsuranceCsv([rec({ scheme: 'The "Gold" Plan' })]);
    expect(csv).toContain('"The ""Gold"" Plan"');
  });

  it("renders an empty string for missing optional fields", () => {
    const csv = toInsuranceCsv([
      rec({ scheme: undefined, authorisationCode: undefined, excessPence: undefined }),
    ]);
    // header has a fixed column count; every row must match it
    const cols = INSURANCE_CSV_HEADER.split(",").length;
    const row = csv.trim().split("\n")[1];
    // naive column count is safe here because the test record has no quoted commas
    expect(row.split(",").length).toBe(cols);
  });

  it("returns only the header for an empty list", () => {
    const csv = toInsuranceCsv([]);
    expect(csv.trim()).toBe(INSURANCE_CSV_HEADER);
  });
});
