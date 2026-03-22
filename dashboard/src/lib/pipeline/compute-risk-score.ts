/**
 * compute-risk-score.ts
 *
 * Computes a weighted 0–100 risk score and assigns a LifecycleState for each patient.
 * Called from compute-patients.ts after existing discharge/churnRisk logic.
 *
 * Factor weights:
 *   attendance       30%
 *   treatmentProgress 25%
 *   hepEngagement    20%
 *   sentiment        15%
 *   staticRisk       10%
 *
 * Lifecycle precedence (first match wins):
 *   1. CHURNED     — churnRisk=true AND last sequence >60 days ago
 *   2. DISCHARGED  — discharged=true
 *   3. RE_ENGAGED  — prior state was LAPSED/AT_RISK AND nextSessionDate now present
 *   4. AT_RISK     — riskScore >= 60 AND !discharged
 *   5. LAPSED      — daysSinceLast >14 AND !nextSessionDate AND !discharged
 *   6. ONBOARDING  — sessionCount 1–3
 *   7. NEW         — sessionCount = 0
 *   8. ACTIVE      — all other cases
 */

import type { LifecycleState, RiskFactors } from "@/types";

export interface RiskScoreInput {
  sessionCount: number;
  courseLength: number;
  lastSessionDate?: string | null;
  nextSessionDate?: string | null;
  discharged: boolean;
  churnRisk: boolean;
  insuranceFlag: boolean;
  hepProgramId?: string | null;
  hepComplianceData?: boolean; // true if HEP provider compliance data present
  isInitialAssessmentWithNoFollowUp?: boolean;
  followUpBookedAtLastSession?: boolean;
  dnasInFirstThreeSessions?: number; // count of DNA appointments in first 3 sessions
  sessionsAttendedLast4Weeks?: number;
  sessionsScheduledLast4Weeks?: number;
  nprsImprovement?: number | null;   // positive = improvement
  npsScore?: number | null;          // 0–10
  priorLifecycleState?: LifecycleState | null;
  lastSequenceSentAt?: string | null;
  now?: Date;
  // Heidi enrichment — when present, adjusts risk calculation
  complexitySignals?: {
    treatmentComplexity?: "low" | "moderate" | "high";
    psychosocialFlags?: boolean;
    chronicIndicators?: boolean;
    painScore?: number;
  } | null;
}

export interface RiskScoreResult {
  riskScore: number;
  riskFactors: RiskFactors;
  lifecycleState: LifecycleState;
  sessionThresholdAlert: boolean;
}

