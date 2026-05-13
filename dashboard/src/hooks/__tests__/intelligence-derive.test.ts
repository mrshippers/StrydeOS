/**
 * Shape-compliance tests for getDemoClinicianKpis.
 *
 * These tests verify that every fixture row in getDemoClinicianKpis satisfies
 * the extended ClinicianKpiRow interface — specifically the four new fields
 * added in Gate 4: hepComplianceRate, hepTrend, revenuePerSessionPence,
 * revPerSessionTrend.
 *
 * If the interface is extended without updating fixture rows, TypeScript will
 * catch it at compile time. These runtime tests catch misconfigured values
 * (out-of-range rates, empty trend arrays, zero-pence revenue).
 */

import { describe, it, expect } from "vitest";
import { getDemoClinicianKpis } from "@/hooks/useDemoIntelligence";

describe("getDemoClinicianKpis — Gate 4 field shape compliance", () => {
  it("returns rows with hepComplianceRate between 0 and 1", () => {
    const rows = getDemoClinicianKpis();

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.hepComplianceRate).toBeGreaterThanOrEqual(0);
      expect(row.hepComplianceRate).toBeLessThanOrEqual(1);
    }
  });

  it("returns rows with hepTrend of length 8", () => {
    const rows = getDemoClinicianKpis();

    for (const row of rows) {
      expect(row.hepTrend).toHaveLength(8);
      // All trend values should be valid rates between 0 and 1
      for (const v of row.hepTrend) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("returns rows with revenuePerSessionPence greater than 0", () => {
    const rows = getDemoClinicianKpis();

    for (const row of rows) {
      expect(row.revenuePerSessionPence).toBeGreaterThan(0);
    }
  });

  it("returns rows with revPerSessionTrend of length 8 with positive values", () => {
    const rows = getDemoClinicianKpis();

    for (const row of rows) {
      expect(row.revPerSessionTrend).toHaveLength(8);
      for (const v of row.revPerSessionTrend) {
        expect(v).toBeGreaterThan(0);
      }
    }
  });
});
