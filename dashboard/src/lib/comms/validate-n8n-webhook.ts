/**
 * N8N Webhook Signature Validation (HMAC-SHA256).
 *
 * Validates incoming n8n webhook payloads using HMAC-SHA256 verification.
 * Standard n8n signature format: "v1=<hex_signature>"
 *
 * Environment variable: N8N_COMMS_WEBHOOK_SECRET
 * (set in Vercel / .env.local from n8n webhook settings)
 */

function getN8nWebhookSecret(): string {
  return process.env.N8N_COMMS_WEBHOOK_SECRET ?? "";
}

export async function validateN8nWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  const secret = getN8nWebhookSecret();

  // Fail closed if secret is not configured
  if (!secret || !signature) {
    return false;
  }

  try {
    const encoder = new TextEncoder();

    // Import the secret as an HMAC key
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Sign the payload
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );

    // Convert signature buffer to hex string
    const expected = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Extract hex from signature header (strip "v1=" prefix if present)
    const provided = signature.replace(/^v\d+=/, "");

    // Constant-time comparison to prevent timing attacks
    const expectedBytes = encoder.encode(expected);
    const providedBytes = encoder.encode(provided);

    // Bail if byte lengths differ
    if (expectedBytes.byteLength !== providedBytes.byteLength) {
      return false;
    }

    // Constant-time XOR comparison
    let result = 0;
    for (let i = 0; i < expectedBytes.length; i++) {
      result |= expectedBytes[i] ^ providedBytes[i];
    }

    return result === 0;
  } catch (error) {
    // Log unexpected errors but don't expose details
    console.error("Error validating n8n webhook signature:", error);
    return false;
  }
}

export function isN8nWebhookSecretConfigured(): boolean {
  return !!getN8nWebhookSecret();
}
