/**
 * Proxy helper — forwards Ava tool calls to the Python execution engine.
 *
 * Returns the engine result on success, null on any failure (timeout, network
 * error, non-200 response). Null signals the caller to fall back to the
 * TypeScript PMS adapters.
 */

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

/**
 * POST `payload` to `${engineUrl}/api/tools/execute` and return the parsed
 * response, or null if the engine is unreachable / slow / returns an error.
 *
 * @param engineUrl  Base URL of the Python service, e.g. "http://localhost:8000"
 * @param payload    Tool dispatch payload
 * @param timeoutMs  Abort after this many milliseconds (default 3000 — sized for live phone calls)
 */
export async function proxyToEngine(
  engineUrl: string,
  payload: EnginePayload,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<EngineResult | null> {
  try {
    const response = await fetch(`${engineUrl}/api/tools/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as EngineResult;
  } catch {
    return null;
  }
}
