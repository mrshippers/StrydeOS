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
 * Lifecycle (cadence-relative, episode-aware — replaces the old flat 14-day rule).
 * Rebooking cadence is condition-dependent, so "overdue" is measured against each
 * patient's OWN expected interval (median gap of their completed sessions), not a
 * fixed threshold. A patient with no future booking is only AT_RISK once they are
 * overdue versus their own rhythm AND still inside the actionable window — not when
 * they are simply between their normal visits, and not when care ended by plan.
 *
 * Precedence (first match wins), for a patient with sessionCount >= 1:
 *   1. NEW         — sessionCount = 0 (never seen — excludes stale zero-appointment
 *                    imports; this is the primary kill for the old-Spires "259" bleed)
 *   2. has future booking → RE_ENGAGED (was LAPSED/AT_RISK) | ONBOARDING (1–3) | ACTIVE
 *   3. DISCHARGED  — treatment complete BY PLAN: last appointment type = "discharge",
 *                    OR reached course length with no follow-up booked at last session
 *   4. within cadence — daysSinceLast <= expectedInterval × overdueFactor → ONBOARDING/ACTIVE
 *   5. AT_RISK     — overdue vs own cadence, still actionable:
 *                    expectedInterval×overdueFactor < daysSinceLast <= min(expectedInterval×churnFactor, atRiskMaxDays)
 *   6. CHURNED     — churnRisk AND last sequence >60 days ago
 *   7. LAPSED      — past the actionable window (separate bucket, not headline "at risk")
 * riskScore (0–100 composite) is retained as a severity/sort signal within AT_RISK.
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
  // ── Cadence-relative at-risk model (condition-dependent rebooking) ──────────
  /** Patient's expected days between visits — median gap of their completed
   *  sessions when known, else the clinic default. Falls back to 21 if absent. */
  expectedIntervalDays?: number | null;
  /** appointmentType of the patient's most recent appointment — "discharge"
   *  signals a planned end of care. */
  lastAppointmentType?: string | null;
  /** Effective course length for this patient (insurance sessionsAuthorised when
   *  present, else the clinic treatment-length default). Defaults to courseLength. */
  effectiveCourseLength?: number | null;
  /** Multiplier on expectedInterval before a patient is "overdue" (default 1.5). */
  overdueFactor?: number;
  /** Multiplier on expectedInterval bounding the actionable at-risk window (default 3). */
  churnFactor?: number;
  /** Absolute cap (days) on the actionable at-risk window (default 90). */
  atRiskMaxDays?: number;
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
  const treatmentLen = Math.max(1, input.courseLength);
  let treatmentProgress = (input.sessionCount / treatmentLen) * 100;
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

  // Expected rebooking interval for THIS patient, clamped to a sane physio range.
  const expectedInterval = Math.max(
    5,
    Math.min(56, input.expectedIntervalDays ?? 21),
  );
  const overdueFactor = input.overdueFactor ?? 1.5;
  const churnFactor = input.churnFactor ?? 3;
  const atRiskMaxDays = input.atRiskMaxDays ?? 90;
  const overdueAt = expectedInterval * overdueFactor;
  const actionableUntil = Math.min(expectedInterval * churnFactor, atRiskMaxDays);

  // Treatment complete BY PLAN (not mere inactivity): an explicit discharge
  // appointment, or reaching the course length without a follow-up intended.
  const courseLen = Math.max(1, input.effectiveCourseLength ?? input.courseLength);
  const treatmentComplete =
    input.lastAppointmentType === "discharge" ||
    (input.sessionCount >= courseLen && !input.followUpBookedAtLastSession);

  const onboardingOrActive: LifecycleState =
    input.sessionCount >= 1 && input.sessionCount <= 3 ? "ONBOARDING" : "ACTIVE";

  let lifecycleState: LifecycleState;

  if (input.sessionCount === 0) {
    // Never seen — not in any treatment episode. Excludes stale zero-appointment
    // imports that used to fall through to LAPSED and inflate "patients at risk".
    lifecycleState = "NEW";
  } else if (input.nextSessionDate) {
    // Future booking exists → on track (re-engaged if previously drifting).
    lifecycleState =
      input.priorLifecycleState === "LAPSED" ||
      input.priorLifecycleState === "AT_RISK"
        ? "RE_ENGAGED"
        : onboardingOrActive;
  } else if (treatmentComplete) {
    lifecycleState = "DISCHARGED";
  } else if (daysSinceLast <= overdueAt) {
    // Within their own rebooking cadence — between normal visits, not at risk.
    lifecycleState = onboardingOrActive;
  } else if (daysSinceLast <= actionableUntil) {
    // Overdue versus their own rhythm and still worth chasing → genuine drop-off.
    lifecycleState = "AT_RISK";
  } else if (input.churnRisk && daysSinceLastSequence > 60) {
    lifecycleState = "CHURNED";
  } else {
    // Past the actionable window — lapsed, but not the headline "at risk" number.
    lifecycleState = "LAPSED";
  }

  return {
    riskScore,
    riskFactors,
    lifecycleState,
    sessionThresholdAlert: lifecycleState === "ONBOARDING",
  };
}
