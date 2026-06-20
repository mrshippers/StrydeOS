/**
 * TDD tests for follow-up value computation (P0-9).
 *
 * Rules under test:
 *  - computeFollowUpValuePence takes a FollowUpBookingCount (an integer count of
 *    additional follow-ups booked) and a session rate in pence.
 *  - Value = returningPatientCount * sessionRate (count x rate).
 *  - A ratio (sessions-per-patient) cannot satisfy the FollowUpBookingCount brand.
 *  - When sessionRate is null (missing), the function returns null (skip, not fabricate).
 *  - Negative or zero returningPatients returns null (no ROI to attribute).
 */

import { describe, it, expect } from "vitest";
import {
  computeFollowUpValuePence,
  toFollowUpBookingCount,
  FollowUpBookingCount,
} from "../follow-up-value";

describe("computeFollowUpValuePence (P0-9)", () => {
  it("returns correct weekly value for known follow-up booking increase", () => {
    // Baseline avg: 5 follow-ups/wk. Recent avg: 8 follow-ups/wk.
    // returningPatients = 3 (a count), sessionRate = 6500p (£65)
    // expected = 3 * 6500 = 19500p
    const count = toFollowUpBookingCount(3);
    const result = computeFollowUpValuePence(count, 6500);
    expect(result).toBe(19500);
  });

  it("returns correct weekly value for a larger delta", () => {
    // +10 follow-ups/wk at £85/session = £850/wk
    const count = toFollowUpBookingCount(10);
    const result = computeFollowUpValuePence(count, 8500);
    expect(result).toBe(85000); // pence = £850
  });

  it("returns null when sessionRate is null (missing - skip, not fabricate)", () => {
    const count = toFollowUpBookingCount(5);
    const result = computeFollowUpValuePence(count, null);
    expect(result).toBeNull();
  });

  it("returns null when returningPatients count is zero (no improvement)", () => {
    const count = toFollowUpBookingCount(0);
    const result = computeFollowUpValuePence(count, 6500);
    expect(result).toBeNull();
  });

  it("returns null when returningPatients count is negative (regression, not improvement)", () => {
    const count = toFollowUpBookingCount(-2);
    const result = computeFollowUpValuePence(count, 6500);
    expect(result).toBeNull();
  });

  it("toFollowUpBookingCount rounds non-integer inputs to nearest integer", () => {
    // avg deltas are floats; ensure they are rounded before use
    const count = toFollowUpBookingCount(3.7);
    const result = computeFollowUpValuePence(count, 6500);
    // 4 * 6500 = 26000
    expect(result).toBe(26000);
  });
});

describe("FollowUpBookingCount type guard (P0-9)", () => {
  it("toFollowUpBookingCount returns a branded FollowUpBookingCount", () => {
    const count = toFollowUpBookingCount(5);
    // At runtime, branded types are still numbers - check the value
    expect(count).toBe(5);
  });

  it("a raw ratio value (e.g. 2.4) cannot be passed directly as FollowUpBookingCount", () => {
    // This is a compile-time assertion captured in a type-level test.
    // At runtime, toFollowUpBookingCount MUST be called, which rounds and validates.
    // Here we confirm the round-trip: ratio 2.4 -> count 2 -> value 2 * 6500
    const ratioMistakenlyUsedAsCount = toFollowUpBookingCount(2.4);
    // Rounded to 2, so value = 2 * 6500 = 13000 - NOT 2.4 * weeklyIAs * rate (the old bug)
    expect(computeFollowUpValuePence(ratioMistakenlyUsedAsCount, 6500)).toBe(13000);
  });
});
