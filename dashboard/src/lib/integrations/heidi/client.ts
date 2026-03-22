/**
 * Heidi Health API client.
 *
 * Heidi exposes a REST API (no webhooks). Auth flow:
 *   1. Exchange API key for a short-lived JWT via GET /jwt
 *   2. Use JWT as Bearer token on all subsequent calls
 *
 * Base URL: https://registrar.api.heidihealth.com/api/v2/ml-scribe/open-api
 * Docs: https://www.heidihealth.com/developers
 */

import type {
  HeidiJwtResponse,
  HeidiSession,
  HeidiDocument,
  HeidiClinicalCode,
  HeidiAskResponse,
  HeidiPatientProfile,
} from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const HEIDI_REGION_URLS: Record<string, string> = {
  uk: "https://registrar.api.heidihealth.com",
  au: "https://registrar.api.heidihealth.com",
  us: "https://registrar.api.heidihealth.com",
  eu: "https://registrar.api.heidihealth.com",
};

const API_BASE = "/api/v2/ml-scribe/open-api";

// ─── JWT cache ───────────────────────────────────────────────────────────────

interface CachedJwt {
  token: string;
  expiresAt: number;
}

const jwtCache = new Map<string, CachedJwt>();

function getCacheKey(apiKey: string, email: string): string {
  return `${apiKey}:${email}`;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export interface HeidiClientConfig {
  apiKey: string;
  region: "uk" | "au" | "us" | "eu";
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Heidi API ${res.status}: ${res.statusText} — ${body}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Heidi API ${res.status}: ${res.statusText} — ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Get a JWT for a specific clinician. Caches until 5 min before expiry.
 */
export async function getHeidiJwt(
  config: HeidiClientConfig,
  clinicianEmail: string,
  thirdPartyId?: string,
): Promise<string> {
  const cacheKey = getCacheKey(config.apiKey, clinicianEmail);
  const cached = jwtCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }

  const baseUrl = HEIDI_REGION_URLS[config.region] ?? HEIDI_REGION_URLS.uk;
  const params = new URLSearchParams({ email: clinicianEmail });
  if (thirdPartyId) params.set("third_party_internal_id", thirdPartyId);

  const data = await fetchJson<HeidiJwtResponse>(
    `${baseUrl}${API_BASE}/jwt?${params}`,
    { "Heidi-Api-Key": config.apiKey },
  );

  jwtCache.set(cacheKey, {
    token: data.token,
    expiresAt: new Date(data.expiration_time).getTime(),
  });

  return data.token;
}

/**
 * Validate an API key by attempting a JWT exchange.
 * Returns true if the key is valid, false otherwise.
 */
export async function validateApiKey(
  config: HeidiClientConfig,
  testEmail: string,
): Promise<boolean> {
  try {
    await getHeidiJwt(config, testEmail);
    return true;
  } catch {
    return false;
  }
}

function authHeaders(jwt: string): Record<string, string> {
  return { Authorization: `Bearer ${jwt}` };
}

function apiUrl(config: HeidiClientConfig): string {
  const baseUrl = HEIDI_REGION_URLS[config.region] ?? HEIDI_REGION_URLS.uk;
  return `${baseUrl}${API_BASE}`;
}

/**
 * List sessions, optionally filtered by status or date range.
 */
export async function fetchSessions(
  config: HeidiClientConfig,
  jwt: string,
  options?: { since?: string; status?: string },
): Promise<HeidiSession[]> {
  const params = new URLSearchParams();
  if (options?.since) params.set("updated_after", options.since);
  if (options?.status) params.set("status", options.status);

  const qs = params.toString();
  const url = `${apiUrl(config)}/sessions${qs ? `?${qs}` : ""}`;
  return fetchJson<HeidiSession[]>(url, authHeaders(jwt));
}

/**
 * Get documents (generated notes) for a session.
 */
export async function fetchSessionDocuments(
  config: HeidiClientConfig,
  jwt: string,
  sessionId: string,
): Promise<HeidiDocument[]> {
  return fetchJson<HeidiDocument[]>(
    `${apiUrl(config)}/sessions/${sessionId}/documents`,
    authHeaders(jwt),
  );
}

/**
 * Get clinical codes (ICD-10, SNOMED, etc.) for a session.
 */
export async function fetchClinicalCodes(
  config: HeidiClientConfig,
  jwt: string,
  sessionId: string,
): Promise<HeidiClinicalCode[]> {
  return fetchJson<HeidiClinicalCode[]>(
    `${apiUrl(config)}/sessions/${sessionId}/clinical-codes`,
    authHeaders(jwt),
  );
}

/**
 * Ask Heidi AI a question about a session's content.
 * Use this to extract structured data (pain scores, discharge outlook, etc.).
 */
export async function askHeidi(
  config: HeidiClientConfig,
  jwt: string,
  sessionId: string,
  question: string,
): Promise<string> {
  const data = await postJson<HeidiAskResponse>(
    `${apiUrl(config)}/sessions/${sessionId}/ask-ai`,
    authHeaders(jwt),
    { question },
  );
  return data.answer;
}

/**
 * Get a patient profile by Heidi's internal ID.
 */
export async function fetchPatientProfile(
  config: HeidiClientConfig,
  jwt: string,
  patientProfileId: string,
): Promise<HeidiPatientProfile> {
  return fetchJson<HeidiPatientProfile>(
    `${apiUrl(config)}/patient-profiles/${patientProfileId}`,
    authHeaders(jwt),
  );
}
