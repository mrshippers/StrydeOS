import { describe, it, expect } from "vitest";
import { formConfidence, voiceConfidence, shouldAutoWrite } from "../confidence";
import type { InsuranceRecord } from "../types";

describe("formConfidence", () => {
  it("is always 1 — a typed form is the source of truth", () => {
    expect(formConfidence()).toBe(1);
  });
});

describe("voiceConfidence", () => {
  it("returns a value in [0,1]", () => {
    const c = voiceConfidence({ readBackConfirmed: true, sttConfidence: 0.9, hasInsurer: true, hasPolicyNumber: true });
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });

  it("scores a confirmed read-back higher than an unconfirmed one", () => {
    const confirmed = voiceConfidence({ readBackConfirmed: true, sttConfidence: 0.8, hasInsurer: true, hasPolicyNumber: true });
    const unconfirmed = voiceConfidence({ readBackConfirmed: false, sttConfidence: 0.8, hasInsurer: true, hasPolicyNumber: true });
    expect(confirmed).toBeGreaterThan(unconfirmed);
  });

  it("penalises a missing policy number", () => {
    const withPolicy = voiceConfidence({ readBackConfirmed: true, sttConfidence: 0.8, hasInsurer: true, hasPolicyNumber: true });
    const withoutPolicy = voiceConfidence({ readBackConfirmed: true, sttConfidence: 0.8, hasInsurer: true, hasPolicyNumber: false });
    expect(withoutPolicy).toBeLessThan(withPolicy);
  });

  it("never returns above 0.95 for an unconfirmed read-back", () => {
    const c = voiceConfidence({ readBackConfirmed: false, sttConfidence: 1, hasInsurer: true, hasPolicyNumber: true });
    expect(c).toBeLessThanOrEqual(0.95);
  });
});

describe("shouldAutoWrite", () => {
  function rec(overrides: Partial<InsuranceRecord>): InsuranceRecord {
    return {
      tenantId: "c1",
      patientRef: "p1",
      source: "voice",
      insurerName: "Bupa",
      policyNumber: "AB123456",
      confidence: 0.9,
      capturedAt: "2026-06-08T00:00:00.000Z",
      capturedBy: "ava",
      reviewStatus: "pending",
      audit: [],
      ...overrides,
    };
  }

  it("never auto-writes when the tenant has not enabled it", () => {
    expect(shouldAutoWrite(rec({ source: "form" }), { autoWriteEnabled: false, minConfidence: 0.85 })).toBe(false);
  });

  it("auto-writes a form capture when enabled", () => {
    expect(shouldAutoWrite(rec({ source: "form", confidence: 1 }), { autoWriteEnabled: true, minConfidence: 0.85 })).toBe(true);
  });

  it("does not auto-write a voice capture below the confidence threshold", () => {
    expect(
      shouldAutoWrite(rec({ source: "voice", confidence: 0.6, readBackConfirmed: true }), { autoWriteEnabled: true, minConfidence: 0.85 }),
    ).toBe(false);
  });

  it("does not auto-write a voice capture that was not read-back confirmed, even at high confidence", () => {
    expect(
      shouldAutoWrite(rec({ source: "voice", confidence: 0.99, readBackConfirmed: false }), { autoWriteEnabled: true, minConfidence: 0.85 }),
    ).toBe(false);
  });

  it("auto-writes a voice capture only when confirmed AND above threshold AND enabled", () => {
    expect(
      shouldAutoWrite(rec({ source: "voice", confidence: 0.92, readBackConfirmed: true }), { autoWriteEnabled: true, minConfidence: 0.85 }),
    ).toBe(true);
  });
});
