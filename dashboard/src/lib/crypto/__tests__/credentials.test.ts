/**
 * P0 tests for credentials.ts — AES-256-GCM credential encryption with
 * per-clinic HKDF key derivation.
 *
 * Architecture: Option D — HMAC-SHA256(masterSecret, "strydeos:credentials:{clinicId}")
 * derives a unique 256-bit key per clinic. Clinic A's key cannot decrypt clinic B's data.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Provide a valid 64-char hex master secret for all tests
const TEST_MASTER_SECRET = "a".repeat(64);

vi.stubEnv("CREDENTIAL_MASTER_SECRET", TEST_MASTER_SECRET);

const {
  encryptCredential,
  decryptCredential,
  isEncrypted,
  deriveKey,
  getMasterSecret,
} = await import("../credentials");

describe("credentials.ts", () => {
  // ── Round-trip ────────────────────────────────────────────────────────────
  describe("encrypt / decrypt round-trip", () => {
    it("should return the original plaintext after encrypt then decrypt", () => {
      const plaintext = "sk_live_abc123_writeupp_key";
      const clinicId = "clinic_001";

      const encrypted = encryptCredential(plaintext, clinicId);
      const decrypted = decryptCredential(encrypted, clinicId);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle long API keys", () => {
      const plaintext = "x".repeat(512);
      const clinicId = "clinic_long";

      const encrypted = encryptCredential(plaintext, clinicId);
      const decrypted = decryptCredential(encrypted, clinicId);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle empty plaintext", () => {
      const encrypted = encryptCredential("", "clinic_empty");
      const decrypted = decryptCredential(encrypted, "clinic_empty");

      expect(decrypted).toBe("");
    });

    it("should handle plaintext with special characters", () => {
      const plaintext = "key=abc+123/test&foo=bar==";
      const clinicId = "clinic_special";

      const encrypted = encryptCredential(plaintext, clinicId);
      const decrypted = decryptCredential(encrypted, clinicId);

      expect(decrypted).toBe(plaintext);
    });
  });

  // ── Per-clinic isolation ──────────────────────────────────────────────────
  describe("per-clinic key isolation", () => {
    it("should produce different ciphertexts for different clinicIds", () => {
      const plaintext = "same-api-key";

      const encA = encryptCredential(plaintext, "clinic_A");
      const encB = encryptCredential(plaintext, "clinic_B");

      expect(encA).not.toBe(encB);
    });

    it("should fail to decrypt with the wrong clinicId", () => {
      const plaintext = "sk_live_secret";
      const encrypted = encryptCredential(plaintext, "clinic_A");

      // Decrypting with clinic_B's key should throw (AES-GCM auth tag mismatch)
      expect(() => decryptCredential(encrypted, "clinic_B")).toThrow();
    });
  });

  // ── isEncrypted detection ─────────────────────────────────────────────────
  describe("isEncrypted", () => {
    it("should return true for encrypted values", () => {
      const encrypted = encryptCredential("some-key", "clinic_test");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("should return false for plaintext API keys", () => {
      expect(isEncrypted("sk_live_abc123")).toBe(false);
      expect(isEncrypted("cliniko_api_key_here")).toBe(false);
      expect(isEncrypted("")).toBe(false);
    });

    it("should return false for undefined/null-ish values", () => {
      expect(isEncrypted("")).toBe(false);
    });
  });

  // ── deriveKey ─────────────────────────────────────────────────────────────
  describe("deriveKey", () => {
    it("should produce a 32-byte buffer", () => {
      const key = deriveKey(TEST_MASTER_SECRET, "clinic_001");
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it("should produce different keys for different clinicIds", () => {
      const keyA = deriveKey(TEST_MASTER_SECRET, "clinic_A");
      const keyB = deriveKey(TEST_MASTER_SECRET, "clinic_B");

      expect(keyA.equals(keyB)).toBe(false);
    });

    it("should be deterministic — same inputs produce same key", () => {
      const key1 = deriveKey(TEST_MASTER_SECRET, "clinic_X");
      const key2 = deriveKey(TEST_MASTER_SECRET, "clinic_X");

      expect(key1.equals(key2)).toBe(true);
    });
  });

  // ── getMasterSecret validation ────────────────────────────────────────────
  describe("getMasterSecret", () => {
    it("should return the env var value", () => {
      expect(getMasterSecret()).toBe(TEST_MASTER_SECRET);
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────
  describe("error handling", () => {
    it("should throw when CREDENTIAL_MASTER_SECRET is missing", () => {
      const original = process.env.CREDENTIAL_MASTER_SECRET;
      delete process.env.CREDENTIAL_MASTER_SECRET;

      expect(() => getMasterSecret()).toThrow("CREDENTIAL_MASTER_SECRET");

      // Restore for other tests
      process.env.CREDENTIAL_MASTER_SECRET = original;
    });

    it("should throw when CREDENTIAL_MASTER_SECRET is empty", () => {
      const original = process.env.CREDENTIAL_MASTER_SECRET;
      process.env.CREDENTIAL_MASTER_SECRET = "";

      expect(() => getMasterSecret()).toThrow("CREDENTIAL_MASTER_SECRET");

      process.env.CREDENTIAL_MASTER_SECRET = original;
    });

    it("should throw when master secret is too short (< 64 hex chars = 32 bytes)", () => {
      const original = process.env.CREDENTIAL_MASTER_SECRET;
      process.env.CREDENTIAL_MASTER_SECRET = "tooshort";

      expect(() => getMasterSecret()).toThrow();

      process.env.CREDENTIAL_MASTER_SECRET = original;
    });
  });

  // ── Ciphertext uniqueness (random IV) ─────────────────────────────────────
  describe("ciphertext uniqueness", () => {
    it("should produce different ciphertexts for the same plaintext and clinicId (random IV)", () => {
      const enc1 = encryptCredential("same-key", "clinic_001");
      const enc2 = encryptCredential("same-key", "clinic_001");

      // Because each encryption uses a random IV, ciphertexts must differ
      expect(enc1).not.toBe(enc2);
    });
  });
});
