/**
 * Shared ElevenLabs webhook signature verification (HMAC-SHA256).
 *
 * Used by:
 * - /api/webhooks/elevenlabs (conversation events)
 * - /api/ava/transfer (tool webhook)
 */

// Never wrap this value in quotes when setting it on Vercel/envs — it's
// used as an HMAC-SHA256 key verbatim, so a stray " in the stored value
// silently breaks every webhook signature check.
const ELEVENLABS_WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";

/**
 * Verify an ElevenLabs webhook request.
 *
 * @param rawBody         - The raw request body string (read before any JSON.parse).
 * @param signatureHeader - The full `ElevenLabs-Signature` header value,
 *                          format: `t=<timestamp>,v0=<hex_hmac>`.
 *
 * ElevenLabs constructs the signed payload as `${timestamp}.${rawBody}` where
 * `timestamp` is the `t=` field from the header. Signing just the raw body
 * (without the timestamp prefix) will always produce a mismatch.
 */
export async function verifyElevenLabsSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!ELEVENLABS_WEBHOOK_SECRET || !signatureHeader) return false;

  // Parse t=<timestamp> and v0=<hex> from the header.
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const idx = p.indexOf("=");
      return [p.slice(0, idx), p.slice(idx + 1)] as [string, string];
    })
  );
  const timestamp = parts["t"];
  const received = parts["v0"];
  if (!timestamp || !received) return false;

  // ElevenLabs HMAC payload is `${timestamp}.${rawBody}`.
  const payload = `${timestamp}.${rawBody}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ELEVENLABS_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison — bail if byte lengths differ.
  const a = encoder.encode(expected);
  const bBytes = encoder.encode(received);
  if (a.byteLength !== bBytes.byteLength) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ bBytes[i];
  }
  return result === 0;
}

export function isWebhookSecretConfigured(): boolean {
  return !!ELEVENLABS_WEBHOOK_SECRET;
}
