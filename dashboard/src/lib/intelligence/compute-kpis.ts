/**
 * KPI projection engine.
 *
 * Reads the latest `metrics_weekly` aggregates (clinicianId === "all") plus
 * `reviews` and projects them into a read-optimised `kpis/*` collection that
 * the dashboard subscribes to.
 *
 * This is a LAYER on top of `metrics_weekly` - not a replacement. All weekly
 * number generation stays in `compute-weekly.ts`.
 *
 * On threshold crossings (status === 'danger'), emits dedupe-safe events to
 * `events/*` for downstream consumers (Pulse sequences, digest email, etc.).
 *
 * P0-10: NPS is computed ONLY from true 0-10 nps_sms responses.
 * P0-11: 1-5 star sentiment is a SEPARATE average-star-rating metric.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { WeeklyStats, Review, ClinicTargets } from "@/types";
import type {
  DataQualityIssue,
  KpiDoc,
  KpiEvent,
  KpiId,
  KpiStatus,
  KpiThresholds,
} from "@/types/kpi";
import { KPI_IDS } from "@/types/kpi";

// ─── Result ──────────────────────────────────────────────────────────────────

export interface ComputeKpisResult {
  clinicId: string;
  written: number;
  events: number;
  lastComputedKpis: KpiId[];
  dataQualityIssues: DataQualityIssue[];
}

// ─── Reference targets (external benchmarks — NOT the clinic's own goals) ────
// Used ONLY when the clinic has not configured a target for a given KPI.
// Always surfaced with the label "reference target" so they are never
// mistaken for the clinic's own benchmark.

export const REFERENCE_TARGETS = {
  /** UK PPB 2026 median: £68/session = 6800p. Sourced externally. */
  revenuePerSessionPence: 6800,
  /** Conservative service-industry NPS reference point. */
  npsTarget: 50,
  /** Industry reference: ~5 Google reviews per 100 appointments. */
  reviewConversionTarget: 0.05,
  /** Star-rating reference for private healthcare. */
  averageStarRatingTarget: 4.5,
  /** Follow-up rate reference (sessions per initial assessment). */
  followUpRate: 4.0,
  /** HEP compliance reference ratio. */
  hepRate: 0.85,
  /** Utilisation reference ratio. */
  utilisationRate: 0.75,
  /** DNA rate reference ratio (lower is better). */
  dnaRate: 0.06,
  /** Label for display — always "reference target", never "peer/median data". */
  _label: "reference target" as const,
} as const;

// ─── RAG thresholds (operational — not peer benchmarks) ──────────────────────
// These mirror the RAG logic already in the clinician table (CliniciansTable.tsx)
// and in `clinical-benchmarks.ts`. Kept co-located with the KPI IDs for clarity.

interface KpiConfig {
  id: KpiId;
  higherIsBetter: boolean;
  thresholds: KpiThresholds;
}

const KPI_CONFIG: Record<KpiId, KpiConfig> = {
  "follow-up-rate": {
    id: "follow-up-rate",
    higherIsBetter: true,
    thresholds: { ok: 4.0, warn: 3.0 },
  },
  "hep-compliance": {
    id: "hep-compliance",
    higherIsBetter: true,
    thresholds: { ok: 0.85, warn: 0.65 },
  },
  utilisation: {
    id: "utilisation",
    higherIsBetter: true,
    thresholds: { ok: 0.75, warn: 0.65 },
  },
  "dna-rate": {
    id: "dna-rate",
    higherIsBetter: false,
    thresholds: { ok: 0.06, warn: 0.10 },
  },
  "revenue-per-session": {
    id: "revenue-per-session",
    higherIsBetter: true,
    thresholds: { ok: 6800, warn: 5500 },
  },
  nps: {
    id: "nps",
    higherIsBetter: true,
    thresholds: { ok: 70, warn: 40 },
  },
  "google-review-conversion": {
    id: "google-review-conversion",
    higherIsBetter: true,
    thresholds: { ok: 0.05, warn: 0.02 },
  },
  "average-star-rating": {
    id: "average-star-rating",
    higherIsBetter: true,
    thresholds: { ok: 4.5, warn: 4.0 },
  },
};

