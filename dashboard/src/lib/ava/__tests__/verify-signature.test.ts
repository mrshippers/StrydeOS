/**
 * Unit tests for ElevenLabs webhook signature verification.
 *
 * ElevenLabs signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends the
 * result as an `ElevenLabs-Signature: t=<timestamp>,v0=<hex>` header. The
 * production code (verify-signature.ts) verifies exactly that, so these tests
 * construct headers in the same format.
 *
 * Run: npx vitest run src/lib/ava/__tests__/verify-signature.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_SECRET = "test-elevenlabs-secret-abc123";
// Fresh timestamp (current second) — the verifier now enforces a +/-5min replay
// window, so a hardcoded 2023 timestamp would be rejected as stale. Tests that
// specifically exercise the window pin their own timestamps.
const TS = Math.floor(Date.now() / 1000).toString();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Bare HMAC-SHA256 hex of `payload` (Web Crypto, same as production). */
async function hmacHex(payload: string, secret: string = TEST_SECRET): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build a valid `t=<ts>,v0=<hex>` header for `body` (signs `${ts}.${body}`). */
async function signHeader(
  body: string,
  secret: string = TEST_SECRET,
  ts: string = TS,
): Promise<string> {
  const hex = await hmacHex(`${ts}.${body}`, secret);
  return `t=${ts},v0=${hex}`;
}

// ── Dynamic import setup (module captures env at load time) ──────────────────

let verifyElevenLabsSignature: (body: string, signatureHeader: string | null) => Promise<boolean>;
let isWebhookSecretConfigured: () => boolean;

beforeEach(async () => {
  process.env.ELEVENLABS_WEBHOOK_SECRET = TEST_SECRET;
  vi.resetModules();

  const mod = await import("../verify-signature");
  verifyElevenLabsSignature = mod.verifyElevenLabsSignature;
  isWebhookSecretConfigured = mod.isWebhookSecretConfigured;
});

// ── Tests ────────────────────────────────────────────────────────────────────

const BODY = JSON.stringify({ event: "conversation.completed", data: { id: "conv-1" } });

