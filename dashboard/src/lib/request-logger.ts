/**
 * Structured request logging for API routes.
 *
 * Wraps a route handler to log method, path, status, duration, and clinicId
 * on every request. Designed for request-level observability without replacing
 * Sentry (which handles exceptions).
 *
 * Usage:
 *   import { withRequestLog } from "@/lib/request-logger";
 *
 *   async function handler(request: NextRequest) { ... }
 *   export const POST = withRequestLog(handler);
 */

import { NextRequest, NextResponse } from "next/server";

export interface RequestLogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  clinicId?: string;
  userAgent?: string;
  error?: string;
}

/**
 * Wraps a Next.js route handler with structured request logging.
 * Logs to stdout as JSON for easy parsing by log aggregators.
 */
export function withRequestLog<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  H extends (request: NextRequest, ...args: any[]) => Promise<NextResponse>,
>(handler: H): H {
  const loggedHandler = async function loggedHandler(
    request: NextRequest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...rest: any[]
  ): Promise<NextResponse> {
    const start = performance.now();
    const method = request.method;
    const path = new URL(request.url).pathname;
    const requestId = crypto.randomUUID();
    let status = 500;
    let errorMsg: string | undefined;

    try {
      const response = await handler(request, ...rest);
      status = response.status;
      // Attach correlation ID to response for client-side tracing
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const durationMs = Math.round(performance.now() - start);

      // Best-effort clinicId extraction from common header patterns
      const clinicId =
        request.headers.get("x-clinic-id") ?? undefined;

      const entry: RequestLogEntry = {
        timestamp: new Date().toISOString(),
        requestId,
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
