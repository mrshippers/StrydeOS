/**
 * WriteUpp REST API client (server-side only).
 *
 * WriteUpp auth: API key passed as Bearer token in Authorization header.
 * Admin can generate a key at: WriteUpp Settings → API Access → Generate new key.
 *
 * Base URL: https://app.writeupp.com/api/v1  (the /api prefix is required)
 * Fallback tested paths: /me, /users/me, /account
 */

const DEFAULT_BASE = "https://app.writeupp.com/api/v1";

/** Alternative base URLs to try if the primary fails */
const FALLBACK_BASES = [
  "https://api.writeupp.com/v1",
  "https://app.writeupp.com/api/v1",
];

export interface WriteUppConfig {
  apiKey: string;
  baseUrl?: string;
}

export async function writeUppFetch<T>(
  config: WriteUppConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const base = config.baseUrl ?? DEFAULT_BASE;
  const url = path.startsWith("http") ? path : `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let hint = "";
    if (res.status === 401) hint = " (invalid API key — regenerate in WriteUpp Settings → API Access)";
    if (res.status === 404) hint = ` (endpoint not found at ${url} — WriteUpp may use a different path)`;
    if (res.status === 403) hint = " (forbidden — ensure the API key has full access in WriteUpp)";
    throw new Error(`WriteUpp API ${res.status}${hint}: ${body || res.statusText}`);
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * Test WriteUpp connection by trying several auth/endpoint combinations.
 * WriteUpp's exact endpoint for account info is not publicly documented,
 * so we probe a sequence of plausible paths and return on first success.
 */
export async function testWriteUppConnection(config: WriteUppConfig): Promise<{ ok: boolean; error?: string; resolvedBase?: string }> {
  const probes: { base: string; path: string }[] = [
    { base: "https://app.writeupp.com/api/v1", path: "/me" },
    { base: "https://app.writeupp.com/api/v1", path: "/account" },
    { base: "https://app.writeupp.com/api/v1", path: "/users/me" },
    { base: "https://api.writeupp.com/v1", path: "/me" },
    { base: "https://api.writeupp.com/v1", path: "/account" },
  ];

  const errors: string[] = [];

  for (const probe of probes) {
    try {
      await writeUppFetch<unknown>({ ...config, baseUrl: probe.base }, probe.path);
      return { ok: true, resolvedBase: probe.base };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${probe.base}${probe.path} → ${msg}`);
      // Stop early on auth failures (wrong key) vs endpoint-not-found
      if (msg.includes("401")) {
        return { ok: false, error: `Authentication failed — check your WriteUpp API key.\n${msg}` };
      }
    }
  }

  return {
    ok: false,
    error: `Could not reach WriteUpp API. Tried ${probes.length} endpoints:\n${errors.join("\n")}\n\nContact WriteUpp support to confirm your API base URL.`,
  };
}

export { FALLBACK_BASES };
