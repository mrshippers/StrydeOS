export interface PhysitrackClientConfig {
  apiKey: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.physitrack.com/v2";

export class PhysitrackClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: PhysitrackClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Physitrack API ${res.status}: ${body}`);
    }

    return res.json();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("/me");
      return true;
    } catch {
      return false;
    }
  }

  /** GET /clients — patient list with Physitrack IDs */
  async getClients(): Promise<PhysitrackClientListResponse> {
    return this.request<PhysitrackClientListResponse>("/clients");
  }

  /** GET /clients/{id}/programs — all programmes per patient */
  async getClientPrograms(clientId: string): Promise<PhysitrackProgramListResponse> {
    return this.request<PhysitrackProgramListResponse>(
      `/clients/${encodeURIComponent(clientId)}/programs`
    );
  }

  /** GET /clients/{id}/programs/{code}/adherence — adherence % and session timestamps */
  async getProgramAdherence(
    clientId: string,
    programCode: string
  ): Promise<PhysitrackAdherenceResponse> {
    return this.request<PhysitrackAdherenceResponse>(
      `/clients/${encodeURIComponent(clientId)}/programs/${encodeURIComponent(programCode)}/adherence`
    );
  }

  /** GET /clients/{id}/programs/{code}/proms/{promId}/results — PROM scores */
  async getPromResults(
    clientId: string,
    programCode: string,
    promId: string
  ): Promise<PhysitrackPromResultsResponse> {
    return this.request<PhysitrackPromResultsResponse>(
      `/clients/${encodeURIComponent(clientId)}/programs/${encodeURIComponent(programCode)}/proms/${encodeURIComponent(promId)}/results`
    );
  }
}

// Response shapes (align with Physitrack V2 API; adjust field names when docs are confirmed)
export interface PhysitrackClientRow {
  id: string | number;
  first_name?: string;
  last_name?: string;
  name?: string;
  [key: string]: unknown;
}

export interface PhysitrackClientListResponse {
  data?: PhysitrackClientRow[];
  clients?: PhysitrackClientRow[];
}

export interface PhysitrackProgramListResponse {
  data?: Array<{ id?: string; access_code?: string; name?: string; created_at?: string; [key: string]: unknown }>;
  programs?: Array<{ id?: string; access_code?: string; name?: string; created_at?: string; [key: string]: unknown }>;
}

export interface PhysitrackAdherenceResponse {
  adherence_percent?: number;
  adherencePercent?: number;
  sessions_completed?: number;
  sessionsCompleted?: number;
  last_session_at?: string;
  lastSessionAt?: string;
  [key: string]: unknown;
}

export interface PhysitrackPromResultRow {
  type?: string;
  prom_type?: string;
  score?: number;
  recorded_at?: string;
  recordedAt?: string;
  [key: string]: unknown;
}

export interface PhysitrackPromResultsResponse {
  data?: PhysitrackPromResultRow[];
  results?: PhysitrackPromResultRow[];
}
