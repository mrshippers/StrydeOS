/**
 * Structured request logging for API routes.
 *
 * Wraps a route handler to log method, path, status, duration, clinicId,
 * and trace context on every request. Designed for request-level
 * observability without replacing Sentry (which handles exceptions).
 *
 * Trace propagation: every wrapped handler runs inside an
 * AsyncLocalStorage<TraceContext> so any downstream Firestore writer can
 * call `getTrace()` and stamp the same traceId on its docs. Lets a single
 * Firestore query reconstruct a call → insight_event → comms_log chain.
 *
 * PII scrubbing: log entries that include arbitrary metadata go through
 * `scrubPII()` against the contracts/index.ts PII_FIELD_MAP before being
 * written to stdout, so GDPR-sensitive fields (phone, transcripts, free-text
 * NPS replies) never reach the log aggregator unmasked.
 *
 * Usage:
 *   import { withRequestLog, getTrace } from "@/lib/request-logger";
 *
 *   async function handler(request: NextRequest) { ... }
 *   export const POST = withRequestLog(handler, { producer: "ava" });
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest, NextResponse } from "next/server";

import {
  makeRootTrace,
  PII_FIELD_MAP,
  type PIIClass,
  type Producer,
  type TraceContext,
} from "@/lib/contracts";

export interface RequestLogEntry {
  timestamp: string;
  requestId: string;
  /** W3C-compatible trace id; same as requestId at the root span. */
  traceId: string;
  /** Producer that owns this request entry-point (for trace attribution). */
  producer?: Producer;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  clinicId?: string;
  userAgent?: string;
  error?: string;
}

const traceStore = new AsyncLocalStorage<TraceContext>();

/**
 * Returns the TraceContext for the current request, if the handler is
 * running inside `withRequestLog`. Use to stamp `trace` on Firestore
 * writes so the call→insight_event→comms_log chain can be reconstructed.
 */
export function getTrace(): TraceContext | undefined {
  return traceStore.getStore();
}

/**
 * Mask any object field that PII_FIELD_MAP marks as `phi` or `pii`. Direct
 * identifiers (`pii-ref` like patientId / conversationId) are kept — log
 * aggregators need them for correlation. Returns a shallow copy; never
 * mutates the input.
 */
export function scrubPII<T extends Record<string, unknown>>(
  obj: T,
  mapName: keyof typeof PII_FIELD_MAP
): T {
  const map = PII_FIELD_MAP[mapName] as Record<string, PIIClass>;
  const scrubbed: Record<string, unknown> = { ...obj };
  for (const [key, klass] of Object.entries(map)) {
    if (key in scrubbed && (klass === "phi" || klass === "pii")) {
      scrubbed[key] = "[REDACTED]";
    }
  }
  return scrubbed as T;
}

/**
 * Derive the producer string from a request URL pathname. Used as a
 * fallback when the caller of `withRequestLog` didn't specify one.
 */
function inferProducer(path: string): Producer {
  if (path.startsWith("/api/webhooks/elevenlabs")) return "ava";
  if (path.startsWith("/api/ava")) return "ava";
  if (path.startsWith("/api/intelligence")) return "intelligence";
  if (path.startsWith("/api/n8n")) return "n8n";
  if (path.startsWith("/api/comms")) return "pulse";
  if (path.startsWith("/api/webhooks/twilio")) return "pulse";
  if (path.startsWith("/api/webhooks/resend")) return "pulse";
  if (path.startsWith("/api/webhooks/writeupp")) return "pipeline";
  if (path.startsWith("/api/pms")) return "pipeline";
  if (path.startsWith("/api/onboarding")) return "onboarding";
  return "pipeline";
}

/**
 * Wraps a Next.js route handler with structured request logging and a
 * request-scoped TraceContext. Logs to stdout as JSON for easy parsing
 * by log aggregators.
 *
 * @param handler  the underlying route handler
 * @param options.producer  override the auto-inferred producer name
 */
export function withRequestLog<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  H extends (request: NextRequest, ...args: any[]) => Promise<NextResponse>,
>(handler: H, options?: { producer?: Producer }): H {
  const loggedHandler = async function loggedHandler(
    request: NextRequest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...rest: any[]
  ): Promise<NextResponse> {
    const start = performance.now();
    const method = request.method;
    const path = new URL(request.url).pathname;
    const producer = options?.producer ?? inferProducer(path);
    const trace = makeRootTrace(producer);
    // Use the trace id as the request id so downstream stamps are
    // self-correlated with log entries.
    const requestId = trace.traceId;
    let status = 500;
    let errorMsg: string | undefined;

    let response: NextResponse | undefined;
    try {
      response = await traceStore.run(trace, () => handler(request, ...rest));
      status = response.status;
      // Attach correlation IDs to response for client-side tracing
      response.headers.set("x-request-id", requestId);
      response.headers.set("x-trace-id", trace.traceId);
      return response;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const durationMs = Math.round(performance.now() - start);

      const clinicId =
        response?.headers.get("x-clinic-id") ??
        request.headers.get("x-clinic-id") ??
        undefined;

      const entry: RequestLogEntry = {
        timestamp: new Date().toISOString(),
        requestId,
        traceId: trace.traceId,
        producer,
        method,
        path,
        status,
        durationMs,
        ...(clinicId ? { clinicId } : {}),
        userAgent: request.headers.get("user-agent")?.slice(0, 120) ?? undefined,
        ...(errorMsg ? { error: errorMsg } : {}),
      };

      // Single-line JSON for log aggregator compatibility
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    }
  };

  return loggedHandler as H;
}
