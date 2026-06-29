import { describe, it, expect } from "vitest";
import { buildIncompleteItems } from "../incomplete-digest";
import type { InsuranceRecord } from "../types";

function rec(o: Partial<InsuranceRecord>): InsuranceRecord {
  return {
    tenantId: "c1", patientRef: "p1", source: "form", insurerName: "Bupa",
    policyNumber: "AB123456", confidence: 1, capturedAt: "2026-07-01T09:00:00Z",
    capturedBy: "patient", reviewStatus: "approved", audit: [], ...o,
  };
}

describe("buildIncompleteItems", () => {
  it("flags a record with a missing pre-auth (incomplete) and redacts the policy", () => {
    const items = buildIncompleteItems([rec({ incomplete: true, incompleteReason: "missing pre-authorisation" })]);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe("missing pre-authorisation");
    expect(items[0].policyTail).not.toContain("AB123456");
    expect(items[0].insurerName).toBe("Bupa");
  });

  it("flags a held insurer mismatch with the claimed insurer", () => {
    const items = buildIncompleteItems([rec({ reviewStatus: "pending", insurerMismatch: true, claimedInsurer: "AXA" })]);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toMatch(/mismatch/i);
    expect(items[0].reason).toMatch(/AXA/);
  });

  it("flags a plain pending record as awaiting review", () => {
    const items = buildIncompleteItems([rec({ reviewStatus: "pending" })]);
    expect(items[0].reason).toMatch(/awaiting/i);
  });

  it("ignores a clean approved record", () => {
    expect(buildIncompleteItems([rec({ reviewStatus: "approved" })])).toHaveLength(0);
  });
});
