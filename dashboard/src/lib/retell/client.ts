/**
 * Retell AI REST API client — thin wrapper over the v2 API.
 *
 * Uses RETELL_API_KEY (server-side only — never expose to client).
 * All methods throw on non-2xx responses with a typed RetellError.
 */

const RETELL_API_BASE = "https://api.retellai.com";
// TODO: set RETELL_API_KEY in .env.local / Vercel / Railway environment vars
const API_KEY = process.env.RETELL_API_KEY;

export class RetellError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "RetellError";
  }
}

async function retellFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_KEY) {
    throw new RetellError(500, "RETELL_API_KEY is not set");
  }

  const res = await fetch(`${RETELL_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new RetellError(res.status, `Retell API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetellAgent {
  agent_id: string;
  agent_name: string;
  voice_id: string;
  language: string;
  response_engine: { type: string; llm_id?: string };
  created_timestamp: number;
  last_modification_timestamp: number;
}

export interface RetellCall {
  call_id: string;
  agent_id: string;
  call_status: "registered" | "ongoing" | "ended" | "error";
  call_type: "phone_call" | "web_call";
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  from_number?: string;
  to_number?: string;
  metadata?: Record<string, unknown>;
  transcript?: string;
  transcript_object?: RetellTranscriptSegment[];
  call_analysis?: RetellCallAnalysis;
  recording_url?: string;
  disconnection_reason?: string;
}

export interface RetellTranscriptSegment {
  role: "agent" | "user";
  content: string;
  words: Array<{ word: string; start: number; end: number }>;
}

export interface RetellCallAnalysis {
  call_summary?: string;
  user_sentiment?: "Negative" | "Neutral" | "Positive" | "Unknown";
  agent_sentiment?: "Negative" | "Neutral" | "Positive" | "Unknown";
  call_successful?: boolean;
  in_voicemail?: boolean;
  custom_analysis_data?: Record<string, unknown>;
}

export interface RetellWebhookEvent {
  event:
    | "call_started"
    | "call_ended"
    | "call_analyzed"
    | "phone_number_registered";
  call: RetellCall;
}

// ─── Agent methods ────────────────────────────────────────────────────────────

export async function getAgent(agentId: string): Promise<RetellAgent> {
  return retellFetch<RetellAgent>(`/v2/get-agent/${agentId}`);
}

export async function listAgents(): Promise<RetellAgent[]> {
  return retellFetch<RetellAgent[]>("/v2/list-agent");
}

// ─── Call methods ─────────────────────────────────────────────────────────────

export async function getCall(callId: string): Promise<RetellCall> {
  return retellFetch<RetellCall>(`/v2/get-call/${callId}`);
}

export async function listCalls(opts?: {
  agentId?: string;
  limit?: number;
  paginationKey?: string;
}): Promise<RetellCall[]> {
  const params = new URLSearchParams();
  if (opts?.agentId) params.set("agent_id", opts.agentId);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.paginationKey) params.set("pagination_key", opts.paginationKey);
  const qs = params.toString();
  return retellFetch<RetellCall[]>(`/v2/list-calls${qs ? `?${qs}` : ""}`);
}

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Retell signs webhooks with HMAC-SHA256 using the API key as secret.
 * Pass the raw request body (string) and the x-retell-signature header value.
 * Returns true if the signature is valid.
 *
 * Note: crypto.subtle is available in Next.js edge/Node environments.
 */
export async function verifyRetellWebhook(
  rawBody: string,
  signature: string | null
): Promise<boolean> {
  if (!API_KEY || !signature) return false;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(API_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = Buffer.from(signature, "hex");
    return crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(rawBody));
  } catch {
    return false;
  }
}
