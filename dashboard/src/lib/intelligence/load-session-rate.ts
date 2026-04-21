/**
 * Canonical session-rate loader for Intelligence pipeline code.
 *
 * Returns an explicit `{ rate, source }` tuple so callers can skip computation
 * and record a data-quality flag when the clinic hasn't configured a session
 * price, rather than silently substituting a hardcoded £65 fallback
 * (see INTELLIGENCE_AUDIT.md issue 2).
 */

import type { Firestore } from "firebase-admin/firestore";

export interface SessionRateLookup {
  /** Session price in pence, or `null` if the clinic has not configured one. */
  rate: number | null;
  /** `"clinic"` = loaded from `clinics/{clinicId}.sessionPricePence`; `"missing"` = not set. */
  source: "clinic" | "missing";
}

/**
 * Load the canonical session rate for a clinic from the clinic root document.
 *
 * Returns `{ rate: null, source: "missing" }` when the clinic has not configured
 * a session price. Callers are expected to skip revenue attribution for that
 * clinic and push a `SESSION_RATE_MISSING` entry into `computeState.dataQualityIssues[]`.
 */
export async function loadSessionRate(
  db: Firestore,
  clinicId: string
): Promise<SessionRateLookup> {
  const clinicDoc = await db.doc(`clinics/${clinicId}`).get();
  const data = clinicDoc.data();
  const raw = data?.sessionPricePence;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return { rate: raw, source: "clinic" };
  }
  return { rate: null, source: "missing" };
}
