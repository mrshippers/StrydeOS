/**
 * HMAC-signed session cookie utilities.
 *
 * Uses Web Crypto API so it works in both Edge middleware and Node.js API routes.
 * Cookie format: base64url(payload).base64url(signature)
 * Payload: { uid: string; exp: number }
 */

const SESSION_COOKIE = "__session";
const SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours — matches a clinical workday

interface SessionPayload {
  uid: string;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is required");
  return secret;
}

async function getKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function base64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function signSession(uid: string): Promise<string> {
  const payload: SessionPayload = {
    uid,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };

  const encoder = new TextEncoder();
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));

  const key = await getKey(getSecret());
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));

  return `${payloadB64}.${base64url(signature)}`;
}

export async function verifySession(
  cookieValue: string
): Promise<SessionPayload | null> {
  try {
    const [payloadB64, signatureB64] = cookieValue.split(".");
    if (!payloadB64 || !signatureB64) return null;

    const key = await getKey(getSecret());
    const encoder = new TextEncoder();
    const signatureBytes = base64urlDecode(signatureB64);

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes.buffer as ArrayBuffer,
      encoder.encode(payloadB64)
    );
    if (!valid) return null;

    const payloadBytes = base64urlDecode(payloadB64);
    const payload: SessionPayload = JSON.parse(
      new TextDecoder().decode(payloadBytes)
    );

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE, SESSION_MAX_AGE };