/**
 * Resolve the target value for a KPI from clinic config.
 * Falls back to the labelled REFERENCE_TARGETS constant when the clinic has
 * not configured the target. The fallback is never presented silently as the
 * clinic's own benchmark — callers should surface REFERENCE_TARGETS._label
 * alongside any fallback value.
 *
 * Exported for unit testing.
 */
export function resolveKpiTarget(
  kpiId: KpiId,
  targets: Partial<ClinicTargets> | undefined
): number {
  return resolveKpiTargetWithFlag(kpiId, targets).target;
}

/**
 * Resolve the target value for a KPI from clinic config, also returning a flag
 * indicating whether the value came from the REFERENCE_TARGETS fallback.
 *
 * `targetIsReference` is true when the clinic has NOT configured the target;
 * the UI must render a qualifier (e.g. "ref. target") to prevent a clinic owner
 * from reading an external reference benchmark as their own goal.
 *
 * Exported for unit testing.
 */
export function resolveKpiTargetWithFlag(
  kpiId: KpiId,
  targets: Partial<ClinicTargets> | undefined
): { target: number; targetIsReference: boolean } {
  switch (kpiId) {
    case "revenue-per-session": {
      const clinic = targets?.revenuePerSessionPence;
      return clinic != null
        ? { target: clinic, targetIsReference: false }
        : { target: REFERENCE_TARGETS.revenuePerSessionPence, targetIsReference: true };
    }
    case "nps": {
      const clinic = targets?.npsTarget;
      return clinic != null
        ? { target: clinic, targetIsReference: false }
        : { target: REFERENCE_TARGETS.npsTarget, targetIsReference: true };
    }
    case "google-review-conversion": {
      const clinic = targets?.reviewConversionTarget;
      return clinic != null
        ? { target: clinic, targetIsReference: false }
        : { target: REFERENCE_TARGETS.reviewConversionTarget, targetIsReference: true };
    }
    case "average-star-rating": {
      const clinic = targets?.averageStarRatingTarget;
      return clinic != null
        ? { target: clinic, targetIsReference: false }
        : { target: REFERENCE_TARGETS.averageStarRatingTarget, targetIsReference: true };
    }
    case "follow-up-rate": {
      const clinic = targets?.followUpRate;
      return clinic != null
        ? { target: clinic, targetIsReference: false }
        : { target: REFERENCE_TARGETS.followUpRate, targetIsReference: true };
    }
    case "hep-compliance": {
      const raw = targets?.hepRate;
      if (typeof raw === "number") {
        // Normalise percent-scaled values (e.g. 85 stored as 85 not 0.85).
        return { target: raw > 1 ? raw / 100 : raw, targetIsReference: false };
      }
      return { target: REFERENCE_TARGETS.hepRate, targetIsReference: true };
    }
    case "utilisation": {
      const clinic = targets?.utilisationRate;
      return clinic != null
        ? { target: clinic, targetIsReference: false }
        : { target: REFERENCE_TARGETS.utilisationRate, targetIsReference: true };
    }
    case "dna-rate": {
      const clinic = targets?.dnaRate;
      return clinic != null
        ? { target: clinic, targetIsReference: false }
        : { target: REFERENCE_TARGETS.dnaRate, targetIsReference: true };
    }
  }
}

/**
 * Evaluate the RAG status for a KPI value against its operational thresholds.
 *
 * Exported for unit testing.
 */
