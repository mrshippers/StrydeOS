/**
 * Zanda (formerly Power Diary) REST API client (server-side only).
 *
 * Zanda auth: API key passed as x-api-key header.
 * Key generated in-app: Zanda Tools → Zanda API Key (one-time display on generation).
 *
 * Note: Zanda API is currently in beta and read-only.
 * POST/write endpoints are in active development and not yet available.
 *
 * Base URL: https://api.zandahealth.com/v1
 * Docs: https://zandaapi.zandahealth.com/docs
 */

export interface ZandaConfig {
  apiKey: string;
  baseUrl?: string;
}

const DEFAULT_BASE = "https://api.zandahealth.com/v1";

export async function zandaFetch<T>(
  config: ZandaConfig,
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
      "x-api-key": config.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "StrydeOS/1.0",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let hint = "";
    if (res.status === 401) hint = " (invalid API key — regenerate in Zanda Tools → Zanda API Key)";
    if (res.status === 403) hint = " (forbidden — check API key permissions)";
    if (res.status === 404) hint = ` (endpoint not found at ${url})`;
    if (res.status === 429) hint = " (rate limit exceeded — Zanda limits to 60 req/min)";
    throw new Error(`Zanda API ${res.status}${hint}: ${body || res.statusText}`);
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * Test Zanda connection by calling the practitioners endpoint.
 * Returns the resolved base URL on success.
 */
export async function testZandaConnection(
  config: ZandaConfig
): Promise<{ ok: boolean; error?: string; resolvedBase?: string }> {
  const base = config.baseUrl ?? DEFAULT_BASE;
  try {
    await zandaFetch<unknown>({ ...config, baseUrl: base }, "/practitioners?per_page=1");
    return { ok: true, resolvedBase: base };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("401") || msg.includes("403")) {
      return { ok: false, error: `Authentication failed — check your Zanda API key.\n${msg}` };
    }
    return {
      ok: false,
      error: `Could not reach Zanda API at ${base}.\n${msg}\n\nEnsure your API key was copied on first generation (Zanda only shows it once).`,
    };
  }
}

/**
 * Auto-paginate through Zanda list endpoints.
 * Zanda returns { data: [...], meta: { current_page, last_page, ... } }
 * or { data: [...], links: { next: "..." } } depending on endpoint.
 */
export async function zandaFetchAll<T>(
  config: ZandaConfig,
  path: string,
  resourceKey = "data"
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = path;

  while (nextUrl) {
    const response: Record<string, any> = await zandaFetch<Record<string, any>>(config, nextUrl);

    const items = (response[resourceKey] ?? response.data) as T[] | undefined;
    if (Array.isArray(items)) {
      results.push(...items);
    }

    // Prefer links.next, fall back to meta.next_page_url
    const linksNext = response.links?.next ?? null;
    const metaNext = response.meta?.next_page_url ?? null;
    nextUrl = linksNext || metaNext || null;
  }

  return results;
}
