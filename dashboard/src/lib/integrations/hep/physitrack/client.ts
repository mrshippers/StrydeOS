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
}
