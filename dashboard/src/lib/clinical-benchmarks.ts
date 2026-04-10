/**
 * UK MSK Clinical Benchmarks for StrydeOS.
 *
 * Sources:
 * - UK Private Practice Barometer 2026 (715 UK clinic owners)
 * - HCPC Standards of Proficiency for Physiotherapists
 * - CSP (Chartered Society of Physiotherapy) clinical guidelines
 * - MACP (Manipulation Association of Chartered Physiotherapists)
 * - NICE CG177 (exercise as first-line intervention for MSK)
 *
 * Financial calculations use £65 blended session rate (UK median:
 * £74 initial assessment + £63 follow-up = ~£65 weighted average).
 */

import type { MetricStatus } from "@/types";
import { SESSION_RATE_PENCE } from "@/lib/constants";

export interface MetricBenchmark {
  key: string;
  label: string;
  definition: string;
  ownerExplainer: string;
  ukBenchmarkRange: string;
  thresholds: { green: string; amber: string; red: string };
  clinicalSignificance: string;
  financialSignificance: string;
  sources: string[];
}

export const BENCHMARKS: Record<string, MetricBenchmark> = {
  followUpRate: {
    key: "followUpRate",
    label: "Follow-Up Rate",
    definition:
      "Mean number of follow-up appointments booked per initial assessment. Measures patient retention through a treatment course.",
    ownerExplainer:
      "How many follow-up sessions each new patient books on average. Higher = patients are staying for the full treatment course.",
    ukBenchmarkRange: "4.0–5.5 (UK median 5.0 sessions per episode; top quartile 6+)",
    thresholds: {
      green: "≥ 4.0",
      amber: "3.0–3.9",
      red: "< 3.0",
    },
    clinicalSignificance:
      "Low FU rate indicates patients dropping off before reaching recovery milestones. HCPC Standard 6 requires practitioners to practise safely and effectively, which includes adequate treatment completion. Incomplete courses raise risk of re-injury, chronic pain development, and poor long-term outcomes.",
    financialSignificance:
      "Each missed FU = £65 lost. At target 4.0 FU/IA, revenue per patient journey = £65 (IA) + 4.0 × £65 = £325. A clinician at 3.0 yields £260 — a gap of £65/patient. With ~8 IAs/week, that's ~£520/week or ~£27,040/year unrealised revenue.",
    sources: ["UK Private Practice Barometer 2026", "HCPC Standard 6", "CSP MSK Pathway Guidance"],
  },

  hepCompliance: {
    key: "hepCompliance",
    label: "HEP Compliance",
    definition:
      "Percentage of patients with an active home exercise programme (HEP) assigned via their HEP provider. Proxy for NICE CG177 compliance.",
    ownerExplainer:
      "What proportion of your patients have been given a home exercise programme. Should be near-universal for MSK patients.",
    ukBenchmarkRange: ">90% (HCPC Standard 13; CSP Quality Assurance Framework mandates HEP for MSK patients)",
    thresholds: {
      green: "≥ 95%",
      amber: "85–94%",
      red: "< 85%",
    },
    clinicalSignificance:
      "Patients without HEP have 40–60% worse functional outcomes at 3 months (CSP evidence base). Non-provision breaches clinical governance expectations for private MSK practice and is inconsistent with NICE CG177 first-line exercise recommendations.",
    financialSignificance:
      "Better HEP compliance correlates with faster recovery, higher patient satisfaction (more referrals), and lower DNA rates. Indirect revenue uplift through improved retention and reduced churn risk.",
    sources: ["NICE CG177", "HCPC Standard 13", "CSP Quality Assurance Framework"],
  },

  nps: {
    key: "nps",
    label: "Net Promoter Score",
    definition:
      "Patient satisfaction metric (−100 to +100). Based on \"How likely are you to recommend this practice?\" scored 0–10. Promoters (9–10) minus Detractors (0–6) as a percentage.",
    ownerExplainer:
      "A single number that tells you whether patients would recommend you. Above 70 is excellent. Below 40 means something systemic needs fixing.",
    ukBenchmarkRange: "NHS avg ~40; private healthcare >50 good; >70 excellent",
    thresholds: {
      green: "≥ 70",
      amber: "40–69",
      red: "< 40",
    },
    clinicalSignificance:
      "NPS below 40 suggests systemic issues with patient experience — communication gaps, wait times, perceived treatment effectiveness. Correlates with complaint risk and potential regulatory scrutiny. HCPC Standards of Conduct require maintaining patient trust.",
    financialSignificance:
      "Each 10-point NPS increase correlates with ~15–20% increase in word-of-mouth referrals for private practices. This is the primary organic growth lever for private physiotherapy.",
    sources: ["HCPC Standards of Conduct", "Healthcare NPS benchmarking studies"],
  },

  courseCompletion: {
    key: "courseCompletion",
    label: "HEP Compliance",
    definition:
      "Percentage of patients who are assigned a home exercise programme (HEP) relative to patients seen. Measures whether clinicians are consistently prescribing structured self-management via their connected HEP provider.",
    ownerExplainer:
      "Are your clinicians giving patients something to do between sessions? If a patient leaves without a programme, they're relying entirely on in-clinic time — which slows recovery and weakens rebooking rationale. HEP compliance tells you who's prescribing and who isn't.",
    ukBenchmarkRange: "70–85% typical in private MSK using HEP software; >85% excellent",
    thresholds: {
      green: "≥ 80%",
      amber: "65–79%",
      red: "< 65%",
    },
    clinicalSignificance:
      "Patients with structured HEPs show faster functional recovery and higher satisfaction scores. HCPC Standard 8 (communicate effectively) supports duty to provide clear self-management guidance.",
    financialSignificance:
      "Clinicians with high HEP compliance see stronger follow-up rates — patients who engage with programmes between sessions are more likely to rebook. Directly correlated with revenue per clinician.",
    sources: ["CSP Quality Standards", "HCPC Standard 8"],
  },

  dnaRate: {
    key: "dnaRate",
    label: "DNA Rate",
    definition:
      "Percentage of scheduled appointments where the patient did not attend (Did Not Attend). Includes no-shows and same-day cancellations without rebooking.",
    ownerExplainer:
      "How often patients simply don't turn up. Each no-show is a £65 slot you can't fill. Below 6% is excellent; above 10% needs intervention.",
    ukBenchmarkRange: "≤6% with automation (UK benchmark); 7–10% typical without; >10% requires intervention",
    thresholds: {
      green: "≤ 6%",
      amber: "7–10%",
      red: "> 10%",
    },
    clinicalSignificance:
      "High DNA rate disrupts treatment continuity, delays recovery, and may indicate poor patient engagement or communication issues. HCPC expects clinicians to maintain therapeutic relationships that support attendance.",
    financialSignificance:
      "Each DNA = £65 lost with no replacement. A clinician with 25 appointments/week at 11% DNA loses ~3 slots = £195/week = £10,140/year. Reducing from 11% to 6% recovers ~£5,070/year per clinician.",
    sources: ["UK Private Practice Barometer 2026", "CSP private practice guidelines"],
  },

  caseload: {
    key: "caseload",
    label: "Caseload",
    definition:
      "Number of active (non-discharged) patients currently assigned to a clinician.",
    ownerExplainer:
      "How many patients each clinician is actively treating. Used for workload balancing — too many risks quality, too few means spare capacity.",
    ukBenchmarkRange: "15–25 active patients per clinician per week is sustainable; >30 risks quality deterioration",
    thresholds: {
      green: "15–25",
      amber: "26–30 or <15",
      red: ">30",
    },
    clinicalSignificance:
      "Overloaded clinicians risk burnout, reduced session quality, and missed clinical indicators. Underloaded clinicians may indicate scheduling or marketing inefficiency.",
    financialSignificance:
      "Context-dependent. Used for capacity planning rather than direct revenue attribution.",
    sources: ["CSP Workload Management Guidelines"],
  },
};

