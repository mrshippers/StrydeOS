export type EnrichmentSource = "heidi";

export type TreatmentComplexity = "low" | "moderate" | "high";
export type DischargeLikelihood = "low" | "moderate" | "high";

export interface ComplexitySignals {
  painScore?: number;                      // 0–10 (NPRS/VAS)
  treatmentComplexity: TreatmentComplexity;
  dischargeLikelihood: DischargeLikelihood;
  multipleRegions: boolean;
  chronicIndicators: boolean;
  psychosocialFlags: boolean;
}

export interface ClinicalCode {
  code: string;
  system: "ICD-10" | "ICD-10-CM" | "SNOMED" | "SNOMED-CT" | "CPT-2025" | "OPCS-410" | "ACHI-13";
  description: string;
  relevanceScore: number;
}

export interface ClinicalNote {
  id: string;
  patientId: string;
  clinicianId?: string;
  source: EnrichmentSource;
  heidiSessionId: string;
  receivedAt: string;
  sessionDate: string;
  noteContent: string;
  noteContentType: "MARKDOWN" | "HTML";
  clinicalCodes: ClinicalCode[];
  complexitySignals: ComplexitySignals;
  raw: Record<string, unknown>;
}

/** Stored at clinics/{clinicId}/integrations_config/heidi */
export interface HeidiIntegrationConfig {
  enabled: boolean;
  apiKey: string;
  region: "uk" | "au" | "us" | "eu";
  configuredAt: string;
  lastSyncAt: string | null;
  status: "connected" | "disconnected" | "error";
  /** Mapping of StrydeOS clinicianId → Heidi user email for JWT generation. */
  clinicianEmailMap?: Record<string, string>;
}

// ─── Heidi API response shapes ──────────────────────────────────────────────

export interface HeidiJwtResponse {
  token: string;
  expiration_time: string;
}

export interface HeidiSession {
  id: string;
  status: "EMPTY" | "DRAFT" | "REVIEWED" | "APPROVED" | "SENT";
  patient_profile_id?: string;
  created_at: string;
  updated_at: string;
}

export interface HeidiDocument {
  id: string;
  session_id: string;
  name: string;
  template_id?: string;
  content_type: "MARKDOWN" | "HTML";
  content: string;
  voice_style: "BRIEF" | "GOLDILOCKS" | "DETAILED" | "MY_VOICE" | "SUPER_DETAILED";
  generation_type?: string;
}

export interface HeidiClinicalCode {
  primary_code: {
    code: string;
    code_system: string;
    display: string;
  };
  similar_codes?: Array<{
    code: string;
    code_system: string;
    display: string;
    confidence: number;
  }>;
  relevance_score: number;
  location_in_note?: string;
}

export interface HeidiPatientProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  dob?: string;
  gender?: "male" | "female" | "other" | "unknown";
  ehr_provider?: string;
  ehr_patient_id?: string;
}

export interface HeidiAskResponse {
  answer: string;
}
