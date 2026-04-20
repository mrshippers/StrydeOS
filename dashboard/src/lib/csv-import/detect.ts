import type { CSVSchema, CSVFileType, DetectionResult, CanonicalField } from "./types";

function normaliseKey(key: string): string {
  return key.toLowerCase().trim().replace(/\s+/g, "_");
}

/**
 * Canonical fields considered "high-signal" for detection. A real PMS export
 * almost always contains most of these — they form the denominator for scoring
 * alongside each schema's declared required fields.
 *
 * Rationale: schemas carry many aliases (e.g. WriteUpp has 5+ names for "date"),
 * so dividing by total unique canonicals penalises otherwise-canonical exports
 * that happen to use only one alias per field.
 */
const HIGH_SIGNAL_FIELDS: readonly CanonicalField[] = [
  "date",
  "practitioner",
  "status",
  "patientId",
  "type",
  "price",
  "time",
] as const;

/**
 * Build the "core" canonical set for a schema: requiredFields UNION the
 * high-signal fields that this schema actually maps. This is the denominator
 * against which we measure match quality.
 */
function coreFieldsFor(schema: CSVSchema): Set<CanonicalField> {
  const schemaCanonicals = new Set<CanonicalField>(Object.values(schema.fieldMap));
  const core = new Set<CanonicalField>(schema.requiredFields);
  for (const f of HIGH_SIGNAL_FIELDS) {
    if (schemaCanonicals.has(f)) core.add(f);
  }
  return core;
}

/**
 * Detect which CSV schema best matches the given header row.
 * Returns the top-scoring schema if confidence >= 0.4, otherwise null.
 */
export function detectSchema(
  headers: string[],
  schemas: CSVSchema[],
  fileType: CSVFileType
): DetectionResult | null {
  const headerList = headers.map((h) => h.trim());

  const candidates: DetectionResult[] = [];

  for (const schema of schemas) {
    if (schema.fileType !== fileType && schema.fileType !== "both") continue;

    const fieldMapKeys = Object.keys(schema.fieldMap);
    if (fieldMapKeys.length === 0) continue;

    const normalisedFieldMapKeys = new Map<string, string>();
    for (const key of fieldMapKeys) {
      normalisedFieldMapKeys.set(normaliseKey(key), key);
    }

    const matchedCanonicals = new Set<CanonicalField>();
    const unmatchedHeaders: string[] = [];

    for (const header of headerList) {
      const normHeader = normaliseKey(header);
      const originalKey = normalisedFieldMapKeys.get(normHeader);
      if (originalKey !== undefined) {
        matchedCanonicals.add(schema.fieldMap[originalKey]);
      } else {
        unmatchedHeaders.push(header);
      }
    }

    // New denominator: required ∪ high-signal-present-in-schema.
    const coreFields = coreFieldsFor(schema);
    let matchedCore = 0;
    for (const c of matchedCanonicals) {
      if (coreFields.has(c)) matchedCore++;
    }
    const coreSize = coreFields.size;

    // Base score: fraction of the core set that matched.
    let score = coreSize > 0 ? matchedCore / coreSize : 0;

    // Soft penalty per missing required field (was -0.3, now -0.15).
    const missingRequired: CanonicalField[] = [];
    for (const req of schema.requiredFields) {
      if (!matchedCanonicals.has(req)) {
        missingRequired.push(req);
        score -= 0.15;
      }
    }

    score = Math.max(0, score);

    candidates.push({
      schema,
      confidence: score,
      matchedFields: matchedCanonicals.size,
      unmatchedHeaders,
      missingRequired,
    });
  }

  // Uniqueness floor: if exactly one schema matched any canonical field AND
  // no competing schema matched anything, the top candidate is unambiguous —
  // floor its confidence to 0.7 so minimal-but-unique exports (e.g. WriteUpp
  // Income-by-Clinician, which only exposes a "Month" date column) still
  // surface a usable detection rather than a null.
  const withMatches = candidates.filter((c) => c.matchedFields > 0);
  if (withMatches.length === 1) {
    const sole = withMatches[0];
    if (sole.confidence < 0.7) {
      sole.confidence = 0.7;
    }
  }

  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.schema.priority - b.schema.priority;
  });

  const top = candidates[0];
  if (!top || top.confidence < 0.4) return null;
  return top;
}
