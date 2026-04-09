/**
 * P0 tests for session.ts — HMAC-signed session cookie utilities.
 * These test the core auth primitive: sign → verify round-trip,
 * expiry enforcement, tamper detection, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must set SESSION_SECRET before importing session module
vi.stubEnv("SESSION_SECRET", "test-secret-must-be-at-least-32-chars-long-for-security");

const { signSession, verifySession, SESSION_COOKIE, SESSION_MAX_AGE } = await import("../session");

describe("session.ts", () => {
  describe("exports", () => {
    it("should export signSession function", () => {
      expect(typeof signSession).toBe("function");
    });

    it("should export verifySession function", () => {
      expect(typeof verifySession).toBe("function");
    });

    it("should export SESSION_COOKIE as '__session'", () => {
      expect(SESSION_COOKIE).toBe("__session");
    });

    it("should export SESSION_MAX_AGE as 8 hours in seconds", () => {
      expect(SESSION_MAX_AGE).toBe(8 * 60 * 60);
    });
  });

  describe("signSession + verifySession round-trip", () => {
    it("should sign and verify a valid session", async () => {
      const cookie = await signSession("user-123");
      const payload = await verifySession(cookie);

      expect(payload).not.toBeNull();
      expect(payload!.uid).toBe("user-123");
      expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it("should include session version when provided", async () => {
      const cookie = await signSession("user-456", 3);
      const payload = await verifySession(cookie);

      expect(payload).not.toBeNull();
      expect(payload!.uid).toBe("user-456");
      expect(payload!.v).toBe(3);
    });

    it("should not include v field when session version is undefined", async () => {
      const cookie = await signSession("user-789");
      const payload = await verifySession(cookie);

      expect(payload).not.toBeNull();
      expect(payload!.v).toBeUndefined();
    });

    it("should produce cookie in format: base64url.base64url", async () => {
      const cookie = await signSession("user-test");
      const parts = cookie.split(".");

      expect(parts).toHaveLength(2);
      // Both parts should be base64url (no +, /, or = padding)
      for (const part of parts) {
        expect(part).not.toMatch(/[+/=]/);
      }
    });
  });

  describe("tamper detection", () => {
    it("should reject a cookie with modified payload", async () => {
      const cookie = await signSession("user-legit");
      const [, signature] = cookie.split(".");

      // Create a different payload
      const fakePayload = btoa(JSON.stringify({ uid: "user-evil", exp: 9999999999 }))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      const tampered = `${fakePayload}.${signature}`;
      const result = await verifySession(tampered);

      expect(result).toBeNull();
    });

    it("should reject a cookie with modified signature", async () => {
      const cookie = await signSession("user-legit");
      const [payload] = cookie.split(".");

      // Flip a character in the signature
      const tampered = `${payload}.AAAA_fake_signature_AAAA`;
      const result = await verifySession(tampered);

      expect(result).toBeNull();
    });

    it("should reject a completely random string", async () => {
      const result = await verifySession("not-a-real-cookie-at-all");
      expect(result).toBeNull();
    });
  });

  describe("malformed input", () => {
    it("should reject empty string", async () => {
      const result = await verifySession("");
      expect(result).toBeNull();
    });

    it("should reject cookie with no dot separator", async () => {
      const result = await verifySession("nodothere");
      expect(result).toBeNull();
    });

    it("should reject cookie with only payload (no signature)", async () => {
      const result = await verifySession("payload.");
      expect(result).toBeNull();
    });
  });

  describe("expiry enforcement", () => {
    it("should reject an expired session", async () => {
      // Sign a session, then fast-forward time past expiry
      const cookie = await signSession("user-expired");

      // Verify it's valid now
      const validNow = await verifySession(cookie);
      expect(validNow).not.toBeNull();

      // Mock Date.now to be 9 hours in the future (past 8hr TTL)
      const realDateNow = Date.now;
      vi.spyOn(Date, "now").mockReturnValue(realDateNow() + 9 * 60 * 60 * 1000);

      const expired = await verifySession(cookie);
      expect(expired).toBeNull();

      vi.restoreAllMocks();
    });
  });
});
