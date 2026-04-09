/**
 * Tests for N8N webhook signature validation.
 *
 * Uses HMAC-SHA256 with constant-time comparison.
 */

import { describe, it, expect, afterEach } from "vitest";
import { validateN8nWebhookSignature, isN8nWebhookSecretConfigured } from "../validate-n8n-webhook";

describe("validateN8nWebhookSignature", () => {
  // Save original env var
  const originalSecret = process.env.N8N_COMMS_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.N8N_COMMS_WEBHOOK_SECRET = originalSecret;
  });

  it("should return true for valid signature", async () => {
    const secret = "test-webhook-secret";
    process.env.N8N_COMMS_WEBHOOK_SECRET = secret;

    const payload = JSON.stringify({ test: "data" });

    // Manually compute expected signature for this payload
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );
    const expectedHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Test without prefix
    const result1 = await validateN8nWebhookSignature(payload, expectedHex);
    expect(result1).toBe(true);

    // Test with v1= prefix (n8n standard)
    const result2 = await validateN8nWebhookSignature(payload, `v1=${expectedHex}`);
    expect(result2).toBe(true);
  });

  it("should return false for invalid signature", async () => {
    const secret = "test-webhook-secret";
    process.env.N8N_COMMS_WEBHOOK_SECRET = secret;

    const payload = JSON.stringify({ test: "data" });
    const invalidSignature = "0000000000000000000000000000000000000000000000000000000000000000";

    const result = await validateN8nWebhookSignature(payload, invalidSignature);
    expect(result).toBe(false);
  });

  it("should return false if signature header is missing", async () => {
    const secret = "test-webhook-secret";
    process.env.N8N_COMMS_WEBHOOK_SECRET = secret;

    const payload = JSON.stringify({ test: "data" });

    const result = await validateN8nWebhookSignature(payload, "");
    expect(result).toBe(false);
  });

  it("should return false if secret is not configured", async () => {
    delete process.env.N8N_COMMS_WEBHOOK_SECRET;

    const payload = JSON.stringify({ test: "data" });
    const signature = "anyvalidhexstring";

    const result = await validateN8nWebhookSignature(payload, signature);
    expect(result).toBe(false);
  });

  it("should reject mismatched payload", async () => {
    const secret = "test-webhook-secret";
    process.env.N8N_COMMS_WEBHOOK_SECRET = secret;

    const payload1 = JSON.stringify({ test: "data1" });
    const payload2 = JSON.stringify({ test: "data2" });

    // Get valid signature for payload1
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload1)
    );
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Validate against different payload should fail
    const result = await validateN8nWebhookSignature(payload2, signature);
    expect(result).toBe(false);
  });

  it("should handle v0=, v2= prefix formats", async () => {
    const secret = "test-webhook-secret";
    process.env.N8N_COMMS_WEBHOOK_SECRET = secret;

    const payload = JSON.stringify({ test: "data" });

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );
    const expectedHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Test various prefix formats
    const result0 = await validateN8nWebhookSignature(payload, `v0=${expectedHex}`);
    expect(result0).toBe(true);

    const result2 = await validateN8nWebhookSignature(payload, `v2=${expectedHex}`);
    expect(result2).toBe(true);
  });
});

describe("isN8nWebhookSecretConfigured", () => {
  const originalSecret = process.env.N8N_COMMS_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.N8N_COMMS_WEBHOOK_SECRET = originalSecret;
  });

  it("should return true when secret is configured", () => {
    process.env.N8N_COMMS_WEBHOOK_SECRET = "secret-value";
    expect(isN8nWebhookSecretConfigured()).toBe(true);
  });

  it("should return false when secret is not configured", () => {
    delete process.env.N8N_COMMS_WEBHOOK_SECRET;
    expect(isN8nWebhookSecretConfigured()).toBe(false);
  });

  it("should return false when secret is empty string", () => {
    process.env.N8N_COMMS_WEBHOOK_SECRET = "";
    expect(isN8nWebhookSecretConfigured()).toBe(false);
  });
});
