import type { OutcomeMeasureType } from "./index";

export interface OutcomeMeasureDefinition {
  type: OutcomeMeasureType;
  name: string;
  shortName: string;
  minScore: number;
  maxScore: number;
  higherIsBetter: boolean;
  bodyRegion: string | null;
  description: string;
}

export const OUTCOME_MEASURES: OutcomeMeasureDefinition[] = [
  {
    type: "nprs",
    name: "Numeric Pain Rating Scale",
    shortName: "NPRS",
    minScore: 0,
    maxScore: 10,
    higherIsBetter: false,
    bodyRegion: null,
    description: "0-10 pain scale, used every session",
  },
  {
    type: "psfs",
    name: "Patient-Specific Functional Scale",
    shortName: "PSFS",
    minScore: 0,
    maxScore: 10,
    higherIsBetter: true,
    bodyRegion: null,
    description: "3 patient-defined activities scored 0-10",
  },
  {
    type: "quickdash",
    name: "Quick Disabilities of Arm, Shoulder & Hand",
    shortName: "QuickDASH",
    minScore: 0,
    maxScore: 100,
    higherIsBetter: false,
    bodyRegion: "upper_limb",
    description: "Upper limb functional outcome",
  },
  {
    type: "odi",
    name: "Oswestry Disability Index",
    shortName: "ODI",
    minScore: 0,
    maxScore: 100,
    higherIsBetter: false,
    bodyRegion: "low_back",
    description: "Low back pain functional disability",
  },
  {
    type: "ndi",
    name: "Neck Disability Index",
    shortName: "NDI",
    minScore: 0,
    maxScore: 100,
    higherIsBetter: false,
    bodyRegion: "neck",
    description: "Neck pain functional disability",
  },
  {
    type: "oxford_knee",
    name: "Oxford Knee Score",
    shortName: "OKS",
    minScore: 0,
    maxScore: 48,
    higherIsBetter: true,
    bodyRegion: "knee",
    description: "Knee joint function and pain assessment",
  },
  {
    type: "oxford_hip",
    name: "Oxford Hip Score",
    shortName: "OHS",
    minScore: 0,
    maxScore: 48,
    higherIsBetter: true,
    bodyRegion: "hip",
    description: "Hip joint function and pain assessment",
  },
  {
    type: "koos",
    name: "Knee Injury & Osteoarthritis Outcome Score",
    shortName: "KOOS",
    minScore: 0,
    maxScore: 100,
    higherIsBetter: true,
    bodyRegion: "knee",
    description: "Sports/surgical knee patients",
  },
  {
    type: "hoos",
    name: "Hip Disability & Osteoarthritis Outcome Score",
    shortName: "HOOS",
    minScore: 0,
    maxScore: 100,
    higherIsBetter: true,
    bodyRegion: "hip",
    description: "Hip function for active patients",
  },
  {
    type: "visa_a",
    name: "VISA-A",
    shortName: "VISA-A",
    minScore: 0,
    maxScore: 100,
    higherIsBetter: true,
    bodyRegion: "achilles",
    description: "Achilles tendinopathy severity and function",
  },
  {
    type: "visa_p",
    name: "VISA-P",
    shortName: "VISA-P",
    minScore: 0,
    maxScore: 100,
    higherIsBetter: true,
    bodyRegion: "patella",
    description: "Patellar tendinopathy severity and function",
  },
];

export const BODY_REGIONS = [
  { id: "upper_limb", label: "Upper Limb" },
  { id: "low_back", label: "Low Back" },
  { id: "neck", label: "Neck" },
  { id: "knee", label: "Knee" },
  { id: "hip", label: "Hip" },
  { id: "achilles", label: "Achilles" },
  { id: "patella", label: "Patella" },
] as const;

export function getMeasuresForRegion(
  region: string
): OutcomeMeasureDefinition[] {
  return OUTCOME_MEASURES.filter((m) => m.bodyRegion === region);
}

export function getUniversalMeasures(): OutcomeMeasureDefinition[] {
  return OUTCOME_MEASURES.filter((m) => m.bodyRegion === null);
}

/**
 * Minimal Clinically Important Difference (MCID) per outcome measure.
 * Sourced from published literature — these are the thresholds at which
 * a score change is considered clinically meaningful (not just noise).
 *
 * Used by the insight engine to fire OUTCOME_IMPROVEMENT events only when
 * a patient's improvement crosses the MCID threshold — avoiding false positives.
 */
export const OUTCOME_MCID: Record<string, number> = {
  nprs: 2,          // 2-point change on 0-10 scale (Farrar et al. 2001)
  psfs: 2,          // 2-point change on 0-10 scale (Stratford et al. 1995)
  quickdash: 8,     // 8-point change on 0-100 scale (Mintken et al. 2009)
  odi: 10,          // 10-point change on 0-100 scale (Ostelo et al. 2008)
  ndi: 7,           // 7-point change on 0-100 scale (Young et al. 2009)
  oxford_knee: 5,   // 5-point change on 0-48 scale (Beard et al. 2015)
  oxford_hip: 5,    // 5-point change on 0-48 scale (Beard et al. 2015)
  koos: 10,         // 10-point change on 0-100 scale (Roos & Lohmander 2003)
  hoos: 10,         // 10-point change on 0-100 scale (Roos & Lohmander 2003)
  visa_a: 12,       // 12-point change on 0-100 scale (Robinson et al. 2001)
  visa_p: 13,       // 13-point change on 0-100 scale (Hernandez-Sanchez et al. 2014)
};
