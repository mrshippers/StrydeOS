/**
 * Insurance revenue split tests.
 *
 * When a patient is insured, the appointment revenue comes from two sources:
 * 1. Insurer pays the session fee minus the patient excess
 * 2. Patient pays the excess amount
 *
 * This tests the pure computation that splits revenue correctly.
 */

import { describe, it, expect } from "vitest";
import { computeRevenueSplit, type RevenueSplitInput } from "../revenue-split";

describe("Revenue Split — Basic Cases", () => {
  it("self-pay patient: all revenue is self-pay", () => {
    const result = computeRevenueSplit({
      revenueAmountPence: 7500,
      insuranceFlag: false,
    });
    expect(result.insurerPence).toBe(0);
    expect(result.selfPayPence).toBe(7500);
    expect(result.excessPence).toBe(0);
  });

  it("insured patient with no excess: all revenue is insurer", () => {
    const result = computeRevenueSplit({
      revenueAmountPence: 7500,
      insuranceFlag: true,
    });
    expect(result.insurerPence).toBe(7500);
    expect(result.selfPayPence).toBe(0);
    expect(result.excessPence).toBe(0);
  });

  it("insured patient with excess: splits correctly", () => {
    const result = computeRevenueSplit({
      revenueAmountPence: 7500,
      insuranceFlag: true,
      excessAmountPence: 2000,
    });
    expect(result.insurerPence).toBe(5500);  // 7500 - 2000
    expect(result.excessPence).toBe(2000);
    expect(result.selfPayPence).toBe(0);
  });

  it("excess larger than session fee: insurer pays 0, excess capped at session fee", () => {
    const result = computeRevenueSplit({
      revenueAmountPence: 5000,
      insuranceFlag: true,
      excessAmountPence: 8000,
    });
    expect(result.insurerPence).toBe(0);
    expect(result.excessPence).toBe(5000);
    expect(result.selfPayPence).toBe(0);
  });
});

describe("Revenue Split — Aggregation", () => {
  it("aggregates multiple appointments correctly", () => {
    const appointments: RevenueSplitInput[] = [
      { revenueAmountPence: 7500, insuranceFlag: true, excessAmountPence: 1500 },
      { revenueAmountPence: 7500, insuranceFlag: true },
      { revenueAmountPence: 6000, insuranceFlag: false },
      { revenueAmountPence: 7500, insuranceFlag: true, excessAmountPence: 2000 },
    ];

    let totalInsurer = 0;
    let totalExcess = 0;
    let totalSelfPay = 0;

    for (const appt of appointments) {
      const split = computeRevenueSplit(appt);
      totalInsurer += split.insurerPence;
      totalExcess += split.excessPence;
      totalSelfPay += split.selfPayPence;
    }

    // Appt 1: insurer 6000, excess 1500
    // Appt 2: insurer 7500, excess 0
    // Appt 3: self-pay 6000
    // Appt 4: insurer 5500, excess 2000
    expect(totalInsurer).toBe(19000);
    expect(totalExcess).toBe(3500);
    expect(totalSelfPay).toBe(6000);
  });
});

describe("Revenue Split — Edge Cases", () => {
  it("handles zero revenue", () => {
    const result = computeRevenueSplit({
      revenueAmountPence: 0,
      insuranceFlag: true,
      excessAmountPence: 2000,
    });
    expect(result.insurerPence).toBe(0);
    expect(result.excessPence).toBe(0);
    expect(result.selfPayPence).toBe(0);
  });

  it("handles negative excess (shouldn't happen, treated as 0)", () => {
    const result = computeRevenueSplit({
      revenueAmountPence: 7500,
      insuranceFlag: true,
      excessAmountPence: -500,
    });
    expect(result.insurerPence).toBe(7500);
    expect(result.excessPence).toBe(0);
    expect(result.selfPayPence).toBe(0);
  });
});
