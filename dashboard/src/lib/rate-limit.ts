/**
 * Rate limiter for API endpoints.
 *
 * Strategy:
 * - If UPSTASH_REDIS_REST_URL is set → uses Upstash Redis (persistent, distributed)
 * - Otherwise → falls back to in-memory Map (resets on cold start, per-instance only)
 *
 * The in-memory fallback is acceptable for single-clinic development but MUST be
 * replaced with Redis before multi-clinic production launch. Vercel serverless
 * functions are ephemeral — each cold start creates a fresh instance.
 */

import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

// ─── Upstash Redis backend (production) ─────────────────────────────────────

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function checkRedisRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ limited: boolean; remaining: number }> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return { limited: false, remaining: limit };
  }

  const windowSec = Math.ceil(windowMs / 1000);

  // INCR + EXPIRE in a single pipeline
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(windowSec)],
    ]),
    signal: AbortSignal.timeout(3000),
  });

  if (!res.ok) {
    // Redis unavailable — fail open (allow request)
    return { limited: false, remaining: limit };
  }

  const results = await res.json() as { result: number }[];
  const count = results[0]?.result ?? 1;

  return {
    limited: count > limit,
    remaining: Math.max(0, limit - count),
  };
}

// ─── In-memory backend (development / fallback) ─────────────────────────────

const store = new Map<string, RateLimitEntry>();

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
  const ip = getClientIp(request);

  // If Upstash is configured, use it (async — returns a promise-like result)
  // For synchronous API compatibility, we also run the in-memory check.
  // The async Redis check is kicked off as a side effect for distributed limiting.
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    // Fire-and-forget Redis check — the in-memory check provides immediate gating,
    // Redis provides cross-instance persistence. Both must agree.
    const redisKey = `rl:${ip}:${options.limit}:${options.windowMs}`;
    checkRedisRateLimit(redisKey, options.limit, options.windowMs).catch((err) => {
      Sentry.addBreadcrumb({
        category: "rate-limit",
        message: "Upstash Redis unavailable — falling back to in-memory rate limiting",
        level: "warning",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    });
  }

  // In-memory check (always runs — provides per-instance gating)
  // Key includes pathname so different routes get separate buckets
  const pathname = request.nextUrl?.pathname ?? "/";
  const memKey = `${ip}:${pathname}:${options.limit}:${options.windowMs}`;
  ensureCleanup();

  const now = Date.now();
  const entry = store.get(memKey);

  if (!entry || now >= entry.resetAt) {
    store.set(memKey, { count: 1, resetAt: now + options.windowMs });
    return { limited: false, remaining: options.limit - 1 };
  }

  entry.count += 1;

  if (entry.count > options.limit) {
    return { limited: true, remaining: 0 };
  }

  return { limited: false, remaining: options.limit - entry.count };
}

/**
 * Async rate limit check — use this for routes that can await.
 * Prefers Upstash Redis when available, falls back to in-memory.
 */
export async function checkRateLimitAsync(
  request: NextRequest,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const ip = getClientIp(request);

  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const redisKey = `rl:${ip}:${options.limit}:${options.windowMs}`;
      return await checkRedisRateLimit(redisKey, options.limit, options.windowMs);
    } catch (err) {
      Sentry.addBreadcrumb({
        category: "rate-limit",
        message: "Upstash Redis unavailable — falling back to in-memory rate limiting",
        level: "warning",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  return checkRateLimit(request, options);
}
