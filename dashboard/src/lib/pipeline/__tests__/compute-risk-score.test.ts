import { describe, it, expect } from "vitest";
import { computeRiskScore, type RiskScoreInput } from "../compute-risk-score";

function baseInput(overrides: Partial<RiskScoreInput> = {}): RiskScoreInput {
  return {
    sessionCount: 4,
    courseLength: 6,
    lastSessionDate: "2026-04-01T10:00:00Z",
    nextSessionDate: "2026-04-15T10:00:00Z",
    discharged: false,
    churnRisk: false,
    insuranceFlag: false,
    now: new Date("2026-04-09T12:00:00Z"),
    ...overrides,
  };
}

describe("computeRiskScore", () => {
  // ── Lifecycle state precedence ──────────────────────────────────────────

  it("returns ACTIVE for a healthy mid-treatment patient", () => {
    const result = computeRiskScore(baseInput());
    expect(result.lifecycleState).toBe("ACTIVE");
    expect(result.riskScore).toBeLessThan(60);
  });

  it("returns NEW for sessionCount=0", () => {
    const result = computeRiskScore(baseInput({ sessionCount: 0 }));
    expect(result.lifecycleState).toBe("NEW");
  });

  it("returns ONBOARDING for sessionCount 1–3", () => {
    for (const count of [1, 2, 3]) {
      const result = computeRiskScore(baseInput({
        sessionCount: count,
        nextSessionDate: "2026-04-15T10:00:00Z",
      }));
      expect(result.lifecycleState).toBe("ONBOARDING");
    }
  });

  it("returns DISCHARGED when discharged=true", () => {
    const result = computeRiskScore(baseInput({ discharged: true }));
    expect(result.lifecycleState).toBe("DISCHARGED");
  });

  it("returns LAPSED when >14 days since last session and no future booking", () => {
    const result = computeRiskScore(baseInput({
      lastSessionDate: "2026-03-20T10:00:00Z",
      nextSessionDate: null,
    }));
    expect(result.lifecycleState).toBe("LAPSED");
  });

  it("returns CHURNED when churnRisk=true and last sequence >60 days ago", () => {
    const result = computeRiskScore(baseInput({
      churnRisk: true,
      lastSequenceSentAt: "2026-01-01T10:00:00Z",
      lastSessionDate: "2026-01-01T10:00:00Z",
      nextSessionDate: null,
    }));
    expect(result.lifecycleState).toBe("CHURNED");
  });

  it("returns RE_ENGAGED when prior state was LAPSED and nextSessionDate is set", () => {
    const result = computeRiskScore(baseInput({
      priorLifecycleState: "LAPSED",
      nextSessionDate: "2026-04-15T10:00:00Z",
    }));
    expect(result.lifecycleState).toBe("RE_ENGAGED");
  });

  it("returns RE_ENGAGED when prior state was AT_RISK and nextSessionDate is set", () => {
    const result = computeRiskScore(baseInput({
      priorLifecycleState: "AT_RISK",
      nextSessionDate: "2026-04-15T10:00:00Z",
    }));
    expect(result.lifecycleState).toBe("RE_ENGAGED");
  });

  // ── Risk score computation ──────────────────────────────────────────────

  it("produces score 0–100", () => {
    const result = computeRiskScore(baseInput());
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  it("returns higher risk for no HEP, no future booking, low attendance", () => {
    const healthy = computeRiskScore(baseInput({
      hepProgramId: "prog-1",
      hepComplianceData: true,
      sessionsAttendedLast4Weeks: 3,
      sessionsScheduledLast4Weeks: 3,
    }));
    const risky = computeRiskScore(baseInput({
      hepProgramId: null,
      hepComplianceData: false,
      sessionsAttendedLast4Weeks: 1,
      sessionsScheduledLast4Weeks: 4,
      nextSessionDate: null,
    }));
    expect(risky.riskScore).toBeGreaterThan(healthy.riskScore);
  });

  it("insurance lowers static risk (higher value = more protective)", () => {
    // In the code: insuranceFlag subtracts 30 from staticRisk base of 70.
    // staticRisk is a component of the engagement score (inverted to risk).
    // Insurance = lower staticRisk value (40 vs 70), meaning lower engagement contribution.
    const noInsurance = computeRiskScore(baseInput({ insuranceFlag: false }));
    const insured = computeRiskScore(baseInput({ insuranceFlag: true }));
    expect(insured.riskFactors.staticRisk).toBeLessThan(noInsurance.riskFactors.staticRisk);
  });

  it("DNAs in first 3 sessions reduce attendance score", () => {
    const noDna = computeRiskScore(baseInput({ dnasInFirstThreeSessions: 0 }));
    const withDna = computeRiskScore(baseInput({ dnasInFirstThreeSessions: 2 }));
    expect(withDna.riskFactors.attendance).toBeLessThan(noDna.riskFactors.attendance);
  });

  // ── Heidi complexity adjustments ────────────────────────────────────────

  it("psychosocial flags reduce sentiment score", () => {
    const noPsych = computeRiskScore(baseInput());
    const withPsych = computeRiskScore(baseInput({
      complexitySignals: { psychosocialFlags: true },
    }));
    expect(withPsych.riskFactors.sentiment).toBeLessThan(noPsych.riskFactors.sentiment);
  });

  it("high complexity + low attendance reduces treatment progress", () => {
    const result = computeRiskScore(baseInput({
      complexitySignals: { treatmentComplexity: "high" },
      sessionsAttendedLast4Weeks: 1,
      sessionsScheduledLast4Weeks: 4,
    }));
    const baseline = computeRiskScore(baseInput({
      sessionsAttendedLast4Weeks: 1,
      sessionsScheduledLast4Weeks: 4,
    }));
    expect(result.riskFactors.treatmentProgress).toBeLessThanOrEqual(
      baseline.riskFactors.treatmentProgress
    );
  });

  // ── Session threshold alert ─────────────────────────────────────────────

  it("sessionThresholdAlert true only for ONBOARDING state", () => {
    const onboarding = computeRiskScore(baseInput({
      sessionCount: 2,
      nextSessionDate: "2026-04-15T10:00:00Z",
    }));
    expect(onboarding.sessionThresholdAlert).toBe(true);

    const active = computeRiskScore(baseInput({ sessionCount: 5 }));
    expect(active.sessionThresholdAlert).toBe(false);
  });

  // ── Risk factor clamping ────────────────────────────────────────────────

  it("all risk factors are clamped to 0–100", () => {
    const result = computeRiskScore(baseInput({
      sessionsAttendedLast4Weeks: 100,
      sessionsScheduledLast4Weeks: 1,
      dnasInFirstThreeSessions: 5,
      sessionCount: 20,
      courseLength: 1,
      npsScore: 10,
    }));

    const factors = result.riskFactors;
    for (const [, value] of Object.entries(factors)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});
