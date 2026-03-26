/**
 * Wibbi Exercise API client (server-side only).
 *
 * Wibbi auth: API key passed as Authorization Bearer token.
 * Key generated in-app: Settings > API (self-serve).
 *
 * Base URL: https://devs-exercise-api.wibbi.com
 * Docs: https://documentation.wibbi.com/
 *
 * Note: Wibbi (formerly Physiotec) provides exercise programme structure
 * and assignment dates. Compliance tracking capability varies by plan tier.
 */

export interface WibbiClientConfig {
  apiKey: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://devs-exercise-api.wibbi.com";

export class WibbiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: WibbiClientConfig) {
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
        Accept: "application/json",
        "User-Agent": "StrydeOS/1.0",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let hint = "";
      if (res.status === 401) hint = " (invalid API key — regenerate in Wibbi Settings → API)";
      if (res.status === 403) hint = " (forbidden — check API key permissions)";
      if (res.status === 404) hint = ` (endpoint not found at ${url})`;
      if (res.status === 429) hint = " (rate limit exceeded — retry after delay)";
      throw new Error(`Wibbi API ${res.status}${hint}: ${body || res.statusText}`);
    }

    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("/api/v1/health");
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Test Wibbi connection by calling a health/status endpoint.
 * Returns success if API key is valid and accessible.
 */
export async function testWibbiConnection(
  config: WibbiClientConfig
): Promise<{ ok: boolean; error?: string }> {
  const client = new WibbiClient(config);
  try {
    const ok = await client.testConnection();
    if (!ok) {
      return {
        ok: false,
        error: "Could not authenticate with Wibbi — check your API key.",
      };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("401") || msg.includes("403")) {
      return {
        ok: false,
        error: `Authentication failed — check your Wibbi API key.\n${msg}`,
      };
    }
    return {
      ok: false,
      error: `Could not reach Wibbi API at ${config.baseUrl ?? DEFAULT_BASE_URL}.\n${msg}\n\nEnsure your API key was copied correctly from Settings → API.`,
    };
  }
}
