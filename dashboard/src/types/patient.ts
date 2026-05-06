import type { ComplexitySignals } from "./heidi";

export type PreAuthStatus = "pending" | "confirmed" | "rejected" | "not_required";

export interface PreAuth {
  id: string;
  patientId: string;
  insurerName: string;
  preAuthCode: string;
  sessionsAuthorised: number;
  sessionsUsed: number;
  expiryDate?: string;
  excessAmountPence?: number;
  excessCollected?: boolean;
  status: PreAuthStatus;
  confirmedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientContact {
  email?: string;
  phone?: string;
}

export interface ReferralSource {
  type: string;
  name: string;
  externalId?: string;
}

// ─── Lifecycle & Risk ─────────────────────────────────────────────────────────

export type LifecycleState =
  | "NEW"         // sessionCount = 0
  | "ONBOARDING"  // sessionCount 1–3
  | "ACTIVE"      // sessionCount > 3, nextSessionDate present
  | "AT_RISK"     // riskScore >= 60, not discharged
  | "LAPSED"      // >14 days since last session, no future booking, not discharged
  | "RE_ENGAGED"  // was LAPSED/AT_RISK, new appointment booked within attribution window
  | "DISCHARGED"  // discharged = true
  | "CHURNED";    // LAPSED for 60+ days, no sequence engagement

export interface RiskFactors {
  attendance: number;        // 0–100, weight 30%
  treatmentProgress: number; // 0–100, weight 25%
  hepEngagement: number;     // 0–100, weight 20%
  sentiment: number;         // 0–100, weight 15%
  staticRisk: number;        // 0–100, weight 10%
}

export interface Patient {
  id: string;
  name: string;
  dob?: string;
  contact: PatientContact;
  clinicianId: string;
  insuranceFlag: boolean;
  insurerName?: string;
  preAuthStatus: PreAuthStatus;
  pmsExternalId?: string;
  physitrackPatientId?: string;
  heidiPatientId?: string;
  referralSource?: ReferralSource;
  lastSessionDate?: string;
  nextSessionDate?: string;
  sessionCount: number;
  treatmentLength: number;
  discharged: boolean;
  churnRisk: boolean;
  hepProgramId?: string;
  createdAt: string;
  updatedAt: string;
  // Retention engine fields (additive — churnRisk/discharged unchanged)
  lifecycleState?: LifecycleState;
  riskScore?: number;               // 0–100 weighted composite
  riskFactors?: RiskFactors;
  sessionThresholdAlert?: boolean;  // true when lifecycleState = 'ONBOARDING'
  lifecycleUpdatedAt?: string;      // ISO string
  // Heidi enrichment (additive — populated when Heidi integration is enabled)
  complexitySignals?: ComplexitySignals;
  complexityUpdatedAt?: string;
}
