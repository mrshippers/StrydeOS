/**
 * Cliniko REST API client (server-side only).
 *
 * Cliniko auth: API key used as username in HTTP Basic auth, password is "x".
 * API key can be generated at: Cliniko Settings → API Keys → Generate new key.
 *
 * Base URL: https://api.{shard}.cliniko.com/v1
 * Shard varies by clinic location (au1, uk1, us1, etc.)
 */

export interface ClinikoConfig {
  apiKey: string;
  baseUrl?: string; // e.g. "https://api.au1.cliniko.com/v1"
}

/** Shard regions to probe during connection test */
const SHARD_PROBES = ["au1", "uk1", "us1"];

export async function clinikoFetch<T>(
  config: ClinikoConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // Use baseUrl if already resolved, otherwise default to au1
  const base = config.baseUrl ?? `https://api.au1.cliniko.com/v1`;
  const url = path.startsWith("http") ? path : `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  
  // Cliniko uses HTTP Basic auth with API key as username, "x" as password
  const authString = Buffer.from(`${config.apiKey}:x`).toString("base64");
  
  const res = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Basic ${authString}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "StrydeOS/1.0",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let hint = "";
    if (res.status === 401) hint = " (invalid API key — regenerate in Cliniko Settings → API Keys)";
    if (res.status === 404) hint = ` (endpoint not found at ${url})`;
    if (res.status === 403) hint = " (forbidden — ensure the API key has full access)";
    if (res.status === 429) hint = " (rate limit exceeded — retry after delay)";
    throw new Error(`Cliniko API ${res.status}${hint}: ${body || res.statusText}`);
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * Test Cliniko connection by probing common shard regions.
 * Returns the resolved shard base URL on success.
 */
export async function testClinikoConnection(
  config: ClinikoConfig
): Promise<{ ok: boolean; error?: string; resolvedBase?: string }> {
  const errors: string[] = [];

  // If baseUrl already set, test it directly first
  if (config.baseUrl) {
    try {
      await clinikoFetch<{ id: string }>(config, "/user");
      return { ok: true, resolvedBase: config.baseUrl };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("401")) {
        return { ok: false, error: `Authentication failed — check your Cliniko API key.\n${msg}` };
      }
      errors.push(`${config.baseUrl} → ${msg}`);
    }
  }

  // Probe each shard
  for (const shard of SHARD_PROBES) {
    const base = `https://api.${shard}.cliniko.com/v1`;
    try {
      await clinikoFetch<{ id: string }>({ ...config, baseUrl: base }, "/user");
      return { ok: true, resolvedBase: base };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${base} → ${msg}`);
      
      // Stop early on auth failures (wrong key)
      if (msg.includes("401")) {
        return { ok: false, error: `Authentication failed — check your Cliniko API key.\n${msg}` };
      }
    }
  }

  return {
    ok: false,
    error: `Could not reach Cliniko API. Tried ${SHARD_PROBES.length} shard regions:\n${errors.join("\n")}\n\nVerify your API key or contact Cliniko support.`,
  };
}

/**
 * Auto-paginate through Cliniko list endpoints using cursor-based pagination.
 * Cliniko returns { [resource_key]: [...], links: { next: "..." }, total_entries: N }
 */
export async function clinikoFetchAll<T>(
  config: ClinikoConfig,
  path: string,
  resourceKey: string
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = path;

  while (nextUrl) {
    const response: Record<string, any> = await clinikoFetch<Record<string, any>>(config, nextUrl);

    const items = response[resourceKey] as T[] | undefined;
    if (Array.isArray(items)) {
      results.push(...items);
    }

    // Follow next link if present
    nextUrl = response.links?.next ?? null;
  }

  return results;
}
