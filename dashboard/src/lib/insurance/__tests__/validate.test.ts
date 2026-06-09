import { describe, it, expect } from "vitest";
import { validateInsuranceSubmission } from "../validate";
import type { RawFormSubmission } from "../types";

function valid(overrides: Partial<RawFormSubmission> = {}): RawFormSubmission {
  return {
    insurerName: "Bupa",
    policyNumber: "AB123456",
    consent: true,
    addressLine1: "1 High Street",
    town: "London",
    postcode: "NW6 1AB",
    ...overrides,
  };
}

describe("validateInsuranceSubmission", () => {
  it("accepts a complete, consented submission", () => {
    const result = validateInsuranceSubmission(valid());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects when consent is not given", () => {
    const result = validateInsuranceSubmission(valid({ consent: false }));
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Consent is required before submitting insurance details.");
  });

  it("rejects a missing insurer name", () => {
    const result = validateInsuranceSubmission(valid({ insurerName: "  " }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /insurer/i.test(e))).toBe(true);
  });

  it("rejects a missing policy number", () => {
    const result = validateInsuranceSubmission(valid({ policyNumber: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /policy/i.test(e))).toBe(true);
  });

  it("rejects a policy number shorter than 3 characters", () => {
    const result = validateInsuranceSubmission(valid({ policyNumber: "A1" }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /policy/i.test(e))).toBe(true);
  });

  it("rejects a policy number with illegal characters", () => {
    const result = validateInsuranceSubmission(valid({ policyNumber: "AB/12$34" }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /policy/i.test(e))).toBe(true);
  });

  it("accepts a policy number with spaces and dashes", () => {
    const result = validateInsuranceSubmission(valid({ policyNumber: "AB 12-3456" }));
    expect(result.ok).toBe(true);
  });

  it("rejects an insurer not in the tenant's allowed options", () => {
    const result = validateInsuranceSubmission(valid({ insurerName: "Acme Health" }), {
      insurerOptions: ["Bupa", "AXA", "Vitality"],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /not.*recognised|not.*allowed|select/i.test(e))).toBe(true);
  });

  it("accepts an insurer that is in the tenant's allowed options", () => {
    const result = validateInsuranceSubmission(valid({ insurerName: "AXA" }), {
      insurerOptions: ["Bupa", "AXA", "Vitality"],
    });
    expect(result.ok).toBe(true);
  });


  it("rejects a negative or non-numeric excess", () => {
    expect(validateInsuranceSubmission(valid({ excess: "-10" })).ok).toBe(false);
    expect(validateInsuranceSubmission(valid({ excess: "abc" })).ok).toBe(false);
  });

  it("accepts a well-formed excess written with a currency symbol", () => {
    expect(validateInsuranceSubmission(valid({ excess: "£50" })).ok).toBe(true);
  });

  it("requires address line 1", () => {
    const result = validateInsuranceSubmission(valid({ addressLine1: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /address line 1/i.test(e))).toBe(true);
  });

  it("requires a town", () => {
    const result = validateInsuranceSubmission(valid({ town: "  " }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /town|city/i.test(e))).toBe(true);
  });

  it("requires a postcode", () => {
    const result = validateInsuranceSubmission(valid({ postcode: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /postcode/i.test(e))).toBe(true);
  });

  it("rejects an invalid UK postcode", () => {
    const result = validateInsuranceSubmission(valid({ postcode: "ZZZZZZ" }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /postcode/i.test(e))).toBe(true);
  });

  it("accepts a valid UK postcode with or without internal space", () => {
    expect(validateInsuranceSubmission(valid({ postcode: "NW61AB" })).ok).toBe(true);
    expect(validateInsuranceSubmission(valid({ postcode: "SW1A 1AA" })).ok).toBe(true);
  });
});