export function computeRiskScore(input: RiskScoreInput): RiskScoreResult {
  const now = input.now ?? new Date();

  // ── Factor: attendance (30%) ────────────────────────────────────────────
  let attendance = 100;
  if (
    input.sessionsScheduledLast4Weeks !== undefined &&
    input.sessionsScheduledLast4Weeks > 0
  ) {
    attendance =
      ((input.sessionsAttendedLast4Weeks ?? 0) /
        input.sessionsScheduledLast4Weeks) *
      100;
  }
  if ((input.dnasInFirstThreeSessions ?? 0) > 0) attendance -= 20;
  attendance = Math.max(0, Math.min(100, attendance));

  // ── Factor: treatmentProgress (25%) ────────────────────────────────────
  const courseLen = Math.max(1, input.courseLength);
  let treatmentProgress = (input.sessionCount / courseLen) * 100;
  if (input.followUpBookedAtLastSession) treatmentProgress += 15;
  if (input.sessionCount < 3 && !input.nextSessionDate) treatmentProgress -= 25;
  treatmentProgress = Math.max(0, Math.min(100, treatmentProgress));

  // ── Factor: hepEngagement (20%) ────────────────────────────────────────
  let hepEngagement = 0;
  if (input.hepProgramId) {
    hepEngagement = input.hepComplianceData ? 100 : 50;
  }

  // ── Factor: sentiment (15%) ────────────────────────────────────────────
  let sentiment = 50; // neutral default
  if (input.nprsImprovement !== null && input.nprsImprovement !== undefined) {
    if (input.nprsImprovement > 0) sentiment = 100;
    else if (input.nprsImprovement < 0) sentiment = 0;
    else sentiment = 50;
  } else if (input.npsScore !== null && input.npsScore !== undefined) {
    sentiment = (input.npsScore / 10) * 100;
  }
  sentiment = Math.max(0, Math.min(100, sentiment));

  // ── Factor: staticRisk (10%) ────────────────────────────────────────────
  let staticRisk = 70;
  if (input.insuranceFlag) staticRisk -= 30;
  if (input.isInitialAssessmentWithNoFollowUp) staticRisk -= 20;
  staticRisk = Math.max(0, Math.min(100, staticRisk));

  // ── Heidi complexity adjustment ─────────────────────────────────────────
  // When Heidi data is available, high complexity + low compliance = higher risk.
  // Psychosocial flags lower the sentiment score (patient needs more support).
  // High pain scores with poor attendance amplify risk.
  if (input.complexitySignals) {
    const cx = input.complexitySignals;
    if (cx.psychosocialFlags) sentiment = Math.max(0, sentiment - 15);
    if (cx.treatmentComplexity === "high" && attendance < 70) {
      treatmentProgress = Math.max(0, treatmentProgress - 10);
    }
    if (cx.painScore !== undefined && cx.painScore >= 7 && attendance < 60) {
      staticRisk = Math.max(0, staticRisk - 15);
    }
  }

  // ── Composite score ─────────────────────────────────────────────────────
  // Factors produce an engagement score where 100 = best health.
  // Invert to produce a risk score where 100 = highest risk, so that
  // the AT_RISK threshold (>= 60) correctly targets disengaged patients.
  const engagementScore = Math.round(
    attendance * 0.3 +
      treatmentProgress * 0.25 +
      hepEngagement * 0.2 +
      sentiment * 0.15 +
      staticRisk * 0.1
  );
  const riskScore = 100 - engagementScore;

  const riskFactors: RiskFactors = {
    attendance,
    treatmentProgress,
    hepEngagement,
    sentiment,
    staticRisk,
  };

  // ── Lifecycle state ─────────────────────────────────────────────────────
  const daysSinceLast = input.lastSessionDate
    ? Math.floor(
        (now.getTime() - new Date(input.lastSessionDate).getTime()) /
          86_400_000
      )
    : Infinity;

  const daysSinceLastSequence = input.lastSequenceSentAt
    ? Math.floor(
        (now.getTime() - new Date(input.lastSequenceSentAt).getTime()) /
          86_400_000
      )
    : Infinity;

  let lifecycleState: LifecycleState;

  if (input.churnRisk && daysSinceLastSequence > 60) {
    // CHURNED: lapsed and no sequence engagement in 60+ days
    lifecycleState = "CHURNED";
  } else if (input.discharged) {
    lifecycleState = "DISCHARGED";
  } else if (
    (input.priorLifecycleState === "LAPSED" ||
      input.priorLifecycleState === "AT_RISK") &&
    !!input.nextSessionDate
  ) {
    // RE_ENGAGED: was at-risk/lapsed, now has a future appointment
    lifecycleState = "RE_ENGAGED";
  } else if (riskScore >= 60 && !input.discharged) {
    lifecycleState = "AT_RISK";
  } else if (daysSinceLast > 14 && !input.nextSessionDate && !input.discharged) {
    lifecycleState = "LAPSED";
  } else if (input.sessionCount >= 1 && input.sessionCount <= 3) {
    lifecycleState = "ONBOARDING";
  } else if (input.sessionCount === 0) {
    lifecycleState = "NEW";
  } else {
    lifecycleState = "ACTIVE";
  }

  return {
    riskScore,
    riskFactors,
    lifecycleState,
    sessionThresholdAlert: lifecycleState === "ONBOARDING",
  };
}
