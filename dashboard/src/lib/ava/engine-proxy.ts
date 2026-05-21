/**
 * Proxy helper — forwards Ava tool calls to the Python execution engine.
 *
 * Returns the engine result on success, null on any failure (timeout, network
 * error, non-200 response). Null signals the caller to fall back to the
 * TypeScript PMS adapters.
 */

import { GoogleAuth, type IdTokenClient } from "google-auth-library";

export interface EnginePayload {
  tool_name: string;
  tool_input: Record<string, unknown>;
  clinic_id: string;
  pms_type: string;
  api_key: string;
  base_url?: string;
}

export interface EngineResult {
  result: string;
  booking_id?: string;
  slots?: string[];
}

// Live phone-call path — ElevenLabs holds the conversation turn open while we
// wait. 3s is the upper bound before the caller hears uncomfortable dead air.
// Slow engines fall through to the TS PMS adapters via null return.
const DEFAULT_TIMEOUT_MS = 3_000;

// Module-level cache — IdTokenClient reuses the token until expiry (~1hr)
let _idTokenClient: IdTokenClient | null = null;
let _idTokenClientAudience = "";

async function getIdToken(audience: string): Promise<string | null> {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;

  try {
    if (!_idTokenClient || _idTokenClientAudience !== audience) {
      const auth = new GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
      });
      _idTokenClient = await auth.getIdTokenClient(audience);
      _idTokenClientAudience = audience;
    }
    const rawHeaders = await _idTokenClient.getRequestHeaders();
    const authHeader =
      typeof (rawHeaders as Headers).get === "function"
        ? (rawHeaders as Headers).get("Authorization")
        : (rawHeaders as unknown as Record<string, string>).Authorization ?? null;
    return authHeader ?? null;
  } catch {
    return null;
  }
}

/**
 * POST `payload` to `${engineUrl}/api/tools/execute` and return the parsed
 * response, or null if the engine is unreachable / slow / returns an error.
 *
 * clinic_id is appended as a query param so the Python tenant middleware
 * validates it before the request body is parsed.
 *
 * @param engineUrl  Base URL of the Python service, e.g. "https://ava-graph-xxx.run.app"
 * @param payload    Tool dispatch payload
 * @param timeoutMs  Abort after this many milliseconds (default 3000)
 */
export async function proxyToEngine(
  engineUrl: string,
  payload: EnginePayload,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<EngineResult | null> {
  try {
    const url = `${engineUrl}/api/tools/execute?clinic_id=${encodeURIComponent(payload.clinic_id)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    // Cloud Run requires a GCP identity token when allUsers invoker is blocked
    const idToken = await getIdToken(engineUrl);
    if (idToken) headers.Authorization = idToken;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return null;
    return (await response.json()) as EngineResult;
  } catch {
    return null;
  }
}
