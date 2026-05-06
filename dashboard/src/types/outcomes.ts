export type OutcomeMeasureType =
  | "nprs"
  | "psfs"
  | "quickdash"
  | "odi"
  | "ndi"
  | "oxford_knee"
  | "oxford_hip"
  | "koos"
  | "hoos"
  | "visa_a"
  | "visa_p";

export interface OutcomeScore {
  id: string;
  patientId: string;
  clinicianId: string;
  appointmentId?: string;
  measureType: OutcomeMeasureType;
  score: number;
  subscores?: Record<string, number>;
  recordedAt: string;
  recordedBy: string;
}
