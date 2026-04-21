/**
 * Illustrative session rate (£65) used ONLY for client-side benchmark copy
 * in `clinical-benchmarks.ts` ("a clinician at 3.0 yields £260 — a gap of £65/patient").
 *
 * DO NOT use this as a fallback in server-side pipeline code — the canonical
 * rate is `clinics/{clinicId}.sessionPricePence` loaded via
 * `loadSessionRate()` in `src/lib/intelligence/load-session-rate.ts`, which
 * returns `{ rate: null, source: "missing" }` when unconfigured rather than
 * silently substituting this value. See INTELLIGENCE_AUDIT.md issue 2.
 */
export const SESSION_RATE_PENCE = 6500;
