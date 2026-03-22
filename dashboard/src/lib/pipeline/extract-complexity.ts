/**
 * extract-complexity.ts
 *
 * Derives ComplexitySignals from Heidi clinical codes + Ask Heidi AI responses.
 * Used during the Heidi sync stage to enrich patient records for Pulse.
 *
 * Signal derivation:
 *   - painScore:            Ask Heidi for NPRS/VAS score (0–10)
 *   - treatmentComplexity:  Clinical code count + body region diversity + comorbidities
 *   - dischargeLikelihood:  Ask Heidi about discharge outlook
 *   - multipleRegions:      Count distinct anatomical region code ranges
 *   - chronicIndicators:    Presence of chronic ICD-10 codes (M40–M54, M70–M79)
 *   - psychosocialFlags:    ICD-10 F40–F48 codes OR Ask Heidi for yellow/red flags
 */

import type { ComplexitySignals, HeidiClinicalCode, TreatmentComplexity, DischargeLikelihood } from "@/types";

// ─── ICD-10 code range helpers ───────────────────────────────────────────────

/** Check if an ICD-10 code falls in a numeric range (e.g. "M40"–"M54"). */
function icdInRange(code: string, start: string, end: string): boolean {
  const upper = code.toUpperCase().replace(/\./g, "");
  const prefix = upper.slice(0, start.length);
  return prefix >= start && prefix <= end;
}

/** MSK chronic condition codes: M40–M54 (dorsopathies), M70–M79 (soft tissue). */
function isChronicMskCode(code: string): boolean {
  return icdInRange(code, "M40", "M54") || icdInRange(code, "M70", "M79");
}

/** Psychosocial codes: F40–F48 (anxiety, stress-related, somatoform). */
function isPsychosocialCode(code: string): boolean {
  return icdInRange(code, "F40", "F48");
}

// Anatomical region groupings by ICD-10 prefix.
const REGION_MAP: Array<{ prefix: string; region: string }> = [
  { prefix: "M54", region: "spine" },
  { prefix: "M50", region: "cervical" },
  { prefix: "M51", region: "lumbar" },
  { prefix: "M75", region: "shoulder" },
  { prefix: "M76", region: "hip" },
  { prefix: "M77", region: "elbow" },
  { prefix: "M23", region: "knee" },
  { prefix: "M24", region: "joint" },
  { prefix: "M79", region: "soft_tissue" },
  { prefix: "M65", region: "tendon" },
  { prefix: "S83", region: "knee" },
  { prefix: "S93", region: "ankle" },
  { prefix: "S43", region: "shoulder" },
  { prefix: "S63", region: "wrist" },
];

function getRegion(code: string): string | null {
  const upper = code.toUpperCase().replace(/\./g, "");
  for (const { prefix, region } of REGION_MAP) {
    if (upper.startsWith(prefix)) return region;
  }
  return null;
}

// ─── Complexity derivation from clinical codes ──────────────────────────────

export interface CodeBasedSignals {
  chronicIndicators: boolean;
  psychosocialFlags: boolean;
  multipleRegions: boolean;
  regionCount: number;
  codeCount: number;
  hasComorbidities: boolean;
}

export function deriveFromClinicalCodes(codes: HeidiClinicalCode[]): CodeBasedSignals {
  const regions = new Set<string>();
  let chronic = false;
  let psychosocial = false;

  for (const entry of codes) {
    const code = entry.primary_code.code;

    if (isChronicMskCode(code)) chronic = true;
    if (isPsychosocialCode(code)) psychosocial = true;

    const region = getRegion(code);
    if (region) regions.add(region);
  }

  return {
    chronicIndicators: chronic,
    psychosocialFlags: psychosocial,
    multipleRegions: regions.size >= 2,
    regionCount: regions.size,
    codeCount: codes.length,
    hasComorbidities: codes.length >= 4,
  };
}

// ─── Treatment complexity from code-based signals ───────────────────────────

export function classifyComplexity(signals: CodeBasedSignals): TreatmentComplexity {
  let score = 0;
  if (signals.multipleRegions) score += 2;
  if (signals.chronicIndicators) score += 2;
  if (signals.hasComorbidities) score += 1;
  if (signals.psychosocialFlags) score += 2;
  if (signals.codeCount >= 5) score += 1;

  if (score >= 4) return "high";
  if (score >= 2) return "moderate";
  return "low";
}

// ─── Parse Ask Heidi responses ──────────────────────────────────────────────

/** Extract a numeric pain score (0–10) from an Ask Heidi answer. */
export function parsePainScore(answer: string): number | undefined {
  // Look for patterns like "7/10", "pain score: 7", "NPRS 7", "VAS 7"
  const patterns = [
    /(\d+(?:\.\d+)?)\s*\/\s*10/i,
    /(?:nprs|vas|pain\s*(?:score|level|rating))\s*(?:is|of|:)?\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:out\s*of\s*10)/i,
  ];

  for (const pattern of patterns) {
    const match = answer.match(pattern);
    if (match) {
      const score = parseFloat(match[1] ?? match[2] ?? "");
      if (!isNaN(score) && score >= 0 && score <= 10) return Math.round(score);
    }
  }
  return undefined;
}

/** Parse discharge likelihood from an Ask Heidi answer. */
export function parseDischargeLikelihood(answer: string): DischargeLikelihood {
  const lower = answer.toLowerCase();
  if (/\bhigh\b/.test(lower) || /discharge\s*(next|soon|imminent|this)/i.test(lower)) return "high";
  if (/\blow\b/.test(lower) || /ongoing|chronic|long[\s-]?term/i.test(lower)) return "low";
  return "moderate";
}

/** Check if Ask Heidi found psychosocial flags in the note. */
export function parsePsychosocialFlags(answer: string): boolean {
  const lower = answer.toLowerCase();
  const keywords = [
    "fear.avoidance", "catastrophi", "kinesiophobia",
    "anxiety", "depression", "sleep.disturbance",
    "yellow.flag", "red.flag", "psychosocial",
    "stress", "hypervigilance",
  ];
  return keywords.some((kw) => new RegExp(kw).test(lower));
}

// ─── Compose full signals ───────────────────────────────────────────────────

export interface AskHeidiAnswers {
  painAnswer?: string;
  dischargeAnswer?: string;
  psychosocialAnswer?: string;
}

/**
 * Compose ComplexitySignals from clinical codes + Ask Heidi answers.
 * Clinical codes provide structured signals; Ask Heidi fills gaps.
 */
export function composeComplexitySignals(
  codes: HeidiClinicalCode[],
  askAnswers: AskHeidiAnswers,
): ComplexitySignals {
  const codeSignals = deriveFromClinicalCodes(codes);

  const painScore = askAnswers.painAnswer
    ? parsePainScore(askAnswers.painAnswer)
    : undefined;

  const dischargeLikelihood = askAnswers.dischargeAnswer
    ? parseDischargeLikelihood(askAnswers.dischargeAnswer)
    : "moderate";

  // Psychosocial: true if either clinical codes OR Ask Heidi flagged it
  const psychosocialFlags = codeSignals.psychosocialFlags ||
    (askAnswers.psychosocialAnswer
      ? parsePsychosocialFlags(askAnswers.psychosocialAnswer)
      : false);

  return {
    painScore,
    treatmentComplexity: classifyComplexity({ ...codeSignals, psychosocialFlags }),
    dischargeLikelihood,
    multipleRegions: codeSignals.multipleRegions,
    chronicIndicators: codeSignals.chronicIndicators,
    psychosocialFlags,
  };
}
