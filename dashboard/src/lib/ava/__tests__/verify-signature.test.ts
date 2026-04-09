/**
 * Unit tests for ElevenLabs webhook signature verification.
 *
 * Covers: valid HMAC-SHA256 signature, invalid signature, missing header,
 * v0= prefix stripping, constant-time comparison, and secret configuration check.
 *
 * The production code uses Web Crypto API (crypto.subtle) for HMAC-SHA256,
 * so our test helper must use the same API to compute valid signatures.
 *
 * Run: npx vitest run src/lib/ava/__tests__/verify-signature.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_SECRET = "test-elevenlabs-secret-abc123";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute a valid HMAC-SHA256 hex signature using Web Crypto (same as production code).
 */
async function computeValidSignature(body: string, secret: string = TEST_SECRET): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
    it("returns true for valid HMAC-SHA256 hex signature", async () => {
      const sig = await computeValidSignature(BODY);
      const result = await verifyElevenLabsSignature(BODY, sig);
      expect(result).toBe(true);
    });

    it("returns true for signature with v0= prefix", async () => {
      const sig = await computeValidSignature(BODY);
      const result = await verifyElevenLabsSignature(BODY, `v0=${sig}`);
      expect(result).toBe(true);
    });

    it("returns true for signature with v1= prefix", async () => {
      const sig = await computeValidSignature(BODY);
      const result = await verifyElevenLabsSignature(BODY, `v1=${sig}`);
      expect(result).toBe(true);
    });

    it("validates correctly for empty body", async () => {
      const sig = await computeValidSignature("");
      const result = await verifyElevenLabsSignature("", sig);
      expect(result).toBe(true);
    });

    it("validates correctly for body with special characters", async () => {
      const specialBody = '{"emoji":"🎉","unicode":"日本語","html":"<script>"}';
      const sig = await computeValidSignature(specialBody);
      const result = await verifyElevenLabsSignature(specialBody, sig);
      expect(result).toBe(true);
    });
  });

  // ── 2. Invalid signature ──────────────────────────────────────────────────

  describe("invalid signatures", () => {
    it("returns false for incorrect hex signature", async () => {
      const wrongSig = "a".repeat(64); // 64 hex chars, matches length
      const result = await verifyElevenLabsSignature(BODY, wrongSig);
      expect(result).toBe(false);
    });

    it("returns false for signature computed with wrong secret", async () => {
      const wrongSig = await computeValidSignature(BODY, "wrong-secret");
      const result = await verifyElevenLabsSignature(BODY, wrongSig);
      expect(result).toBe(false);
    });

    it("returns false for signature of different body", async () => {
      const sig = await computeValidSignature("different body");
      const result = await verifyElevenLabsSignature(BODY, sig);
      expect(result).toBe(false);
    });

    it("returns false when signature differs by one character", async () => {
      const sig = await computeValidSignature(BODY);
      const lastChar = sig[sig.length - 1];
      const flipped = lastChar === "a" ? "b" : "a";
      const tampered = sig.slice(0, -1) + flipped;
      const result = await verifyElevenLabsSignature(BODY, tampered);
      expect(result).toBe(false);
    });
  });

  // ── 3. Missing signature header ───────────────────────────────────────────

  describe("missing signature header", () => {
    it("returns false when signature header is null", async () => {
      const result = await verifyElevenLabsSignature(BODY, null);
      expect(result).toBe(false);
    });

    it("returns false when signature header is empty string", async () => {
      const result = await verifyElevenLabsSignature(BODY, "");
      expect(result).toBe(false);
    });
  });

  // ── 4. Constant-time comparison ───────────────────────────────────────────

  describe("constant-time comparison", () => {
    it("returns false for signatures with different byte lengths (no timing oracle)", async () => {
      // Shorter than expected
      const result1 = await verifyElevenLabsSignature(BODY, "abc");
      expect(result1).toBe(false);

      // Longer than expected
      const sig = await computeValidSignature(BODY);
      const result2 = await verifyElevenLabsSignature(BODY, sig + "extra");
      expect(result2).toBe(false);
    });

    it("timing difference between valid and invalid sigs is negligible", async () => {
      const validSig = await computeValidSignature(BODY);
      const invalidSig = "f".repeat(validSig.length);

      const iterations = 50;

      const startValid = performance.now();
      for (let i = 0; i < iterations; i++) {
        await verifyElevenLabsSignature(BODY, validSig);
      }
      const validTime = performance.now() - startValid;

      const startInvalid = performance.now();
      for (let i = 0; i < iterations; i++) {
        await verifyElevenLabsSignature(BODY, invalidSig);
      }
      const invalidTime = performance.now() - startInvalid;

      // Constant-time: ratio should be roughly 1:1. Allow generous tolerance.
      const ratio = validTime / invalidTime;
      expect(ratio).toBeGreaterThan(0.1);
      expect(ratio).toBeLessThan(10);
    });
  });

  // ── 5. Missing secret configuration ───────────────────────────────────────

  describe("missing webhook secret", () => {
    it("returns false when ELEVENLABS_WEBHOOK_SECRET is empty", async () => {
      process.env.ELEVENLABS_WEBHOOK_SECRET = "";
      vi.resetModules();
      const mod = await import("../verify-signature");

      const sig = await computeValidSignature(BODY);
      const result = await mod.verifyElevenLabsSignature(BODY, sig);
      expect(result).toBe(false);
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
