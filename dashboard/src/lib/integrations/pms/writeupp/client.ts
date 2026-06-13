/**
 * WriteUpp Open API client (server-side only).
 *
 * Official Open API v1 — READ-ONLY. Shipped in WriteUpp v2.17.23 (June 2026).
 * Auth: site-level API key sent in the `X-API-Key` header (NOT Bearer).
 *   Generate at: WriteUpp → Main Menu → Integrations & Add Ons → Open API.
 * Base URL is region-specific (shown on the Open API config page):
 *   Europe/UK: https://openapi.writeupp.com/v1
 * Pagination: page / per_page, with total_entries + links on list responses.
 * Rate limit: 200 requests/minute per key (429 + Retry-After when exceeded).
 *
 * The Open API exposes GET endpoints only. Write operations (create/update)
 * are not supported — the adapter surfaces that explicitly rather than calling
 * endpoints that do not exist.
 */

const DEFAULT_BASE = "https://openapi.writeupp.com/v1";

/** WriteUpp expects a User-Agent of the form "AppName (contact-email)". */
const USER_AGENT = "StrydeOS (hello@strydeos.com)";

const MAX_RETRIES_429 = 2;

export interface WriteUppConfig {
  apiKey: string;
  baseUrl?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function writeUppFetch<T>(
  config: WriteUppConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const base = config.baseUrl ?? DEFAULT_BASE;
  const url = path.startsWith("http")
    ? path
    : `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(20_000),
      headers: {
        "X-API-Key": config.apiKey,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...options.headers,
      },
    });

    // Honour the 200 req/min limit: back off on Retry-After, then retry.
    if (res.status === 429 && attempt < MAX_RETRIES_429) {
      const retryAfter = Number(res.headers.get("Retry-After")) || 2;
      await sleep(Math.min(retryAfter, 30) * 1000);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let hint = "";
      if (res.status === 401) hint = " (invalid API key — regenerate under WriteUpp → Integrations & Add Ons → Open API)";
      if (res.status === 403) hint = " (forbidden — the key may be revoked or lack access)";
      if (res.status === 404) hint = ` (not found at ${url})`;
      if (res.status === 429) hint = " (rate limit exceeded — 200 req/min per key)";
      throw new Error(`WriteUpp Open API ${res.status}${hint}: ${body || res.statusText}`);
    }

    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }
}

/**
 * Test the WriteUpp Open API connection by hitting an authenticated endpoint.
 * `/users` exists on every site and is small. A 401 means a bad key; anything
 * else means the regional base URL is unreachable.
 */
export async function testWriteUppConnection(
  config: WriteUppConfig
): Promise<{ ok: boolean; error?: string; resolvedBase?: string }> {
  const base = config.baseUrl ?? DEFAULT_BASE;
  try {
    await writeUppFetch<unknown>({ ...config, baseUrl: base }, "/users?per_page=1");
    return { ok: true, resolvedBase: base };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("401")) {
      return { ok: false, error: `Authentication failed — check the StrydeOS Open API key.\n${msg}` };
    }
    return {
      ok: false,
      error: `Could not reach the WriteUpp Open API at ${base}.\n${msg}\n\nConfirm the Regional API URL shown on the WriteUpp Open API page.`,
    };
  }
}

/**
 * Pull the items array out of a WriteUpp list response. The Open API wraps
 * lists as `{ <resource>: [...], total_entries, links }`; the resource key
 * varies per endpoint, so we accept an explicit key and fall back to the first
 * array-valued property (ignoring `links`).
 */
function extractItems<T>(resp: unknown, resourceKey?: string): T[] {
  if (Array.isArray(resp)) return resp as T[];
  if (!resp || typeof resp !== "object") return [];
  const obj = resp as Record<string, unknown>;
  if (resourceKey && Array.isArray(obj[resourceKey])) return obj[resourceKey] as T[];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "links") continue;
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

function buildPagedPath(path: string, page: number, perPage: number): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("page", String(page));
  if (!params.has("per_page")) params.set("per_page", String(perPage));
  return `${base}?${params.toString()}`;
}

/**
 * Auto-paginate a WriteUpp Open API list endpoint. Follows `links.next` when
 * present, otherwise walks pages until `total_entries` is reached or a page
 * comes back empty.
 */
export async function writeUppFetchAll<T>(
  config: WriteUppConfig,
  path: string,
  opts: { resourceKey?: string; perPage?: number; maxPages?: number } = {}
): Promise<T[]> {
  const { resourceKey, perPage = 100, maxPages = 100 } = opts;
  const results: T[] = [];
  let url = buildPagedPath(path, 1, perPage);
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  for (let pageCount = 0; pageCount < maxPages; pageCount++) {
    const resp = await writeUppFetch<Record<string, unknown>>(config, url);
    const items = extractItems<T>(resp, resourceKey);
    results.push(...items);

    const totalEntries = resp?.total_entries;
    if (typeof totalEntries === "number") total = totalEntries;

    if (results.length >= total) break;

    const next = (resp?.links as { next?: string } | undefined)?.next;
    if (next) {
      url = next;
    } else if (items.length === 0) {
      break;
    } else {
      page += 1;
      url = buildPagedPath(path, page, perPage);
    }
  }

  return results;
}