export function evaluateKpiStatus(kpiId: KpiId, value: number): KpiStatus {
  return evaluateStatus(value, KPI_CONFIG[kpiId]);
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function computeKPIs(
  db: Firestore,
  clinicId: string
): Promise<ComputeKpisResult> {
  const runStartedAt = new Date().toISOString();
  const dataQualityIssues: DataQualityIssue[] = [];

  // Load last 8 "all" weekly stats — current + 7 prior for trend.
  const metricsSnap = await db
    .collection(`clinics/${clinicId}/metrics_weekly`)
    .where("clinicianId", "==", "all")
    .orderBy("weekStart", "desc")
    .limit(8)
    .get();

  if (metricsSnap.empty) {
    dataQualityIssues.push({
      code: "NO_METRICS",
      message: `metrics_weekly has no 'all' aggregate docs for clinic ${clinicId}`,
    });
    return {
      clinicId,
      written: 0,
      events: 0,
      lastComputedKpis: [],
      dataQualityIssues,
    };
  }

  const allStats = metricsSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<WeeklyStats, "id">) })
  );
  const current = allStats[0];
  const priorWeeks = allStats.slice(1); // most-recent-first, so these are older weeks

  // Load clinic doc for targets.
  const clinicDoc = await db.doc(`clinics/${clinicId}`).get();
  const clinicData = clinicDoc.data() ?? {};
  // resolveKpiTarget handles per-KPI normalisation (e.g. hepRate percent vs ratio).
  const targets = (clinicData.targets ?? {}) as Partial<ClinicTargets>;

  // Load reviews (last 200 — scoped to what we need for NPS + review-per-session calc).
  const reviewsSnap = await db
    .collection(`clinics/${clinicId}/reviews`)
    .orderBy("date", "desc")
    .limit(200)
    .get();
  const reviews = reviewsSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Review, "id">) })
  );

  // Compute each KPI value.
  // P0-10: NPS uses ONLY nps_sms 0-10 responses via computeRollingNpsOnly.
  // P0-11: Star sentiment uses ONLY non-nps_sms reviews via computeRollingAverageStarRating.
  const kpiValues: Record<KpiId, number | null> = {
    "follow-up-rate": current.followUpRate ?? null,
    "hep-compliance":
      (current.hepComplianceRate as number | undefined) ??
      (current.hepRate as number | undefined) ??
      null,
    utilisation: current.utilisationRate ?? null,
    "dna-rate": current.dnaRate ?? null,
    "revenue-per-session": current.revenuePerSessionPence ?? null,
    nps: computeRollingNpsOnly(reviews, 90),
    "google-review-conversion": computeReviewConversion(reviews, allStats, 90),
    "average-star-rating": computeRollingAverageStarRating(reviews, 90),
  };

  // Build trend arrays (one per KPI, newest-first among prior weeks).
  const trends: Record<KpiId, number[]> = {
    "follow-up-rate": priorWeeks.map((w) => w.followUpRate ?? 0),
    "hep-compliance": priorWeeks.map(
      (w) => (w.hepComplianceRate as number | undefined) ?? (w.hepRate as number | undefined) ?? 0
    ),
    utilisation: priorWeeks.map((w) => w.utilisationRate ?? 0),
    "dna-rate": priorWeeks.map((w) => w.dnaRate ?? 0),
    "revenue-per-session": priorWeeks.map((w) => w.revenuePerSessionPence ?? 0),
    nps: priorWeeks.map((w) => (w.npsScore as number | undefined) ?? 0),
    // Review conversion and average-star-rating don't have clean per-week projections
    // from metrics_weekly - leave trends empty until a dedicated trend rollup exists.
    "google-review-conversion": [],
    "average-star-rating": [],
  };

  // Project each KPI + collect threshold events.
  const kpisRef = db.collection(`clinics/${clinicId}/kpis`);
  const eventsRef = db.collection(`clinics/${clinicId}/events`);
  const written: KpiId[] = [];
  let eventsEmitted = 0;

  for (const kpiId of KPI_IDS) {
    const config = KPI_CONFIG[kpiId];
    const value = kpiValues[kpiId];

    if (value === null || !Number.isFinite(value)) {
      dataQualityIssues.push({
        code: "KPI_MISSING",
        message: `KPI ${kpiId} has no value for weekStart ${current.weekStart}`,
        kpiId,
      });
      continue;
    }

    const { target, targetIsReference } = resolveKpiTargetWithFlag(kpiId, targets);
    const status = evaluateStatus(value, config);

    const doc: KpiDoc = {
      kpiId,
      value,
      target,
      targetIsReference,
      status,
      trend: trends[kpiId] ?? [],
      window: { type: "weekly", weekStart: current.weekStart },
      threshold: config.thresholds,
      higherIsBetter: config.higherIsBetter,
      computedAt: runStartedAt,
      sourceDocId: current.id,
    };

    await kpisRef.doc(kpiId).set(doc, { merge: true });
    written.push(kpiId);

    if (status === "danger") {
      const emitted = await maybeEmitEvent(
        eventsRef,
        kpiId,
        value,
        target,
        current.weekStart,
        runStartedAt
      );
      if (emitted) eventsEmitted += 1;
    }
  }

  return {
    clinicId,
    written: written.length,
    events: eventsEmitted,
    lastComputedKpis: written,
    dataQualityIssues,
  };
}

// ─── Threshold Evaluation ────────────────────────────────────────────────────

