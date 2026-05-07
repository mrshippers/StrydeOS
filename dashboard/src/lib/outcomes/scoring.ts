/**
 * Outcome measure scoring algorithms.
 *
 * Each function takes raw item-level input, validates it against the
 * published-literature definition of the measure, and returns:
 *   - `score`  — the computed instrument score (numeric, even when invalid)
 *   - `valid`  — whether the input passed validation
 *
 * MCID thresholds (Minimal Clinically Important Difference) are sourced from
 * `@/types/outcome-measures` (`OUTCOME_MCID`). Improvement direction depends
 * on the measure: NPRS / QuickDASH / ODI / NDI improve when the score
 * decreases; PSFS improves when the score increases. `isMcidImprovement`
 * encodes that direction so callers can ask the simple question without
 * memorising per-measure semantics.
 *
 * These functions are intentionally pure and UI-agnostic — they will later
 * be invoked from the outcome capture flow, the dashboard's clinical-to-
 * commercial correlation engine, and any backfill scripts.
 *
 * Citations (also recorded in OUTCOME_MCID):
 *   - NPRS:      Farrar et al. 2001     — MCID = 2 on 0-10
 *   - PSFS:      Stratford et al. 1995  — MCID = 2 on 0-10
 *   - QuickDASH: Mintken et al. 2009    — MCID = 8 on 0-100
 *   - ODI:       Ostelo et al. 2008     — MCID = 10 on 0-100
 *   - NDI:       Young et al. 2009      — MCID = 7 on 0-100
 */

import { OUTCOME_MCID } from "@/types/outcome-measures";
import type { OutcomeMeasureType } from "@/types/outcomes";

export interface ScoreResult {
  score: number;
  valid: boolean;
}

// ── NPRS — single 0-10 value ─────────────────────────────────────────────────

/**
 * Numeric Pain Rating Scale. Single integer 0-10.
 * Higher = worse pain. Improvement = decrease ≥ MCID.
 */
export function scoreNPRS(raw: number): ScoreResult {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 10) {
    return { score: 0, valid: false };
  }
  return { score: raw, valid: true };
}

// ── PSFS — exactly 3 patient-selected activities, each 0-10 ─────────────────

/**
 * Patient-Specific Functional Scale. Exactly 3 activities, each 0-10.
 * Score = mean of the three. Higher = better function.
 * Improvement = increase ≥ MCID.
 */
export function scorePSFS(activities: number[]): ScoreResult {
  if (!Array.isArray(activities) || activities.length !== 3) {
    return { score: 0, valid: false };
  }
  for (const v of activities) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 10) {
      return { score: 0, valid: false };
    }
  }
  const sum = activities.reduce((a, b) => a + b, 0);
  return { score: sum / activities.length, valid: true };
}

// ── QuickDASH — 11 items, each 1-5 ──────────────────────────────────────────

/**
 * Quick Disabilities of Arm, Shoulder & Hand. 11 items each 1-5.
 *   score = ((sum / n) - 1) * 25     range 0-100
 * Per the QuickDASH manual at most ONE missing item is allowed; with ≥ 2
 * missing the score is invalid. Higher = worse function.
 * Improvement = decrease ≥ MCID.
 */
export function scoreQuickDASH(items: number[]): ScoreResult {
  if (!Array.isArray(items) || items.length === 0 || items.length > 11) {
    return { score: 0, valid: false };
  }
  const present = items.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  // Need at least 10 of the 11 items answered for a valid score.
  if (present.length < 10) {
    return { score: 0, valid: false };
  }
  for (const v of present) {
    if (v < 1 || v > 5) return { score: 0, valid: false };
  }
  const mean = present.reduce((a, b) => a + b, 0) / present.length;
  return { score: (mean - 1) * 25, valid: true };
}

// ── ODI — 10 sections, each 0-5 ─────────────────────────────────────────────

/**
 * Oswestry Disability Index. 10 sections each 0-5.
 *   score = (sum / (n * 5)) * 100    range 0-100
 * Missing sections drop out of both numerator and denominator (the
 * standard handling per Fairbank's manual). Higher = worse disability.
 * Improvement = decrease ≥ MCID.
 */
export function scoreODI(sections: number[]): ScoreResult {
  return scorePercentageInstrument(sections, 10, 5);
}

// ── NDI — 10 sections, each 0-5, identical formula to ODI ───────────────────

/**
 * Neck Disability Index. Same structure and scoring as ODI.
 * Higher = worse disability. Improvement = decrease ≥ MCID.
 */
export function scoreNDI(sections: number[]): ScoreResult {
  return scorePercentageInstrument(sections, 10, 5);
}

/**
 * Shared 0-100 percentage scorer used by ODI and NDI. Validates length,
 * range, and missing-item handling in one place.
 */
function scorePercentageInstrument(
  sections: number[],
  expectedLength: number,
  perSectionMax: number
): ScoreResult {
  if (!Array.isArray(sections) || sections.length === 0 || sections.length > expectedLength) {
    return { score: 0, valid: false };
  }
  const present = sections.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  // Need at least half the sections answered to produce a meaningful score.
  if (present.length < Math.ceil(expectedLength / 2)) {
    return { score: 0, valid: false };
  }
  for (const v of present) {
    if (v < 0 || v > perSectionMax) return { score: 0, valid: false };
  }
  const sum = present.reduce((a, b) => a + b, 0);
  const score = (sum / (present.length * perSectionMax)) * 100;
  return { score, valid: true };
}

// ── MCID gate ───────────────────────────────────────────────────────────────

/**
 * Direction-aware MCID check. Returns true iff the change between baseline
 * and current scores crosses the published MCID threshold *in the
 * improvement direction* for the given measure.
 *
 * For "lower is better" measures (NPRS, QuickDASH, ODI, NDI):
 *   improvement = baseline - current ≥ MCID
 * For "higher is better" measures (PSFS):
 *   improvement = current - baseline ≥ MCID
 */
export function isMcidImprovement(
  measure: OutcomeMeasureType,
  baseline: number,
  current: number
): boolean {
  const mcid = OUTCOME_MCID[measure];
  if (typeof mcid !== "number") return false;
  // Higher-is-better instruments — see OUTCOME_MEASURES.higherIsBetter.
  // Hardcoded here (rather than imported) so the gate stays a pure function
  // and avoids a circular dependency with the definitions list.
  const higherIsBetter = HIGHER_IS_BETTER.has(measure);
  const delta = higherIsBetter ? current - baseline : baseline - current;
  return delta >= mcid;
}

const HIGHER_IS_BETTER: ReadonlySet<OutcomeMeasureType> = new Set<OutcomeMeasureType>([
  "psfs",
  "oxford_knee",
  "oxford_hip",
  "koos",
  "hoos",
  "visa_a",
  "visa_p",
]);
