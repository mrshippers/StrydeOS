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
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(provided);
  // Constant-time comparison — bail if byte lengths differ
  if (a.byteLength !== b.byteLength) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export function isWebhookSecretConfigured(): boolean {
  return !!ELEVENLABS_WEBHOOK_SECRET;
}
