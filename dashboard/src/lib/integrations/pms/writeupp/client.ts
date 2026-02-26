/**
 * WriteUpp REST API client (server-side only).
 * Base URL and endpoints may need adjustment per WriteUpp's current API docs.
 */

const DEFAULT_BASE = "https://api.writeupp.com/v1";

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
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WriteUpp API ${res.status}: ${body || res.statusText}`);
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/** Test that the API key is valid (e.g. GET /me or /account). */
export async function testWriteUppConnection(config: WriteUppConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    await writeUppFetch<unknown>(config, "/me");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
  }
}