function evaluateStatus(value: number, config: KpiConfig): KpiStatus {
  const { thresholds, higherIsBetter } = config;
  if (higherIsBetter) {
    if (value >= thresholds.ok) return "ok";
    if (value >= thresholds.warn) return "warn";
    return "danger";
  }
  if (value <= thresholds.ok) return "ok";
  if (value <= thresholds.warn) return "warn";
  return "danger";
}

// ─── Event Emission (dedupe-safe) ────────────────────────────────────────────

async function maybeEmitEvent(
  eventsRef: FirebaseFirestore.CollectionReference,
  kpiId: KpiId,
  value: number,
  target: number,
  weekStart: string,
  now: string
): Promise<boolean> {
  // Dedup: skip if an unconsumed event for the same kpiId + weekStart already exists.
  const existing = await eventsRef
    .where("kpiId", "==", kpiId)
    .where("weekStart", "==", weekStart)
    .where("type", "==", "KPI_THRESHOLD_CROSSED")
    .limit(5)
    .get();

  for (const doc of existing.docs) {
    const data = doc.data();
    const consumed = (data.consumedBy as string[] | undefined) ?? [];
    if (consumed.length === 0) {
      // An open (unconsumed) event for this kpi+week already exists — don't re-emit.
      return false;
    }
  }

  const event: KpiEvent = {
    type: "KPI_THRESHOLD_CROSSED",
    kpiId,
    severity: "danger",
    value,
    target,
    weekStart,
    createdAt: now,
    consumedBy: [],
  };
  await eventsRef.add(event);
  return true;
}

/**
 * Compute NPS from the last N days of `reviews`.
 *
 * P0-10: Uses ONLY true 0-10 nps_sms responses. Standard NPS categories:
 *   promoters  = 9-10
 *   passives   = 7-8
 *   detractors = 0-6
 *
 * Returns null when no nps_sms reviews exist in the window (not zero - null
 * signals "no data" so callers can show an empty state rather than a false 0).
 *
 * Exported for unit testing.
 */
export function computeRollingNpsOnly(reviews: Review[], windowDays: number): number | null {
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);
  const windowed = reviews.filter((r) => r.platform === "nps_sms" && r.date >= cutoff);
  if (windowed.length === 0) return null;

  let promoters = 0;
  let detractors = 0;

  for (const r of windowed) {
    if (r.rating >= 9) promoters++;
    else if (r.rating <= 6) detractors++;
    // 7-8 = passives: neither promoter nor detractor
  }

  return Math.round(((promoters - detractors) / windowed.length) * 100);
}

/**
 * Compute average star rating from the last N days of platform reviews (1-5 scale).
 *
 * P0-11: Excludes nps_sms responses (0-10 scale) - those are a different metric.
 * Only google / trustpilot / etc. platform reviews with 1-5 star ratings count.
 *
 * Returns null when no star reviews exist in the window.
 *
 * Exported for unit testing.
 */
export function computeRollingAverageStarRating(reviews: Review[], windowDays: number): number | null {
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);
  const windowed = reviews.filter((r) => r.platform !== "nps_sms" && r.date >= cutoff);
  if (windowed.length === 0) return null;

  const sum = windowed.reduce((acc, r) => acc + r.rating, 0);
  return Math.round((sum / windowed.length) * 10) / 10;
}

/**
 * Rough "review conversion": Google reviews per completed appointment, windowed.
 * Uses `appointmentsTotal` aggregated from the last N weeks of `all` stats.
 * Not perfect — the true conversion would require per-patient review attribution —
 * but it's directionally correct and flags clinics under-asking for reviews.
 */
function computeReviewConversion(
  reviews: Review[],
  allStats: Array<WeeklyStats & { id: string }>,
  windowDays: number
): number | null {
  const cutoff = new Date(Date.now() - windowDays * 86400_000)
    .toISOString()
    .slice(0, 10);
  const googleReviews = reviews.filter(
    (r) => r.platform === "google" && r.date >= cutoff
  ).length;

  const windowedWeeks = allStats.filter((s) => s.weekStart >= cutoff);
  const totalAppts = windowedWeeks.reduce(
    (sum, s) => sum + (s.appointmentsTotal ?? 0),
    0
  );

  if (totalAppts === 0) return null;
  return googleReviews / totalAppts;
}
