export interface HEPPromResult {
  type: string;
  score: number;
  recordedAt: string;
}

export interface HEPProgramme {
  externalId: string;
  patientExternalId: string;
  name: string;
  exerciseCount: number;
  assignedAt: string;
  completionPercent: number;
  lastAccessedAt?: string;
  deepLink?: string;
  /** Populated by Physitrack V2 adherence endpoint */
  adherencePercent?: number;
  /** Populated by Physitrack V2 adherence endpoint */
  sessionsCompleted?: number;
  /** Populated by Physitrack V2 PROM results endpoint */
  promResults?: HEPPromResult[];
}

export interface HEPAdherenceResult {
  adherencePercent: number;
  sessionsCompleted: number;
  lastSessionAt?: string;
}

export interface HEPPatientRef {
  physitrackId: string;
  patientName: string;
}

export interface HEPAdapter {
  provider: "physitrack" | "rehab_my_patient" | "wibbi";

  testConnection(): Promise<{ ok: boolean; error?: string }>;

  getProgrammes(params: {
    patientExternalId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<HEPProgramme[]>;

  getProgramme(externalId: string): Promise<HEPProgramme>;

  /** Optional: Physitrack V2 only — adherence % and session count */
  getAdherence?(patientExternalId: string, programmeCode: string): Promise<HEPAdherenceResult | null>;

  /** Optional: Physitrack V2 only — patient list for ID cross-reference */
  getPatients?(): Promise<HEPPatientRef[]>;

  /** Optional: Physitrack V2 only — PROM scores for a programme */
  getPromResults?(
    patientExternalId: string,
    programmeCode: string
  ): Promise<HEPPromResult[]>;
}

export interface HEPIntegrationConfig {
  provider: "physitrack" | "rehab_my_patient" | "wibbi";
  apiKey: string;
  clinicId?: string;
  baseUrl?: string;
}
