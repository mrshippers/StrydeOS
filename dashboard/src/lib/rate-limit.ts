/**
 * In-memory rate limiter for public API endpoints.
 *
 * Uses a Map keyed by IP address with { count, resetAt } entries.
 * A cleanup interval runs every 60s to evict expired entries and prevent
 * unbounded memory growth.
 *
 * Zero external dependencies — pure TypeScript.
 */

import { NextRequest } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 60 seconds
const CLEANUP_INTERVAL_MS = 60_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow the Node process to exit even if the timer is still active
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for may contain a comma-separated list; first entry is the client
    return forwarded.split(",")[0].trim();
  }
  // Vercel also exposes request.ip in some runtimes
  return (request as unknown as { ip?: string }).ip ?? "unknown";
}

export interface RateLimitOptions {
  /** Maximum number of requests allowed within the window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request should be blocked. */
  limited: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
}

/**
 * Check whether a request exceeds the rate limit.
 *
 * Usage:
 * ```ts
 * const { limited, remaining } = checkRateLimit(request, { limit: 5, windowMs: 15 * 60 * 1000 });
 * if (limited) {
 *   return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 * }
 * ```
 */
export function checkRateLimit(
  request: NextRequest,
  options: RateLimitOptions
): RateLimitResult {
  ensureCleanup();

  const ip = getClientIp(request);
  const now = Date.now();
  const entry = store.get(ip);

  // If no entry or window has expired, start a fresh window
  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + options.windowMs });
    return { limited: false, remaining: options.limit - 1 };
  }

  // Increment count within the existing window
  entry.count += 1;

  if (entry.count > options.limit) {
    return { limited: true, remaining: 0 };
  }

  return { limited: false, remaining: options.limit - entry.count };
}
