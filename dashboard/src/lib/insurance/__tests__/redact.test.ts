import { describe, it, expect } from "vitest";
import { redactPolicyNumber, redactRecordForLog } from "../redact";
import type { InsuranceRecord } from "../types";

describe("redactPolicyNumber", () => {
  it("keeps only the last 4 characters visible", () => {
    expect(redactPolicyNumber("ABTUVO12345")).toBe("•••••••2345");
  });

  it("masks everything when the value is 4 characters or fewer", () => {
    expect(redactPolicyNumber("1234")).toBe("••••");
    expect(redactPolicyNumber("12")).toBe("••");
  });

  it("returns an empty string for empty input", () => {
    expect(redactPolicyNumber("")).toBe("");
  });

  it("ignores surrounding whitespace when measuring length", () => {
    expect(redactPolicyNumber("  AB12 3456  ")).toBe("•••••3456");
  });
});

describe("redactRecordForLog", () => {
  const base: InsuranceRecord = {
    tenantId: "clinic-1",
    patientRef: "p-1",
    source: "form",
    insurerName: "Bupa",
    policyNumber: "POL99887766",
    authorisationCode: "AUTH-55512",
    claimReference: "CLAIM-1",
    confidence: 1,
    capturedAt: "2026-06-08T10:00:00.000Z",
    capturedBy: "patient",
    reviewStatus: "pending",
    audit: [],
  };

  it("redacts the policy number to last 4", () => {
    const out = redactRecordForLog(base);
    expect(out.policyNumber).toBe("•••••••7766");
  });

  it("redacts the authorisation code to last 4", () => {
    const out = redactRecordForLog(base);
    expect(out.authorisationCode).toBe("••••••5512");
  });

  it("does not mutate the original record", () => {
    redactRecordForLog(base);
    expect(base.policyNumber).toBe("POL99887766");
  });

  it("leaves non-sensitive fields intact", () => {
    const out = redactRecordForLog(base);
    expect(out.insurerName).toBe("Bupa");
    expect(out.patientRef).toBe("p-1");
  });
});
