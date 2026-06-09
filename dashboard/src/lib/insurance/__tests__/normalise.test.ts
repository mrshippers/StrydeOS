import { describe, it, expect } from "vitest";
import { normaliseFormSubmission, normaliseVoiceExtraction, excessToPence } from "../normalise";
import type { CaptureContext, RawFormSubmission, RawVoiceExtraction } from "../types";

const ctx: CaptureContext = {
  tenantId: "clinic-1",
  patientRef: "p-42",
  capturedAt: "2026-06-08T09:30:00.000Z",
  consentVersion: "v1",
};

describe("excessToPence", () => {
  it("parses a bare pounds string", () => {
    expect(excessToPence("50")).toBe(5000);
  });
  it("parses a decimal pounds string", () => {
    expect(excessToPence("50.25")).toBe(5025);
  });
  it("strips a currency symbol and whitespace", () => {
    expect(excessToPence(" £50.00 ")).toBe(5000);
  });
  it("treats a number as pounds", () => {
    expect(excessToPence(75)).toBe(7500);
  });
  it("returns undefined for empty or unparseable input", () => {
    expect(excessToPence("")).toBeUndefined();
    expect(excessToPence("abc")).toBeUndefined();
    expect(excessToPence(undefined)).toBeUndefined();
  });
});

describe("normaliseFormSubmission", () => {
  const input: RawFormSubmission = {
    insurerName: "  Bupa  ",
    scheme: " Comprehensive ",
    policyNumber: "  AB 12-3456 ",
    authorisationCode: " AUTH9 ",
    claimReference: " CLM-1 ",
    excess: "£50",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    consent: true,
  };

  it("produces a form-sourced, pending record with confidence 1", () => {
    const rec = normaliseFormSubmission(input, ctx);
    expect(rec.source).toBe("form");
    expect(rec.reviewStatus).toBe("pending");
    expect(rec.confidence).toBe(1);
  });

  it("trims string fields", () => {
    const rec = normaliseFormSubmission(input, ctx);
    expect(rec.insurerName).toBe("Bupa");
    expect(rec.scheme).toBe("Comprehensive");
    expect(rec.policyNumber).toBe("AB 12-3456");
    expect(rec.authorisationCode).toBe("AUTH9");
  });

  it("carries tenant + patient context and the capture timestamp", () => {
    const rec = normaliseFormSubmission(input, ctx);
    expect(rec.tenantId).toBe("clinic-1");
    expect(rec.patientRef).toBe("p-42");
    expect(rec.capturedAt).toBe("2026-06-08T09:30:00.000Z");
    expect(rec.capturedBy).toBe("patient");
  });

  it("records consent at the capture time with the supplied version", () => {
    const rec = normaliseFormSubmission(input, ctx);
    expect(rec.consentAt).toBe("2026-06-08T09:30:00.000Z");
    expect(rec.consentVersion).toBe("v1");
  });

  it("converts excess to pence", () => {
    const rec = normaliseFormSubmission(input, ctx);
    expect(rec.excessPence).toBe(5000);
  });

  it("seeds the audit trail with a captured entry", () => {
    const rec = normaliseFormSubmission(input, ctx);
    expect(rec.audit).toHaveLength(1);
    expect(rec.audit[0].action).toBe("captured");
    expect(rec.audit[0].at).toBe("2026-06-08T09:30:00.000Z");
    expect(rec.audit[0].actor).toBe("patient");
  });

  it("carries address fields and upper-cases the postcode", () => {
    const rec = normaliseFormSubmission(
      { ...input, addressLine1: " 1 High Street ", town: " London ", postcode: " nw6 1ab " },
      ctx,
    );
    expect(rec.addressLine1).toBe("1 High Street");
    expect(rec.town).toBe("London");
    expect(rec.postcode).toBe("NW6 1AB");
  });

  it("omits optional fields that were not provided", () => {
    const rec = normaliseFormSubmission(
      { insurerName: "AXA", policyNumber: "XY999000", consent: true },
      ctx,
    );
    expect(rec.scheme).toBeUndefined();
    expect(rec.excessPence).toBeUndefined();
    expect(rec.claimReference).toBeUndefined();
  });
});

describe("normaliseVoiceExtraction", () => {
  const input: RawVoiceExtraction = {
    insurerName: "Vitality",
    policyNumber: "VIT123456",
    readBackConfirmed: true,
    sttConfidence: 0.9,
  };

  it("produces a voice-sourced, pending record captured by ava", () => {
    const rec = normaliseVoiceExtraction(input, ctx);
    expect(rec.source).toBe("voice");
    expect(rec.reviewStatus).toBe("pending");
    expect(rec.capturedBy).toBe("ava");
  });

  it("scores confidence below 1 for a voice capture", () => {
    const rec = normaliseVoiceExtraction(input, ctx);
    expect(rec.confidence).toBeGreaterThan(0);
    expect(rec.confidence).toBeLessThan(1);
  });

  it("defaults missing alphanumeric fields to empty strings, not undefined", () => {
    const rec = normaliseVoiceExtraction({ insurerName: "Vitality" }, ctx);
    expect(rec.policyNumber).toBe("");
  });
});
