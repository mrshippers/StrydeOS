/**
 * PMS credential encryption — AES-256-GCM with per-clinic HKDF key derivation.
 *
 * Architecture: Option D (Opus decision)
 * - Master secret: CREDENTIAL_MASTER_SECRET env var (64-char hex = 32 bytes)
 * - Per-clinic key: HMAC-SHA256(masterSecret, "strydeos:credentials:{clinicId}")
 * - Cipher: AES-256-GCM (12-byte IV, 16-byte auth tag)
 * - Wire format: base64("enc:v1:" + iv + authTag + ciphertext)
 *
 * Backward compatible: isEncrypted() detects encrypted vs plaintext values
 * so read paths can auto-decrypt during the migration period.
 */

import { createHmac, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/** Prefix baked into every encrypted blob so isEncrypted() can detect it. */
const ENCRYPTED_PREFIX = "enc:v1:";

const IV_LENGTH = 12; // AES-GCM recommended IV size
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

// ── Key derivation ──────────────────────────────────────────────────────────

/**
 * Reads and validates CREDENTIAL_MASTER_SECRET from the environment.
 * Throws a descriptive error if missing or too short.
 */
export function getMasterSecret(): string {
  const secret = process.env.CREDENTIAL_MASTER_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      "CREDENTIAL_MASTER_SECRET is not set. " +
        "Generate one with: openssl rand -hex 32"
    );
  }
  if (secret.length < 64) {
    throw new Error(
      "CREDENTIAL_MASTER_SECRET must be at least 64 hex characters (32 bytes). " +
        `Current length: ${secret.length}`
    );
  }
  return secret;
}

/**
 * Derive a 256-bit AES key for a specific clinic using HMAC-SHA256.
 *
 *   key = HMAC-SHA256(masterSecret, "strydeos:credentials:{clinicId}")
 *
 * This ensures clinic A's derived key cannot decrypt clinic B's credentials.
 */
export function deriveKey(masterSecret: string, clinicId: string): Buffer {
  return createHmac("sha256", masterSecret)
    .update(`strydeos:credentials:${clinicId}`)
    .digest();
}

// ── Encrypt / Decrypt ───────────────────────────────────────────────────────

/**
 * Encrypt a plaintext credential for a specific clinic.
 *
 * Returns a base64 string prefixed with "enc:v1:" (after decoding) so
 * isEncrypted() can distinguish encrypted from plaintext values.
 */
export function encryptCredential(plaintext: string, clinicId: string): string {
  const masterSecret = getMasterSecret();
  const key = deriveKey(masterSecret, clinicId);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Wire format: prefix + iv + authTag + ciphertext → base64
  const blob = Buffer.concat([
    Buffer.from(ENCRYPTED_PREFIX, "utf8"),
    iv,
    authTag,
    encrypted,
  ]);

  return blob.toString("base64");
}

/**
 * Decrypt a base64-encoded credential for a specific clinic.
 *
 * Throws if the clinicId does not match (AES-GCM auth tag verification fails).
 */
export function decryptCredential(encoded: string, clinicId: string): string {
  const masterSecret = getMasterSecret();
  const key = deriveKey(masterSecret, clinicId);

  const blob = Buffer.from(encoded, "base64");

  // Strip the prefix
  const prefixLen = Buffer.byteLength(ENCRYPTED_PREFIX, "utf8");
  const payload = blob.subarray(prefixLen);

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

// ── Detection ───────────────────────────────────────────────────────────────

/**
 * Detect whether a value is an encrypted credential or plaintext.
 *
 * Checks for the "enc:v1:" prefix inside the base64-decoded blob.
 * Returns false for empty strings and plaintext API keys.
 */
export function isEncrypted(value: string): boolean {
  if (!value || value.length === 0) return false;

  try {
    const decoded = Buffer.from(value, "base64");
    const prefix = decoded.subarray(0, Buffer.byteLength(ENCRYPTED_PREFIX, "utf8")).toString("utf8");
    return prefix === ENCRYPTED_PREFIX;
  } catch {
    return false;
  }
}
