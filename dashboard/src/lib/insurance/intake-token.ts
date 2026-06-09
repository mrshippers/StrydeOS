/**
 * Secure intake-link tokens.
 *
 * A patient reaches the insurance form via a tokenised URL. The token is an
 * HMAC-signed `body.sig` pair (JWT-lite) carrying { clinicId, linkId, exp }.
 * The signing key is derived from the existing CREDENTIAL_MASTER_SECRET with a
 * distinct label, so no new secret needs provisioning. `nowMs` is passed in so
 * verification is deterministic and unit-testable.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getMasterSecret } from "@/lib/crypto/credentials";

export interface IntakeTokenPayload {
  clinicId: string;
  linkId: string;
  /** Expiry as epoch milliseconds. */
  exp: number;
}

function signingKey(): Buffer {
  return createHmac("sha256", getMasterSecret())
    .update("strydeos:intake-link")
    .digest();
}

function hmac(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export function signIntakeToken(payload: IntakeTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyIntakeToken(token: string, nowMs: number): IntakeTokenPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = hmac(body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: IntakeTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.clinicId !== "string" ||
    typeof payload.linkId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (nowMs > payload.exp) return null;

  return payload;
}
