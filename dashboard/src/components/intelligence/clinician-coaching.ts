// ─── Clinician coaching signals ─────────────────────────────────────────────
//
// Turns the per-clinician trend arrays already computed in `useIntelligenceData`
// (rebookTrend, utilisationTrend, dnaTrend, hepTrend, revPerSessionTrend) into
// actionable, clinically-framed coaching signals — the same analytical bar as
// the Clinician Performance drill-down, applied to direction and meaning rather
// than a bare number.
//
// Strict no-fabrication rule: every field here is derived only from values
// present on `ClinicianKpiRow` plus the labelled REFERENCE_TARGETS constant.
// No invented counts, no synthetic baselines. Where a series is too short to
// support a claim ("N weeks running"), the claim is not made.
//
// Positioning (CLAUDE.md): surface gaps so clinicians can be coached, never
// blame. Strengths are surfaced too, so the panel reads as coaching, not audit.

import { REFERENCE_TARGETS } from "@/lib/intelligence/compute-kpis";
import type { ClinicianKpiRow } from "@/hooks/useDemoIntelligence";

export type CoachingSeverity = "critical" | "watch" | "strong";

export interface CoachingSignal {
  /** Stable key for React lists. */
  id: string;
  severity: CoachingSeverity;
  /** Short metric label, e.g. "Follow-up rate". */
  metric: string;
  /** One-line headline — the gap or the win. */
  headline: string;
  /** Supporting clinical/revenue context. */
  detail: string;
}

// RAG thresholds mirror the existing Clinician Performance table exactly so the
// coaching layer never contradicts the colour a row already shows.
const T = {
  followUp: { target: REFERENCE_TARGETS.followUpRate, watch: 3.5, critical: 2.5 },
  utilisation: { target: 0.85, watch: 0.85, critical: 0.7 },
  dna: { target: 0.04, watch: 0.04, critical: 0.08 },
  hep: { target: 0.8, watch: 0.8, critical: 0.5 },
} as const;

/** Finite values only, oldest → newest. */
function clean(arr: number[]): number[] {
  return (arr ?? []).filter((v) => Number.isFinite(v));
}

/** Count of consecutive trailing points satisfying `pred` (looking back from newest). */
function trailingRun(series: number[], pred: (v: number) => boolean): number {
  let n = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (pred(series[i])) n++;
    else break;
  }
  return n;
}

/** Consecutive monotonic moves at the tail. dir>0 = rising, dir<0 = falling. */
function trailingMonotonic(series: number[], dir: 1 | -1): number {
  let n = 0;
  for (let i = series.length - 1; i > 0; i--) {
    const delta = series[i] - series[i - 1];
    if (dir > 0 ? delta > 0 : delta < 0) n++;
    else break;
  }
  return n;
}

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * Derive coaching signals for one clinician, ranked critical → watch → strong.
 * Returns at most a handful of high-signal items; quiet metrics stay quiet.
 */