// ─── Threshold evaluation functions ─────────────────────────────────────────

export function getFollowUpBenchmarkStatus(rate: number): MetricStatus {
  if (rate >= 4.0) return "ok";
  if (rate >= 3.0) return "warn";
  return "danger";
}

export function getHepBenchmarkStatus(rate: number): MetricStatus {
  if (rate >= 0.95) return "ok";
  if (rate >= 0.85) return "warn";
  return "danger";
}

export function getNpsBenchmarkStatus(score: number): MetricStatus {
  if (score >= 70) return "ok";
  if (score >= 40) return "warn";
  return "danger";
}

export function getCourseCompletionBenchmarkStatus(rate: number): MetricStatus {
  if (rate >= 0.80) return "ok";
  if (rate >= 0.65) return "warn";
  return "danger";
}

export function getDnaBenchmarkStatus(rate: number): MetricStatus {
  if (rate <= 0.06) return "ok";
  if (rate <= 0.10) return "warn";
  return "danger";
}

// ─── Derived financial metrics ──────────────────────────────────────────────

export function revenuePerPatientJourneyPence(followUpRate: number): number {
  return Math.round((1 + followUpRate) * SESSION_RATE_PENCE);
}

export function projectedAnnualRevenuePence(
  revenuePerJourneyPence: number,
  initialAssessmentsPerWeek: number
): number {
  return revenuePerJourneyPence * initialAssessmentsPerWeek * 52;
}

export function dnaFinancialImpactWeeklyPence(
  dnaRate: number,
  scheduledAppointments: number
): number {
  return Math.round(dnaRate * scheduledAppointments * SESSION_RATE_PENCE);
}

export function revenueGapVsTargetWeeklyPence(
  currentFollowUpRate: number,
  targetFollowUpRate: number,
  initialAssessmentsPerWeek: number
): number {
  const currentRevenue = revenuePerPatientJourneyPence(currentFollowUpRate);
  const targetRevenue = revenuePerPatientJourneyPence(targetFollowUpRate);
  return (targetRevenue - currentRevenue) * initialAssessmentsPerWeek;
}
