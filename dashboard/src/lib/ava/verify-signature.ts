/**
 * Shared ElevenLabs webhook signature verification (HMAC-SHA256).
 *
 * Used by:
 * - /api/webhooks/elevenlabs (conversation events)
 * - /api/ava/transfer (tool webhook)
 */

const ELEVENLABS_WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";

export async function verifyElevenLabsSignature(
  body: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!ELEVENLABS_WEBHOOK_SECRET || !signatureHeader) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ELEVENLABS_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // ElevenLabs may send "v0=<hex>" or just "<hex>"
  const provided = signatureHeader.replace(/^v\d+=/, "");
  if (expected.length !== provided.length) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(provided);
  // Constant-time comparison to prevent timing attacks
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export function isWebhookSecretConfigured(): boolean {
  return !!ELEVENLABS_WEBHOOK_SECRET;
}
