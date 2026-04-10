/**
 * Unit tests for pure derivation helpers exported from useIntelligenceData.
 *
 * Scope: deriveRevenueByCondition — Fix 4.
 * Aggregates completed-appointment revenue grouped by `conditionTag`,
 * returns a sorted-descending RevenueByCondition[] for the Intelligence chart.
 */

import { describe, it, expect } from "vitest";
import type { Appointment } from "@/types";
import { deriveRevenueByCondition } from "@/lib/intelligence/derive-revenue-by-condition";

/** Build a minimal Appointment fixture with sensible defaults. */
function makeAppt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: overrides.id ?? "a1",
    patientId: "p1",
    clinicianId: "c1",
    dateTime: "2026-04-01T09:00:00Z",
    endTime: "2026-04-01T09:30:00Z",
    status: "completed",
    appointmentType: "follow_up",
    isInitialAssessment: false,
    hepAssigned: false,
    revenueAmountPence: 8000,
    followUpBooked: false,
    source: "pms_sync",
    createdAt: "2026-04-01T09:00:00Z",
    updatedAt: "2026-04-01T09:00:00Z",
    ...overrides,
  };
}

describe("deriveRevenueByCondition", () => {
  it("returns an empty array when there are no appointments", () => {
    expect(deriveRevenueByCondition([])).toEqual([]);
  });

  it("aggregates a single appointment with a condition tag", () => {
    const result = deriveRevenueByCondition([
      makeAppt({ id: "a1", conditionTag: "Low Back Pain", revenueAmountPence: 7500 }),
    ]);

    expect(result).toEqual([
      {
        condition: "Low Back Pain",
        totalRevenuePence: 7500,
        sessions: 1,
        avgSessionsPence: 7500,
      },
    ]);
  });

  it("groups multiple appointments by conditionTag and sums revenue", () => {
    const result = deriveRevenueByCondition([
      makeAppt({ id: "a1", conditionTag: "Low Back Pain", revenueAmountPence: 8000 }),
      makeAppt({ id: "a2", conditionTag: "Low Back Pain", revenueAmountPence: 8000 }),
      makeAppt({ id: "a3", conditionTag: "Low Back Pain", revenueAmountPence: 7000 }),
      makeAppt({ id: "a4", conditionTag: "Shoulder Impingement", revenueAmountPence: 9000 }),
    ]);

    const lbp = result.find((r) => r.condition === "Low Back Pain");
    const shoulder = result.find((r) => r.condition === "Shoulder Impingement");

    expect(lbp).toEqual({
      condition: "Low Back Pain",
      totalRevenuePence: 23000,
      sessions: 3,
      avgSessionsPence: Math.round(23000 / 3),
    });
    expect(shoulder).toEqual({
      condition: "Shoulder Impingement",
      totalRevenuePence: 9000,
      sessions: 1,
      avgSessionsPence: 9000,
    });
  });

  it("sorts results by totalRevenuePence descending", () => {
    const result = deriveRevenueByCondition([
      makeAppt({ id: "a1", conditionTag: "Achilles Tendinopathy", revenueAmountPence: 5000 }),
      makeAppt({ id: "a2", conditionTag: "Low Back Pain", revenueAmountPence: 8000 }),
      makeAppt({ id: "a3", conditionTag: "Low Back Pain", revenueAmountPence: 8000 }),
      makeAppt({ id: "a4", conditionTag: "Low Back Pain", revenueAmountPence: 8000 }),
      makeAppt({ id: "a5", conditionTag: "Neck Pain", revenueAmountPence: 7000 }),
      makeAppt({ id: "a6", conditionTag: "Neck Pain", revenueAmountPence: 7000 }),
    ]);

    expect(result.map((r) => r.condition)).toEqual([
      "Low Back Pain",      // 24000
      "Neck Pain",          // 14000
      "Achilles Tendinopathy", // 5000
    ]);
    expect(result[0].totalRevenuePence).toBeGreaterThan(result[1].totalRevenuePence);
    expect(result[1].totalRevenuePence).toBeGreaterThan(result[2].totalRevenuePence);
  });

  it("ignores appointments without a conditionTag", () => {
    const result = deriveRevenueByCondition([
      makeAppt({ id: "a1", conditionTag: "Low Back Pain", revenueAmountPence: 8000 }),
      makeAppt({ id: "a2", conditionTag: undefined, revenueAmountPence: 8000 }),
      makeAppt({ id: "a3", conditionTag: "   ", revenueAmountPence: 8000 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].condition).toBe("Low Back Pain");
    expect(result[0].sessions).toBe(1);
  });

  it("excludes non-completed appointments (DNA, cancelled, scheduled)", () => {
    const result = deriveRevenueByCondition([
      makeAppt({ id: "a1", conditionTag: "Low Back Pain", status: "completed", revenueAmountPence: 8000 }),
      makeAppt({ id: "a2", conditionTag: "Low Back Pain", status: "dna", revenueAmountPence: 8000 }),
      makeAppt({ id: "a3", conditionTag: "Low Back Pain", status: "cancelled", revenueAmountPence: 8000 }),
      makeAppt({ id: "a4", conditionTag: "Low Back Pain", status: "scheduled", revenueAmountPence: 8000 }),
      makeAppt({ id: "a5", conditionTag: "Low Back Pain", status: "late_cancel", revenueAmountPence: 8000 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].sessions).toBe(1);
    expect(result[0].totalRevenuePence).toBe(8000);
  });

  it("ignores appointments with zero or negative revenue", () => {
    const result = deriveRevenueByCondition([
      makeAppt({ id: "a1", conditionTag: "Low Back Pain", revenueAmountPence: 8000 }),
      makeAppt({ id: "a2", conditionTag: "Low Back Pain", revenueAmountPence: 0 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].sessions).toBe(1);
    expect(result[0].totalRevenuePence).toBe(8000);
  });
});
