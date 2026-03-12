import type { CSVSchema, CSVFileType, DetectionResult, CanonicalField } from "./types";

function normaliseKey(key: string): string {
  return key.toLowerCase().trim().replace(/\s+/g, "_");
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
  const normalisedHeaders = new Set(headers.map(normaliseKey));
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

    const uniqueCanonicals = new Set(Object.values(schema.fieldMap));
    const totalUniqueFields = uniqueCanonicals.size;

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

    let score = matchedCanonicals.size / totalUniqueFields;

    const missingRequired: CanonicalField[] = [];
    for (const req of schema.requiredFields) {
      if (!matchedCanonicals.has(req)) {
        missingRequired.push(req);
        score -= 0.3;
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

  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.schema.priority - b.schema.priority;
  });

  const top = candidates[0];
  if (!top || top.confidence < 0.4) return null;
  return top;
}
