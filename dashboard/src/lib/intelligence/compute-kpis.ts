/**
 * KPI projection engine.
 *
 * Reads the latest `metrics_weekly` aggregates (clinicianId === "all") plus
 * `reviews` and projects them into a read-optimised `kpis/*` collection that
 * the dashboard subscribes to.
 *
 * This is a LAYER on top of `metrics_weekly` — not a replacement. All weekly
 * number generation stays in `compute-weekly.ts`.
 *
 * On threshold crossings (status === 'danger'), emits dedupe-safe events to
 * `events/*` for downstream consumers (Pulse sequences, digest email, etc.).
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

// ─── Hardcoded RAG thresholds (not peer benchmarks — operational thresholds) ─
// These mirror the RAG logic already in the clinician table (CliniciansTable.tsx)
// and in `clinical-benchmarks.ts`. Kept co-located with the KPI IDs for clarity.

interface KpiConfig {
  id: KpiId;
  higherIsBetter: boolean;
  thresholds: KpiThresholds;
  /** Where to read the target from `clinicData.targets`, or a hardcoded fallback. */
  targetFrom: (t: Partial<ClinicTargets> | undefined) => number;
}

const KPI_CONFIG: Record<KpiId, KpiConfig> = {
  "follow-up-rate": {
    id: "follow-up-rate",
    higherIsBetter: true,
    thresholds: { ok: 4.0, warn: 3.0 },
    targetFrom: (t) => t?.followUpRate ?? 4.0,
  },
  "hep-compliance": {
    id: "hep-compliance",
    higherIsBetter: true,
    thresholds: { ok: 0.85, warn: 0.65 },
    targetFrom: (t) => t?.hepRate ?? 0.85,
  },
  utilisation: {
    id: "utilisation",
    higherIsBetter: true,
    thresholds: { ok: 0.75, warn: 0.65 },
    targetFrom: (t) => t?.utilisationRate ?? 0.75,
  },
  "dna-rate": {
    id: "dna-rate",
    higherIsBetter: false,
    thresholds: { ok: 0.06, warn: 0.10 },
    targetFrom: (t) => t?.dnaRate ?? 0.06,
  },
  "revenue-per-session": {
    id: "revenue-per-session",
    higherIsBetter: true,
    thresholds: { ok: 6800, warn: 5500 },
    // No configurable target today — uses UK PPB 2026 median (£68 = 6800p) as target.
    targetFrom: () => 6800,
  },
  nps: {
    id: "nps",
    higherIsBetter: true,
    thresholds: { ok: 70, warn: 40 },
    targetFrom: () => 50,
  },
  "google-review-conversion": {
    id: "google-review-conversion",
    higherIsBetter: true,
    thresholds: { ok: 0.05, warn: 0.02 },
    targetFrom: () => 0.05,
  },
};

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
  const targets = normaliseTargets(clinicData.targets as Partial<ClinicTargets> | undefined);

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
  const kpiValues: Record<KpiId, number | null> = {
    "follow-up-rate": current.followUpRate ?? null,
    "hep-compliance":
      (current.hepComplianceRate as number | undefined) ??
      (current.hepRate as number | undefined) ??
      null,
    utilisation: current.utilisationRate ?? null,
    "dna-rate": current.dnaRate ?? null,
    "revenue-per-session": current.revenuePerSessionPence ?? null,
    nps: computeRollingNps(reviews, 90),
    "google-review-conversion": computeReviewConversion(reviews, allStats, 90),
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
    // Review conversion doesn't have a clean per-week projection from metrics_weekly —
    // leave trend empty for this KPI until a dedicated trend rollup exists.
    "google-review-conversion": [],
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

    const target = config.targetFrom(targets);
    const status = evaluateStatus(value, config);

    const doc: KpiDoc = {
      kpiId,
      value,
      target,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Coerce potentially-percent-scaled targets into 0..1 unit-consistent values. */
function normaliseTargets(
  raw: Partial<ClinicTargets> | undefined
): Partial<ClinicTargets> {
  if (!raw) return {};
  const out: Partial<ClinicTargets> = { ...raw };
  // `hepRate` is sometimes stored as 85 (percent) vs 0.85 (ratio) — normalise.
  if (typeof out.hepRate === "number" && out.hepRate > 1) {
    out.hepRate = out.hepRate / 100;
  }
  return out;
}

/**
 * Compute NPS from the last N days of `reviews`.
 * Mirrors the logic in `useIntelligenceData.deriveNps` — 0-10 scale for nps_sms,
 * 1-5 star scale for platform reviews.
 */
function computeRollingNps(reviews: Review[], windowDays: number): number | null {
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const windowed = reviews.filter((r) => r.date >= cutoff);
  if (windowed.length === 0) return null;

  let promoters = 0;
  let detractors = 0;

  for (const r of windowed) {
    if (r.platform === "nps_sms") {
      if (r.rating >= 9) promoters++;
      else if (r.rating <= 6) detractors++;
    } else {
      if (r.rating >= 5) promoters++;
      else if (r.rating <= 3) detractors++;
    }
  }

  return Math.round(((promoters - detractors) / windowed.length) * 100);
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