export function deriveCoachingSignals(row: ClinicianKpiRow): CoachingSignal[] {
  const out: CoachingSignal[] = [];

  // ── Follow-up rate (revenue lever: sessions per initial assessment) ────────
  const fu = clean(row.rebookTrend);
  if (fu.length > 0) {
    const latest = row.rebookRate;
    const baseline = fu[0];
    const falling = trailingMonotonic(fu, -1);
    // £ of unrealised session revenue per new patient = gap × this clinician's
    // own rev/session. Both factors are real; the product is grounded.
    const gap = Math.max(0, T.followUp.target - latest);
    const revPer = row.revenuePerSessionPence;
    const revContext =
      gap > 0.1 && revPer > 0
        ? ` At ${pounds(revPer)}/session that is ~${pounds(Math.round(gap * revPer))} of unrealised revenue per new patient.`
        : "";

    if (latest < T.followUp.critical) {
      out.push({
        id: "follow-up",
        severity: "critical",
        metric: "Follow-up rate",
        headline: `${latest.toFixed(1)}x — well below the ${T.followUp.target.toFixed(1)} reference`,
        detail: `Initial assessments are not progressing into a course of care. Coach toward booking the next session at the point of care.${revContext}`,
      });
    } else if (latest < T.followUp.watch || (falling >= 2 && latest < baseline)) {
      const trendNote =
        falling >= 2
          ? `Down ${falling} weeks running (from ${baseline.toFixed(1)}x).`
          : `Below the ${T.followUp.target.toFixed(1)} reference.`;
      out.push({
        id: "follow-up",
        severity: "watch",
        metric: "Follow-up rate",
        headline: `${latest.toFixed(1)}x and softening`,
        detail: `${trendNote} Each recovered follow-up is direct session revenue.${revContext}`,
      });
    } else if (latest >= T.followUp.target && latest >= baseline && fu.length >= 3) {
      out.push({
        id: "follow-up",
        severity: "strong",
        metric: "Follow-up rate",
        headline: `${latest.toFixed(1)}x — at or above reference`,
        detail: `Consistently converting assessments into care. Worth modelling for the rest of the team.`,
      });
    }
  }

  // ── Utilisation (diary fill) ───────────────────────────────────────────────
  const util = clean(row.utilisationTrend);
  if (util.length > 0) {
    const latest = row.utilisationRate;
    const belowRun = trailingRun(util, (v) => v < T.utilisation.target);
    if (latest < T.utilisation.critical) {
      out.push({
        id: "utilisation",
        severity: "critical",
        metric: "Utilisation",
        headline: `${Math.round(latest * 100)}% of available slots filled`,
        detail: `Empty diary slots are unrecoverable revenue. Review template hours against demand, or open capacity to waiting-list patients.`,
      });
    } else if (belowRun >= 2) {
      out.push({
        id: "utilisation",
        severity: "watch",
        metric: "Utilisation",
        headline: `Below 85% for ${belowRun} weeks running`,
        detail: `Currently ${Math.round(latest * 100)}%. Sustained under-fill points to a scheduling or rebooking gap rather than a one-off quiet week.`,
      });
    } else if (latest >= T.utilisation.target && util.length >= 3) {
      out.push({
        id: "utilisation",
        severity: "strong",
        metric: "Utilisation",
        headline: `${Math.round(latest * 100)}% diary fill`,
        detail: `Near-full diary held steady. Protect this capacity before adding new referral sources.`,
      });
    }
  }

  // ── DNA rate (lower is better) ─────────────────────────────────────────────
  const dna = clean(row.dnaTrend);
  if (dna.length > 0) {
    const latest = row.dnaRate;
    const rising = trailingMonotonic(dna, 1);
    if (latest > T.dna.critical) {
      out.push({
        id: "dna",
        severity: "critical",
        metric: "DNA rate",
        headline: `${Math.round(latest * 100)}% no-show rate`,
        detail: `Above the ${Math.round(T.dna.critical * 100)}% threshold. Each DNA is a paid slot lost — tighten reminders and same-day confirmation for this clinician's list.`,
      });
    } else if (rising >= 2 && latest > T.dna.target) {
      out.push({
        id: "dna",
        severity: "watch",
        metric: "DNA rate",
        headline: `Climbing ${rising} weeks running to ${Math.round(latest * 100)}%`,
        detail: `Direction matters more than the level here — intervene before it settles in.`,
      });
    } else if (latest <= T.dna.target && dna.length >= 3) {
      out.push({
        id: "dna",
        severity: "strong",
        metric: "DNA rate",
        headline: `${Math.round(latest * 100)}% no-shows held low`,
        detail: `Reliable attendance keeps the diary working as planned.`,
      });
    }
  }

  // ── HEP compliance ─────────────────────────────────────────────────────────
  const hep = clean(row.hepTrend);
  if (hep.length > 0) {
    const latest = row.hepComplianceRate;
    const falling = trailingMonotonic(hep, -1);
    if (latest < T.hep.critical) {
      out.push({
        id: "hep",
        severity: "critical",
        metric: "HEP compliance",
        headline: `${Math.round(latest * 100)}% of patients given a programme`,
        detail: `Under half are leaving with a home exercise plan. Programme assignment correlates with outcomes and retention — make it a standing step in the session.`,
      });
    } else if (latest < T.hep.watch || (falling >= 2 && latest < hep[0])) {
      out.push({
        id: "hep",
        severity: "watch",
        metric: "HEP compliance",
        headline: `${Math.round(latest * 100)}% — below the 80% reference`,
        detail: falling >= 2
          ? `Slipped ${falling} weeks running. A quick prompt at discharge usually recovers this fast.`
          : `Closing the gap to 80% lifts adherence and the follow-up rate together.`,
      });
    } else if (latest >= T.hep.target && hep.length >= 3) {
      out.push({
        id: "hep",
        severity: "strong",
        metric: "HEP compliance",
        headline: `${Math.round(latest * 100)}% programme assignment`,
        detail: `Strong adherence groundwork — patients leaving with a plan stick with care.`,
      });
    }
  }

  // ── Revenue per session (real £ movement) ──────────────────────────────────
  const rev = clean(row.revPerSessionTrend);
  if (rev.length >= 2) {
    const first = rev[0];
    const last = rev[rev.length - 1];
    const delta = last - first;
    if (delta <= -100) {
      out.push({
        id: "rev",
        severity: "watch",
        metric: "Rev / session",
        headline: `Down ${pounds(Math.abs(delta))} across the window`,
        detail: `From ${pounds(first)} to ${pounds(last)}. Check appointment-type mix — a drift toward shorter or lower-value session types erodes yield even at full diary.`,
      });
    } else if (delta >= 100) {
      out.push({
        id: "rev",
        severity: "strong",
        metric: "Rev / session",
        headline: `Up ${pounds(delta)} across the window`,
        detail: `From ${pounds(first)} to ${pounds(last)} — yield per session is trending the right way.`,
      });
    }
  }

  const rank: Record<CoachingSeverity, number> = { critical: 0, watch: 1, strong: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Highest-priority severity for the collapsed-row pill (critical > watch > strong). */
export function topSeverity(row: ClinicianKpiRow): CoachingSeverity | null {
  const signals = deriveCoachingSignals(row);
  if (signals.length === 0) return null;
  if (signals.some((s) => s.severity === "critical")) return "critical";
  if (signals.some((s) => s.severity === "watch")) return "watch";
  return "strong";
}

/** Counts by severity, for the pill label and the panel summary. */
export function severityCounts(signals: CoachingSignal[]): Record<CoachingSeverity, number> {
  return signals.reduce(
    (acc, s) => {
      acc[s.severity] += 1;
      return acc;
    },
    { critical: 0, watch: 0, strong: 0 } as Record<CoachingSeverity, number>,
  );
}
