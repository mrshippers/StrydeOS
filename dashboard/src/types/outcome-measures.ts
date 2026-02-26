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
