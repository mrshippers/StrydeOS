/**
 * Unit tests for cohort-summary.ts
 *
 * Covers:
 *   - Single cohort with known riskScores produces correct avg
 *   - Mixed lifecycle states produce one summary per state
 *   - undefined riskScore is treated as 0, not NaN
 *   - Empty patient array returns empty array
 *   - Sort order: higher count cohort appears first
 *   - All patients in the same state produces one summary
 */

import { describe, it, expect } from "vitest";
import { buildCohortSummary } from "@/lib/pulse/cohort-summary";
import type { Patient } from "@/types/patient";

// ─── Fixture builder ──────────────────────────────────────────────────────────

let _idSeq = 0;

function makePatient(overrides: Partial<Patient> = {}): Patient {
  const id = `p-${++_idSeq}`;
  return {
    id,
    name: `Patient ${id}`,
    contact: {},
    clinicianId: "clin-1",
    insuranceFlag: false,
    preAuthStatus: "not_required",
    sessionCount: 1,
    treatmentLength: 6,
    discharged: false,
    churnRisk: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    lifecycleState: "ACTIVE",
    ...overrides,
  } as Patient;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildCohortSummary", () => {
  it("returns one summary for 3 AT_RISK patients with riskScores [60, 70, 80]", () => {
    const patients = [
      makePatient({ lifecycleState: "AT_RISK", riskScore: 60 }),
      makePatient({ lifecycleState: "AT_RISK", riskScore: 70 }),
      makePatient({ lifecycleState: "AT_RISK", riskScore: 80 }),
    ];

    const result = buildCohortSummary(patients);

    expect(result).toHaveLength(1);
    expect(result[0].cohort).toBe("AT_RISK");
    expect(result[0].count).toBe(3);
    expect(result[0].avgRiskScore).toBeCloseTo(70);
  });

  it("returns multiple summaries for patients with mixed lifecycle states", () => {
    const patients = [
      makePatient({ lifecycleState: "ACTIVE", riskScore: 20 }),
      makePatient({ lifecycleState: "ACTIVE", riskScore: 40 }),
      makePatient({ lifecycleState: "AT_RISK", riskScore: 75 }),
      makePatient({ lifecycleState: "LAPSED", riskScore: 50 }),
    ];

    const result = buildCohortSummary(patients);

    expect(result).toHaveLength(3);
    const states = result.map((s) => s.cohort);
    expect(states).toContain("ACTIVE");
    expect(states).toContain("AT_RISK");
    expect(states).toContain("LAPSED");
  });

  it("treats undefined riskScore as 0 — no NaN in avgRiskScore", () => {
    const patients = [
      makePatient({ lifecycleState: "ONBOARDING", riskScore: undefined }),
      makePatient({ lifecycleState: "ONBOARDING", riskScore: 60 }),
    ];

    const result = buildCohortSummary(patients);

    expect(result).toHaveLength(1);
    expect(result[0].avgRiskScore).toBeCloseTo(30); // (0 + 60) / 2
    expect(Number.isNaN(result[0].avgRiskScore)).toBe(false);
  });

  it("returns empty array for an empty patient list", () => {
    const result = buildCohortSummary([]);
    expect(result).toEqual([]);
  });

  it("sorts so the cohort with higher count appears first", () => {
    const patients = [
      makePatient({ lifecycleState: "LAPSED", riskScore: 55 }),
      makePatient({ lifecycleState: "ACTIVE", riskScore: 10 }),
      makePatient({ lifecycleState: "ACTIVE", riskScore: 20 }),
      makePatient({ lifecycleState: "ACTIVE", riskScore: 30 }),
    ];

    const result = buildCohortSummary(patients);

    expect(result[0].cohort).toBe("ACTIVE");
    expect(result[0].count).toBe(3);
    expect(result[1].cohort).toBe("LAPSED");
    expect(result[1].count).toBe(1);
  });

  it("returns a single summary when all patients share the same state", () => {
    const patients = [
      makePatient({ lifecycleState: "ACTIVE", riskScore: 15 }),
      makePatient({ lifecycleState: "ACTIVE", riskScore: 25 }),
      makePatient({ lifecycleState: "ACTIVE", riskScore: 35 }),
      makePatient({ lifecycleState: "ACTIVE", riskScore: 45 }),
    ];

    const result = buildCohortSummary(patients);

    expect(result).toHaveLength(1);
    expect(result[0].cohort).toBe("ACTIVE");
    expect(result[0].count).toBe(4);
    expect(result[0].avgRiskScore).toBeCloseTo(30); // (15+25+35+45)/4
  });
});
