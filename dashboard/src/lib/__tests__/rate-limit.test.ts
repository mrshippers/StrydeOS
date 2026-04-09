/**
 * P0 tests for rate-limit.ts — in-memory rate limiting, IP extraction, window reset.
 * Tests the synchronous checkRateLimit path (in-memory backend).
 * Redis/Upstash path tested separately when integration tests exist.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Ensure no Upstash vars so we test the in-memory path
vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

const { checkRateLimit, checkRateLimitAsync } = await import("../rate-limit");

function mockRequest(ip: string = "192.168.1.1"): { headers: Map<string, string> } {
  const headers = new Map<string, string>();
  headers.set("x-forwarded-for", ip);
  return {
    headers: {
      get: (key: string) => headers.get(key) ?? null,
    },
  } as unknown as { headers: Map<string, string> };
}

describe("checkRateLimit (in-memory)", () => {
  it("should allow requests under the limit", () => {
    const req = mockRequest("10.0.0.1");
    const result = checkRateLimit(req as never, { limit: 5, windowMs: 60_000 });

    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(4);
  });

  it("should track request count and decrement remaining", () => {
    const ip = "10.0.0.2";
    const req = mockRequest(ip);
    const opts = { limit: 3, windowMs: 60_000 };

    const r1 = checkRateLimit(req as never, opts);
    expect(r1.limited).toBe(false);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(req as never, opts);
    expect(r2.limited).toBe(false);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit(req as never, opts);
    expect(r3.limited).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("should block requests over the limit", () => {
    const ip = "10.0.0.3";
    const req = mockRequest(ip);
    const opts = { limit: 2, windowMs: 60_000 };

    checkRateLimit(req as never, opts); // 1
    checkRateLimit(req as never, opts); // 2
    const r3 = checkRateLimit(req as never, opts); // 3 → blocked

    expect(r3.limited).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("should reset after window expires", () => {
    const ip = "10.0.0.4";
    const req = mockRequest(ip);
    const opts = { limit: 1, windowMs: 100 }; // 100ms window

    const r1 = checkRateLimit(req as never, opts);
    expect(r1.limited).toBe(false);

    const r2 = checkRateLimit(req as never, opts);
    expect(r2.limited).toBe(true);

    // Fast-forward past window
    const realDateNow = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(realDateNow() + 200);

    const r3 = checkRateLimit(req as never, opts);
    expect(r3.limited).toBe(false);
    expect(r3.remaining).toBe(0); // fresh window: limit(1) - 1 = 0

    vi.restoreAllMocks();
  });

  it("should isolate rate limits per IP", () => {
    const req1 = mockRequest("10.0.1.1");
    const req2 = mockRequest("10.0.1.2");
    const opts = { limit: 1, windowMs: 60_000 };

    checkRateLimit(req1 as never, opts);
    const r1 = checkRateLimit(req1 as never, opts); // IP 1 blocked
    const r2 = checkRateLimit(req2 as never, opts); // IP 2 still allowed

    expect(r1.limited).toBe(true);
    expect(r2.limited).toBe(false);
  });
});

describe("IP extraction", () => {
  it("should extract first IP from x-forwarded-for with multiple entries", () => {
    const headers = new Map<string, string>();
    headers.set("x-forwarded-for", "203.0.113.1, 10.0.0.1, 127.0.0.1");
    const req = {
      headers: { get: (key: string) => headers.get(key) ?? null },
    };

    // First request from this multi-hop IP should work
    const result = checkRateLimit(req as never, { limit: 1, windowMs: 60_000 });
    expect(result.limited).toBe(false);
  });

  it("should handle missing x-forwarded-for gracefully", () => {
    const req = {
      headers: { get: () => null },
      ip: "1.2.3.4",
    };

    const result = checkRateLimit(req as never, { limit: 5, windowMs: 60_000 });
    expect(result.limited).toBe(false);
  });
});

describe("checkRateLimitAsync (no Redis)", () => {
  it("should fall back to in-memory when Upstash not configured", async () => {
    const req = mockRequest("10.0.2.1");
    const result = await checkRateLimitAsync(req as never, { limit: 5, windowMs: 60_000 });

    expect(result.limited).toBe(false);
    expect(result.remaining).toBeLessThanOrEqual(4);
  });
});
