/**
 * RehabMyPatient REST API client (server-side only).
 *
 * RehabMyPatient auth: API key passed as RMP-API-KEY header.
 * Key generated in-app: Settings > API (self-serve).
 *
 * Base URL: https://www.rehabmypatient.com/apiV2
 * Docs: https://www.rehabmypatient.com/api-documentation
 *
 * Note: API exposes programme structure and assignment dates,
 * but does NOT provide adherence %, completion rates, or session timestamps.
 */

export interface RehabMyPatientConfig {
  apiKey: string;
  baseUrl?: string;
}

const DEFAULT_BASE = "https://www.rehabmypatient.com/apiV2";

export async function rehabMyPatientFetch<T>(
  config: RehabMyPatientConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const base = config.baseUrl ?? DEFAULT_BASE;
  const url = path.startsWith("http")
    ? path
    : `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "RMP-API-KEY": config.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "StrydeOS/1.0",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let hint = "";
    if (res.status === 401) hint = " (invalid API key — regenerate in RehabMyPatient Settings → API)";
    if (res.status === 403) hint = " (forbidden — check API key permissions)";
    if (res.status === 404) hint = ` (endpoint not found at ${url})`;
    if (res.status === 429) hint = " (rate limit exceeded — retry after delay)";
    throw new Error(`RehabMyPatient API ${res.status}${hint}: ${body || res.statusText}`);
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * Test RehabMyPatient connection by calling the practitioners endpoint.
 * Returns success if API key is valid and accessible.
 */
export async function testRehabMyPatientConnection(
  config: RehabMyPatientConfig
): Promise<{ ok: boolean; error?: string }> {
  const base = config.baseUrl ?? DEFAULT_BASE;
  try {
    // Call practitioners endpoint with minimal result set to verify key
    await rehabMyPatientFetch<unknown>(
      { ...config, baseUrl: base },
      "/practitioners?per_page=1"
    );
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("401") || msg.includes("403")) {
      return {
        ok: false,
        error: `Authentication failed — check your RehabMyPatient API key.\n${msg}`,
      };
    }
    return {
      ok: false,
      error: `Could not reach RehabMyPatient API at ${base}.\n${msg}\n\nEnsure your API key was copied correctly from Settings → API.`,
    };
  }
}
