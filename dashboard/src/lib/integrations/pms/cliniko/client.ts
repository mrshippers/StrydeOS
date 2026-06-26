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

/** Shard regions to probe during connection test (fallback only) */
const SHARD_PROBES = ["uk1", "uk2", "uk3", "au1", "au2", "us1"];

// ── Rate limiting + retry ──────────────────────────────────────────────────
// Cliniko caps each API key at ~200 requests/minute and returns 429 with a
// `Retry-After` header when exceeded. The pipeline fans out (syncPatients runs
// getPatient 10-at-a-time, paginated sweeps walk many pages), so without pacing
// a single run bursts past the cap and 429s in production.
//
// Two layers, both process-wide so every clinikoFetch caller shares them:
//  1. A min-interval gate that spaces out request *starts* (serialised through
//     a promise chain — concurrent callers queue instead of bursting).
//  2. Retry on 429/503 that honours Retry-After, else exponential backoff with
//     jitter, capped at MAX_RETRIES.
// Tunable via env without a redeploy of logic.
let MIN_REQUEST_INTERVAL_MS = Number(
  process.env.CLINIKO_MIN_REQUEST_INTERVAL_MS ?? 350
);
let MAX_RETRIES = Number(process.env.CLINIKO_MAX_RETRIES ?? 4);
const MAX_BACKOFF_MS = 16_000;

// Steady-state defaults, restored by resetClinikoPacing().
const DEFAULT_MIN_REQUEST_INTERVAL_MS = MIN_REQUEST_INTERVAL_MS;
const DEFAULT_MAX_RETRIES = MAX_RETRIES;

/**
 * Temporarily pace Cliniko gentler than steady state. A large backfill (e.g. the
 * full first-sync patient import for a self-onboarding clinic) fetches one record
 * per patient; at the normal interval the sustained rate — stacked on top of any
 * live traffic sharing the same Cliniko account limit (Ava, the insurance poll) —
 * trips 429s. Call this before a backfill with a wider interval + more retries,
 * then resetClinikoPacing() in a finally. Process-wide, matching the throttle.
 */
export function setClinikoPacing(opts: { minIntervalMs?: number; maxRetries?: number }): void {
  if (typeof opts.minIntervalMs === "number" && opts.minIntervalMs > 0) {
    MIN_REQUEST_INTERVAL_MS = opts.minIntervalMs;
  }
  if (typeof opts.maxRetries === "number" && opts.maxRetries >= 0) {
    MAX_RETRIES = opts.maxRetries;
  }
}

/** Restore the steady-state request pacing after a backfill. */
export function resetClinikoPacing(): void {
  MIN_REQUEST_INTERVAL_MS = DEFAULT_MIN_REQUEST_INTERVAL_MS;
  MAX_RETRIES = DEFAULT_MAX_RETRIES;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastRequestStartedAt = 0;
let throttleChain: Promise<void> = Promise.resolve();

/**
 * Enforce a minimum gap between request starts, process-wide. Callers append to
 * a single promise chain so 10 concurrent getPatient calls queue and drip out
 * one MIN_REQUEST_INTERVAL_MS apart instead of hitting Cliniko all at once.
 */
function throttle(): Promise<void> {
  const next = throttleChain.then(async () => {
    const elapsed = Date.now() - lastRequestStartedAt;
    const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
    if (wait > 0) await sleep(wait);
    lastRequestStartedAt = Date.now();
  });
  // Keep the chain alive even if a turn rejects, so one failure can't wedge it.
  throttleChain = next.catch(() => {});
  return next;
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into ms, or null. */
function parseRetryAfter(res: Response): number | null {
  const header = res.headers.get("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

/**
 * Extract the shard from a Cliniko API key.
 * Keys optionally end with `-{shard}` e.g. `...xyz-uk3`.
 */
function extractShard(apiKey: string): string | null {
  const match = apiKey.match(/-([a-z]{2}\d+)$/);
  return match ? match[1] : null;
}

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

  // Retry loop: on 429/503 honour Retry-After (else exponential backoff with
  // jitter) and try again, up to MAX_RETRIES. Every attempt passes through the
  // throttle gate first so retries don't themselves stampede the API.
  for (let attempt = 0; ; attempt++) {
    await throttle();

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

    // Transient — back off and retry rather than failing the whole sync.
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      const retryAfter = parseRetryAfter(res);
      const backoff =
        retryAfter ??
        Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt) +
          Math.floor(Math.random() * 250);
      // Drain the body so the socket can be reused.
      await res.text().catch(() => "");
      await sleep(backoff);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let hint = "";
      if (res.status === 401) hint = " (invalid API key — regenerate in Cliniko Settings → API Keys)";
      if (res.status === 404) hint = ` (endpoint not found at ${url})`;
      if (res.status === 403) hint = " (forbidden — ensure the API key has full access)";
      if (res.status === 429) hint = " (rate limit exceeded — retried and still throttled)";
      throw new Error(`Cliniko API ${res.status}${hint}: ${body || res.statusText}`);
    }

    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }
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

  // Build probe order: key-derived shard first, then fallbacks
  const keyShard = extractShard(config.apiKey);
  const probeOrder = keyShard
    ? [keyShard, ...SHARD_PROBES.filter((s) => s !== keyShard)]
    : SHARD_PROBES;

  for (const shard of probeOrder) {
    const base = `https://api.${shard}.cliniko.com/v1`;
    try {
      await clinikoFetch<{ id: string }>({ ...config, baseUrl: base }, "/user");
      return { ok: true, resolvedBase: base };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${base} → ${msg}`);

      // Stop early on auth failures (wrong key, not wrong shard)
      if (msg.includes("401")) {
        return { ok: false, error: `Authentication failed — check your Cliniko API key.\n${msg}` };
      }
    }
  }

  return {
    ok: false,
    error: `Could not reach Cliniko API. Tried shards: ${probeOrder.join(", ")}.\n${errors.join("\n")}\n\nVerify your API key or contact Cliniko support.`,
  };
}

/**
 * Auto-paginate through Cliniko list endpoints using cursor-based pagination.
 * Cliniko returns { [resource_key]: [...], links: { next: "..." }, total_entries: N }
 */
export async function clinikoFetchAll<T>(
  config: ClinikoConfig,
  path: string,
  resourceKey: string,
  maxPages = 100
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = path;
  let page = 0;

  while (nextUrl) {
    if (page >= maxPages) {
      console.warn(`[clinikoFetchAll] Reached maxPages limit (${maxPages}) for ${path} — results may be incomplete`);
      break;
    }

    const response: Record<string, any> = await clinikoFetch<Record<string, any>>(config, nextUrl);

    const items = response[resourceKey] as T[] | undefined;
    if (Array.isArray(items)) {
      results.push(...items);
    }

    // Follow next link if present
    nextUrl = response.links?.next ?? null;
    page++;
  }

  return results;
}
