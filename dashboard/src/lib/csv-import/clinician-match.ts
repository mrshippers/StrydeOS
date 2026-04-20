/**
 * Fuzzy-match a practitioner name (from a PMS CSV export) to an existing
 * StrydeOS Clinician record.
 *
 * Matches in priority order:
 *   1. PMS external ID (exact) — highest confidence, skips name logic entirely.
 *   2. Exact normalized full-name match.
 *   3. Single-token input matched to a unique first-name token across the
 *      active clinician set.
 *   4. Damerau–Levenshtein similarity ≥ 0.7 (single winner).
 *
 * When more than one candidate is plausible (ambiguous first-name OR multiple
 * clinicians above the fuzzy threshold) the function returns clinicianId=null
 * and populates `alternatives` so the UI can prompt the owner to disambiguate.
 */

export interface ClinicianMatchCandidate {
  id: string;
  name: string;
  pmsExternalId?: string;
  active?: boolean;
}

export interface ClinicianMatchInput {
  practitionerName: string;
  practitionerId?: string;
  clinicians: ClinicianMatchCandidate[];
}

export type ClinicianMatchType =
  | "exact"
  | "firstName"
  | "fuzzy"
  | "pmsExternalId"
  | "none";

export interface ClinicianMatchAlternative {
  id: string;
  name: string;
  confidence: number;
}

export interface ClinicianMatchResult {
  clinicianId: string | null;
  confidence: number;
  alternatives: ClinicianMatchAlternative[];
  matchType: ClinicianMatchType;
}

const FUZZY_THRESHOLD = 0.7;

/** Lowercase, trim, strip punctuation (keep letters/numbers/whitespace), collapse whitespace. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Damerau–Levenshtein distance (with adjacent transposition). */
function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const d: number[][] = [];
  for (let i = 0; i <= al; i++) {
    d[i] = new Array<number>(bl + 1);
    d[i][0] = i;
  }
  for (let j = 0; j <= bl; j++) d[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[al][bl];
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - damerauLevenshtein(a, b) / maxLen;
}

function none(): ClinicianMatchResult {
  return { clinicianId: null, confidence: 0, alternatives: [], matchType: "none" };
}

export function matchClinician(input: ClinicianMatchInput): ClinicianMatchResult {
  const { practitionerName, practitionerId, clinicians } = input;

  // 1. PMS external ID wins outright
  if (practitionerId && practitionerId.trim() !== "") {
    const pid = practitionerId.trim();
    const byPmsId = clinicians.find((c) => c.pmsExternalId && c.pmsExternalId === pid);
    if (byPmsId) {
      return {
        clinicianId: byPmsId.id,
        confidence: 1.0,
        alternatives: [],
        matchType: "pmsExternalId",
      };
    }
  }

  const rawName = (practitionerName ?? "").trim();
  if (!rawName) return none();

  // 2. Only consider active clinicians for name-based matching
  const active = clinicians.filter((c) => c.active !== false);
  if (active.length === 0) return none();

  const normInput = normalize(rawName);
  if (!normInput) return none();

  // 3. Exact normalized full-name match
  const exactMatches = active.filter((c) => normalize(c.name) === normInput);
  if (exactMatches.length === 1) {
    return {
      clinicianId: exactMatches[0].id,
      confidence: 1.0,
      alternatives: [],
      matchType: "exact",
    };
  }
  if (exactMatches.length > 1) {
    return {
      clinicianId: null,
      confidence: 0,
      alternatives: exactMatches.map((c) => ({ id: c.id, name: c.name, confidence: 1.0 })),
      matchType: "exact",
    };
  }

  // 4. Single-token input → unique first-name token match
  const inputTokens = normInput.split(" ").filter(Boolean);
  if (inputTokens.length === 1) {
    const token = inputTokens[0];
    const firstNameHits = active.filter((c) => {
      const ft = normalize(c.name).split(" ").filter(Boolean)[0];
      return ft === token;
    });
    if (firstNameHits.length === 1) {
      return {
        clinicianId: firstNameHits[0].id,
        confidence: 1.0,
        alternatives: [],
        matchType: "firstName",
      };
    }
    if (firstNameHits.length > 1) {
      return {
        clinicianId: null,
        confidence: 0,
        alternatives: firstNameHits.map((c) => ({ id: c.id, name: c.name, confidence: 1.0 })),
        matchType: "firstName",
      };
    }
    // fall through to fuzzy if no first-name token match found
  }

  // 5. Damerau–Levenshtein similarity on full normalized names
  const scored = active
    .map((c) => ({
      id: c.id,
      name: c.name,
      confidence: Math.round(similarity(normInput, normalize(c.name)) * 1000) / 1000,
    }))
    .filter((c) => c.confidence >= FUZZY_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence);

  if (scored.length === 0) return none();
  if (scored.length === 1) {
    return {
      clinicianId: scored[0].id,
      confidence: scored[0].confidence,
      alternatives: [],
      matchType: "fuzzy",
    };
  }

  // Multiple fuzzy candidates — ambiguous, ask the UI to disambiguate.
  return {
    clinicianId: null,
    confidence: 0,
    alternatives: scored,
    matchType: "fuzzy",
  };
}