describe("verifyElevenLabsSignature", () => {
  // ── 1. Valid signature ────────────────────────────────────────────────────

  describe("valid signatures", () => {
    it("returns true for a valid t=,v0= signature", async () => {
      const header = await signHeader(BODY);
      expect(await verifyElevenLabsSignature(BODY, header)).toBe(true);
    });

    it("validates correctly for empty body", async () => {
      const header = await signHeader("");
      expect(await verifyElevenLabsSignature("", header)).toBe(true);
    });

    it("validates correctly for body with special characters", async () => {
      const specialBody = '{"emoji":"🎉","unicode":"日本語","html":"<script>"}';
      const header = await signHeader(specialBody);
      expect(await verifyElevenLabsSignature(specialBody, header)).toBe(true);
    });
  });

  // ── 2. Malformed header (real scheme requires both t= and v0=) ─────────────

  describe("malformed header", () => {
    it("returns false when the t= timestamp is missing", async () => {
      const hex = await hmacHex(`${TS}.${BODY}`);
      expect(await verifyElevenLabsSignature(BODY, `v0=${hex}`)).toBe(false);
    });

    it("returns false when v0= is missing", async () => {
      expect(await verifyElevenLabsSignature(BODY, `t=${TS}`)).toBe(false);
    });

    it("returns false for a bare hex signature with no fields", async () => {
      const hex = await hmacHex(`${TS}.${BODY}`);
      expect(await verifyElevenLabsSignature(BODY, hex)).toBe(false);
    });
  });

  // ── 3. Invalid signature ──────────────────────────────────────────────────

  describe("invalid signatures", () => {
    it("returns false for an incorrect hex in a well-formed header", async () => {
      expect(await verifyElevenLabsSignature(BODY, `t=${TS},v0=${"a".repeat(64)}`)).toBe(false);
    });

    it("returns false for a signature computed with the wrong secret", async () => {
      const header = await signHeader(BODY, "wrong-secret");
      expect(await verifyElevenLabsSignature(BODY, header)).toBe(false);
    });

    it("returns false for a signature of a different body", async () => {
      const header = await signHeader("different body");
      expect(await verifyElevenLabsSignature(BODY, header)).toBe(false);
    });

    it("returns false when the timestamp prefix differs", async () => {
      // Signed for TS but presented with a different t= → payload mismatch.
      const hex = await hmacHex(`${TS}.${BODY}`);
      expect(await verifyElevenLabsSignature(BODY, `t=1700000999,v0=${hex}`)).toBe(false);
    });

    it("returns false when the signature differs by one character", async () => {
      const header = await signHeader(BODY);
      const lastChar = header[header.length - 1];
      const flipped = lastChar === "a" ? "b" : "a";
      const tampered = header.slice(0, -1) + flipped;
      expect(await verifyElevenLabsSignature(BODY, tampered)).toBe(false);
    });
  });

  // ── 4. Missing signature header ───────────────────────────────────────────

  describe("missing signature header", () => {
    it("returns false when signature header is null", async () => {
      expect(await verifyElevenLabsSignature(BODY, null)).toBe(false);
    });

    it("returns false when signature header is empty string", async () => {
      expect(await verifyElevenLabsSignature(BODY, "")).toBe(false);
    });
  });

  // ── 5. Constant-time comparison ───────────────────────────────────────────

  describe("constant-time comparison", () => {
    it("returns false for v0 values with different byte lengths (no timing oracle)", async () => {
      // Too short
      expect(await verifyElevenLabsSignature(BODY, `t=${TS},v0=abc`)).toBe(false);
      // Too long
      const hex = await hmacHex(`${TS}.${BODY}`);
      expect(await verifyElevenLabsSignature(BODY, `t=${TS},v0=${hex}extra`)).toBe(false);
    });

    it("timing difference between valid and invalid sigs is negligible", async () => {
      const validHeader = await signHeader(BODY);
      const invalidHeader = `t=${TS},v0=${"f".repeat(64)}`;

      const iterations = 50;

      const startValid = performance.now();
      for (let i = 0; i < iterations; i++) {
        await verifyElevenLabsSignature(BODY, validHeader);
      }
      const validTime = performance.now() - startValid;

      const startInvalid = performance.now();
      for (let i = 0; i < iterations; i++) {
        await verifyElevenLabsSignature(BODY, invalidHeader);
      }
      const invalidTime = performance.now() - startInvalid;

      // Constant-time: ratio should be roughly 1:1. Allow generous tolerance.
      const ratio = validTime / invalidTime;
      expect(ratio).toBeGreaterThan(0.1);
      expect(ratio).toBeLessThan(10);
    });
  });

  // ── 6. Replay / timestamp freshness window (P0-10) ─────────────────────────

  describe("replay window", () => {
    it("rejects a validly-signed but stale timestamp (> 5 min old)", async () => {
      const staleTs = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 min ago
      const header = await signHeader(BODY, TEST_SECRET, staleTs);
      // HMAC is correct for this payload, but the timestamp is outside the window.
      expect(await verifyElevenLabsSignature(BODY, header)).toBe(false);
    });

    it("rejects a validly-signed future timestamp (> 5 min ahead)", async () => {
      const futureTs = (Math.floor(Date.now() / 1000) + 600).toString();
      const header = await signHeader(BODY, TEST_SECRET, futureTs);
      expect(await verifyElevenLabsSignature(BODY, header)).toBe(false);
    });

    it("accepts a fresh timestamp within the window", async () => {
      const freshTs = (Math.floor(Date.now() / 1000) - 30).toString(); // 30s ago
      const header = await signHeader(BODY, TEST_SECRET, freshTs);
      expect(await verifyElevenLabsSignature(BODY, header)).toBe(true);
    });

    it("honours an explicit larger maxAgeSeconds override", async () => {
      const staleTs = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 min ago
      const header = await signHeader(BODY, TEST_SECRET, staleTs);
      // Default window rejects; an explicit 1200s window accepts the same sig.
      expect(await verifyElevenLabsSignature(BODY, header)).toBe(false);
      expect(await verifyElevenLabsSignature(BODY, header, 1200)).toBe(true);
    });

    it("rejects a non-numeric timestamp", async () => {
      const hex = await hmacHex(`notanumber.${BODY}`);
      expect(await verifyElevenLabsSignature(BODY, `t=notanumber,v0=${hex}`)).toBe(false);
    });
  });

  // ── 7. Missing secret configuration ───────────────────────────────────────

  describe("missing webhook secret", () => {
    it("returns false when ELEVENLABS_WEBHOOK_SECRET is empty", async () => {
      process.env.ELEVENLABS_WEBHOOK_SECRET = "";
      vi.resetModules();
      const mod = await import("../verify-signature");

      const header = await signHeader(BODY);
      expect(await mod.verifyElevenLabsSignature(BODY, header)).toBe(false);
    });
  });
});

describe("isWebhookSecretConfigured", () => {
  it("returns true when ELEVENLABS_WEBHOOK_SECRET is set", () => {
    expect(isWebhookSecretConfigured()).toBe(true);
  });

  it("returns false when ELEVENLABS_WEBHOOK_SECRET is empty", async () => {
    process.env.ELEVENLABS_WEBHOOK_SECRET = "";
    vi.resetModules();
    const mod = await import("../verify-signature");
    expect(mod.isWebhookSecretConfigured()).toBe(false);
  });
});
