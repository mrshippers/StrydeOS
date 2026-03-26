/**
 * Halaxy REST API client (server-side only).
 *
 * Halaxy auth: API key passed as Bearer token in Authorization header.
 * Key generated in-app: Halaxy Settings → API Key Manager.
 * Requires "API subscription" add-on (paid per clinic, billed via Halaxy credits).
 *
 * Halaxy is built on FHIR (HL7) — responses are application/fhir+json.
 * EU/UK base URL: https://eu-api.halaxy.com/main
 * AU base URL:    https://api.halaxy.com/main
 */

export interface HalaxyConfig {
  apiKey: string;
  baseUrl?: string; // resolved on first testConnection()
}

const REGION_PROBES = [
  "https://eu-api.halaxy.com/main",
  "https://api.halaxy.com/main",
];

export async function halaxyFetch<T>(
  config: HalaxyConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const base = config.baseUrl ?? REGION_PROBES[0];
  const url = path.startsWith("http")
    ? path
    : `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/fhir+json",
      Accept: "application/fhir+json",
      "User-Agent": "StrydeOS/1.0",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let hint = "";
    if (res.status === 401) hint = " (invalid API key — regenerate in Halaxy Settings → API Key Manager)";
    if (res.status === 403) hint = " (forbidden — ensure API subscription is active and key has required scopes)";
    if (res.status === 404) hint = ` (endpoint not found at ${url})`;
    if (res.status === 429) hint = " (rate limit exceeded — retry after delay)";
    throw new Error(`Halaxy API ${res.status}${hint}: ${body || res.statusText}`);
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * Test Halaxy connection by probing EU then AU region.
 * Uses FHIR metadata endpoint which is publicly reachable but requires auth
 * for the actual practitioner/appointment data.
 */
export async function testHalaxyConnection(
  config: HalaxyConfig
): Promise<{ ok: boolean; error?: string; resolvedBase?: string }> {
  const errors: string[] = [];

  // Try existing baseUrl first if already resolved
  if (config.baseUrl) {
    try {
      await halaxyFetch<{ resourceType: string }>(config, "/fhir/Practitioner?_count=1");
      return { ok: true, resolvedBase: config.baseUrl };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("401") || msg.includes("403")) {
        return { ok: false, error: `Authentication failed — check your Halaxy API key.\n${msg}` };
      }
      errors.push(`${config.baseUrl} → ${msg}`);
    }
  }

  for (const base of REGION_PROBES) {
    try {
      await halaxyFetch<{ resourceType: string }>({ ...config, baseUrl: base }, "/fhir/Practitioner?_count=1");
      return { ok: true, resolvedBase: base };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${base} → ${msg}`);
      if (msg.includes("401") || msg.includes("403")) {
        return { ok: false, error: `Authentication failed — check your Halaxy API key.\n${msg}` };
      }
    }
  }

  return {
    ok: false,
    error: `Could not reach Halaxy API. Tried ${REGION_PROBES.length} regions:\n${errors.join("\n")}\n\nVerify your API key or ensure the API subscription is active in Halaxy.`,
  };
}

/**
 * FHIR Bundle response shape from Halaxy list endpoints.
 * FHIR paginates via Bundle.link with relation = "next".
 */
export interface FHIRBundle<T> {
  resourceType: "Bundle";
  total?: number;
  link?: Array<{ relation: string; url: string }>;
  entry?: Array<{ resource: T }>;
}

/**
 * Auto-paginate through Halaxy FHIR bundle endpoints.
 * Follows Bundle.link[relation="next"] until exhausted.
 */
export async function halaxyFetchAll<T>(
  config: HalaxyConfig,
  path: string
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = path;

  while (nextUrl) {
    const bundle: FHIRBundle<T> = await halaxyFetch<FHIRBundle<T>>(config, nextUrl);

    const entries = bundle.entry ?? [];
    for (const entry of entries) {
      if (entry.resource) results.push(entry.resource);
    }

    // Follow FHIR next link if present
    const nextLink = bundle.link?.find((l) => l.relation === "next");
    nextUrl = nextLink?.url ?? null;
  }

  return results;
}
