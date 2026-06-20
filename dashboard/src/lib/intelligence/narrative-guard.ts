/**
 * narrative-guard.ts
 *
 * Post-generation numeric guard for LLM-generated coaching narratives.
 *
 * The guard extracts every currency (£), percentage (%), and x-multiple from
 * a narrative and rejects it if any extracted number is NOT present in the
 * event metadata that was passed to the model. This prevents fabricated figures
 * from reaching clinic owner inboxes.
 *
 * All functions are pure and have no side effects, making them easy to test.
 */

import type { InsightEvent } from "@/types/insight-events";

// ── Number extraction ─────────────────────────────────────────────────────────

/**
 * Extract every numeric value that appears in a guarded context:
 *   - Currency:    £390    -> 390
 *   - Percentage:  21%     -> 21
 *   - x-multiple:  2.4x    -> 2.4
 *
 * Returns a Set<number> so callers can use `.has()` for O(1) lookup.
 */
export function extractNumbers(text: string): Set<number> {
  const result = new Set<number>();

  // Currency: £<number>  (e.g. £390, £1,200, £65.00)
  for (const m of text.matchAll(/£([\d,]+(?:\.\d+)?)/g)) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isFinite(n)) result.add(n);
  }

  // Percentage: <number>%  (e.g. 21%, 74.5%)
  for (const m of text.matchAll(/([\d]+(?:\.\d+)?)%/g)) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n)) result.add(n);
  }

  // x-multiple: <number>x  (e.g. 2.4x, 3x)
  for (const m of text.matchAll(/([\d]+(?:\.\d+)?)x\b/gi)) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n)) result.add(n);
  }

  return result;
}

// ── Allowed-number set ────────────────────────────────────────────────────────

/**
 * Build the complete set of numeric values the model was given, so the guard
 * knows which numbers are legitimate.
 *
 * Sources (in priority order):
 *   1. event.revenueImpact
 *   2. revenuePerSession passed from the clinic config
 *   3. All numeric values inside event.metadata
 *   4. Numeric fields on the event root (clinicianId / patientId are strings, skip)
 */
export function buildAllowedNumbers(
  event: InsightEvent,
  revenuePerSession: number
): Set<number> {
  const allowed = new Set<number>();

  if (Number.isFinite(event.revenueImpact) && event.revenueImpact != null) {
    allowed.add(event.revenueImpact);
  }

  if (Number.isFinite(revenuePerSession)) {
    allowed.add(revenuePerSession);
  }

  // Numeric metadata values
  for (const raw of Object.values(event.metadata)) {
    if (raw == null) continue;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (Number.isFinite(n)) allowed.add(n);
  }

  return allowed;
}

// ── Guard result ──────────────────────────────────────────────────────────────

export interface GuardResult {
  accepted: boolean;
  narrative: string;
  /** Numbers found in the narrative that are NOT in the allowed set */
  fabricatedNumbers: number[];
}

// ── Main guard function ───────────────────────────────────────────────────────

/**
 * guardNarrative
 *
 * Accepts the narrative if every £/%/x-multiple it contains is present in the
 * set of numbers the model was given (event metadata + revenuePerSession).
 *
 * Returns accepted=false with the list of fabricated numbers if any unknown
 * figure is found. The caller should then fall back to the deterministic
 * event description.
 */
export function guardNarrative(
  narrative: string,
  event: InsightEvent,
  revenuePerSession: number
): GuardResult {
  const extracted = extractNumbers(narrative);

  if (extracted.size === 0) {
    // No guarded figures in the text - safe to pass through
    return { accepted: true, narrative, fabricatedNumbers: [] };
  }

  const allowed = buildAllowedNumbers(event, revenuePerSession);
  const fabricated: number[] = [];

  for (const n of extracted) {
    if (!allowed.has(n)) {
      fabricated.push(n);
    }
  }

  if (fabricated.length > 0) {
    return { accepted: false, narrative, fabricatedNumbers: fabricated };
  }

  return { accepted: true, narrative, fabricatedNumbers: [] };
}
