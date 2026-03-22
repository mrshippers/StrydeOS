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
  /** Populated by providers that expose adherence data (e.g. Physitrack V2) */
  adherencePercent?: number;
  /** Populated by providers that expose adherence data (e.g. Physitrack V2) */
  sessionsCompleted?: number;
  /** Populated by providers that expose PROM results (e.g. Physitrack V2) */
  promResults?: HEPPromResult[];
}

export interface HEPAdherenceResult {
  adherencePercent: number;
  sessionsCompleted: number;
  lastSessionAt?: string;
}

export interface HEPPatientRef {
  externalId: string;
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

  /** Optional — adherence % and session count (currently Physitrack only) */
  getAdherence?(patientExternalId: string, programmeCode: string): Promise<HEPAdherenceResult | null>;

  /** Optional — patient list for ID cross-reference (currently Physitrack only) */
  getPatients?(): Promise<HEPPatientRef[]>;

  /** Optional — PROM scores for a programme (currently Physitrack only) */
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
