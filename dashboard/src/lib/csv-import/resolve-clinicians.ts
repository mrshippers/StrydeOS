/**
 * Clinician resolution helpers for the CSV import pipeline.
 *
 * Loads the active clinician set for a clinic and provides per-row matching
 * + aggregation utilities. Kept separate from run-import.ts so that file
 * stays under the 500-line bounded-context limit.
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  matchClinician,
  type ClinicianMatchCandidate,
  type ClinicianMatchAlternative,
  type ClinicianMatchResult,
} from "./clinician-match";

/** Confidence at or above this is auto-accepted for fuzzy matches. Below → row is skipped. */
export const FUZZY_ACCEPT_THRESHOLD = 0.85;

export type RowDecision =
  | { kind: "accept"; clinicianId: string; clinicianName: string }
  | { kind: "fuzzy_accept"; clinicianId: string; clinicianName: string; confidence: number }
  | { kind: "ambiguous"; alternatives: ClinicianMatchAlternative[] }
  | { kind: "skip" };

/**
 * Load active+inactive clinicians for the clinic. The matcher itself filters
 * out inactive clinicians for name-based matching, but we keep them in the
 * candidate set so pmsExternalId still resolves cleanly when an inactive
 * clinician is referenced (historic appointment for someone who's left).
 */
export async function loadClinicianCandidates(
  db: Firestore,
  clinicId: string
): Promise<ClinicianMatchCandidate[]> {
  try {
    const snap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("clinicians")
      .get();
    return snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        name: typeof data.name === "string" ? data.name : doc.id,
        pmsExternalId:
          typeof data.pmsExternalId === "string" ? data.pmsExternalId : undefined,
        active: data.active === false ? false : true,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Decide whether to accept, fuzzy-accept, ambiguously-skip, or hard-skip a row
 * based on the matcher result. Single source of truth for the policy so the
 * import pipeline stays a thin orchestrator.
 */
export function decideRow(
  practitionerName: string,
  practitionerId: string | undefined,
  candidates: ClinicianMatchCandidate[]
): { decision: RowDecision; result: ClinicianMatchResult } {
  const result = matchClinician({
    practitionerName,
    practitionerId: practitionerId || undefined,
    clinicians: candidates,
  });

  if (result.alternatives.length > 0) {
    return { decision: { kind: "ambiguous", alternatives: result.alternatives }, result };
  }

  if (
    result.clinicianId === null ||
    (result.matchType === "fuzzy" && result.confidence < FUZZY_ACCEPT_THRESHOLD)
  ) {
    return { decision: { kind: "skip" }, result };
  }

  const matched = candidates.find((c) => c.id === result.clinicianId);
  const clinicianName = matched?.name ?? result.clinicianId;

  if (result.matchType === "fuzzy") {
    return {
      decision: {
        kind: "fuzzy_accept",
        clinicianId: result.clinicianId,
        clinicianName,
        confidence: result.confidence,
      },
      result,
    };
  }

  return {
    decision: {
      kind: "accept",
      clinicianId: result.clinicianId,
      clinicianName,
    },
    result,
  };
}

// ─── Aggregation buckets ────────────────────────────────────────────────────

export interface MatchAggregator {
  unmatched: Map<string, number>;
  ambiguous: Map<string, { rowCount: number; alternatives: ClinicianMatchAlternative[] }>;
  fuzzy: Map<
    string,
    { matchedTo: { id: string; name: string }; confidence: number; rowCount: number }
  >;
}

export function newAggregator(): MatchAggregator {
  return {
    unmatched: new Map(),
    ambiguous: new Map(),
    fuzzy: new Map(),
  };
}

export function recordDecision(
  agg: MatchAggregator,
  practitionerName: string,
  decision: RowDecision
): void {
  if (decision.kind === "skip") {
    agg.unmatched.set(
      practitionerName,
      (agg.unmatched.get(practitionerName) ?? 0) + 1
    );
    return;
  }

  if (decision.kind === "ambiguous") {
    const existing = agg.ambiguous.get(practitionerName);
    if (existing) {
      existing.rowCount++;
    } else {
      agg.ambiguous.set(practitionerName, {
        rowCount: 1,
        alternatives: decision.alternatives,
      });
    }
    return;
  }

  if (decision.kind === "fuzzy_accept") {
    const existing = agg.fuzzy.get(practitionerName);
    if (existing) {
      existing.rowCount++;
    } else {
      agg.fuzzy.set(practitionerName, {
        matchedTo: { id: decision.clinicianId, name: decision.clinicianName },
        confidence: decision.confidence,
        rowCount: 1,
      });
    }
  }
}

export function flattenAggregator(agg: MatchAggregator): {
  unmatchedClinicians: Array<{ name: string; rowCount: number }>;
  ambiguousClinicians: Array<{
    name: string;
    rowCount: number;
    alternatives: ClinicianMatchAlternative[];
  }>;
  fuzzyMatchedClinicians: Array<{
    csvName: string;
    matchedTo: { id: string; name: string };
    confidence: number;
    rowCount: number;
  }>;
} {
  return {
    unmatchedClinicians: Array.from(agg.unmatched.entries()).map(([name, rowCount]) => ({
      name,
      rowCount,
    })),
    ambiguousClinicians: Array.from(agg.ambiguous.entries()).map(
      ([name, { rowCount, alternatives }]) => ({ name, rowCount, alternatives })
    ),
    fuzzyMatchedClinicians: Array.from(agg.fuzzy.entries()).map(
      ([csvName, { matchedTo, confidence, rowCount }]) => ({
        csvName,
        matchedTo,
        confidence,
        rowCount,
      })
    ),
  };
}
