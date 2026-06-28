/**
 * Proxy helper — forwards Ava tool calls to the Python execution engine.
 *
 * Returns the engine result on success. On failure it distinguishes two cases:
 *   - null            — a HARD failure (non-200, connection refused, JSON error,
 *                       generic abort). The engine definitely did not act, so the
 *                       caller may safely release any booking claim and fall back
 *                       to the TypeScript PMS adapters.
 *   - ENGINE_TIMEOUT  — the live-call abort timer fired. This is UNCERTAIN: the
 *                       engine may already have committed the PMS booking before
 *                       we stopped waiting. The caller must NOT release-and-retry
 *                       a booking, or it risks double-booking a slow-but-
 *                       successful engine.
 *
 * Also exposes the booking idempotency primitives (claimBooking / settleBooking
 * / releaseBooking) and the shared E.164 phone normaliser (normalizePhoneE164)
 * so both the engine path and the TS-fallback path derive an identical booking
 * claim key and cannot double-book a real patient.
 */

import * as crypto from "crypto";
import { GoogleAuth, type IdTokenClient } from "google-auth-library";
import type { Firestore } from "firebase-admin/firestore";

export interface EnginePayload {
  tool_name: string;
  tool_input: Record<string, unknown>;
  clinic_id: string;
  pms_type: string;
  api_key: string;
  base_url?: string;
}

export interface EngineResult {
  result: string;
  booking_id?: string;
  slots?: string[];
}

// Live phone-call path — ElevenLabs holds the conversation turn open while we
// wait. 3s is the upper bound before the caller hears uncomfortable dead air.
// A hard failure falls through to the TS PMS adapters (null); a timeout is
// uncertain and is signalled distinctly (ENGINE_TIMEOUT) so a booking is held
// rather than retried into a double-book.
const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * Distinct sentinel for "the engine did not answer in time, but it MAY already
 * have committed the booking". Distinguishes an uncertain timeout from a hard
 * failure (null) so the booking caller can hold the claim instead of releasing
 * it and letting the TS fallback create a second appointment.
 */
export const ENGINE_TIMEOUT = Symbol("engine_timeout");

/**
 * Normalise a phone number to E.164 (UK default) so the engine path and the TS
 * path derive an identical booking claim key for the same caller. A national
 * `0...` number and its `+44...` form must collapse to one key, or they cannot
 * dedup against each other. Returns "" for empty input.
 */
export function normalizePhoneE164(raw: string): string {
  const phone = (raw ?? "").trim();
  if (!phone) return "";
  if (phone.startsWith("0")) return `+44${phone.slice(1)}`;
  if (phone.startsWith("+")) return phone;
  return `+${phone}`;
}

// Module-level cache — IdTokenClient reuses the token until expiry (~1hr)
let _idTokenClient: IdTokenClient | null = null;
let _idTokenClientAudience = "";

async function getIdToken(audience: string): Promise<string | null> {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;

  try {
    if (!_idTokenClient || _idTokenClientAudience !== audience) {
      const auth = new GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
      });
      _idTokenClient = await auth.getIdTokenClient(audience);
      _idTokenClientAudience = audience;
    }
    const rawHeaders = await _idTokenClient.getRequestHeaders();
    const authHeader =
      typeof (rawHeaders as Headers).get === "function"
        ? (rawHeaders as Headers).get("Authorization")
        : (rawHeaders as unknown as Record<string, string>).Authorization ?? null;
    return authHeader ?? null;
  } catch {
    return null;
  }
}

/**
 * POST `payload` to `${engineUrl}/api/tools/execute` and return the parsed
 * response, or null if the engine is unreachable / slow / returns an error.
 *
 * clinic_id is appended as a query param so the Python tenant middleware
 * validates it before the request body is parsed.
 *
 * @param engineUrl  Base URL of the Python service, e.g. "https://ava-graph-xxx.run.app"
 * @param payload    Tool dispatch payload
 * @param timeoutMs  Abort after this many milliseconds (default 3000)
 */
export async function proxyToEngine(
  engineUrl: string,
  payload: EnginePayload,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<EngineResult | typeof ENGINE_TIMEOUT | null> {
  try {
    const url = `${engineUrl}/api/tools/execute?clinic_id=${encodeURIComponent(payload.clinic_id)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    // Cloud Run requires a GCP identity token when allUsers invoker is blocked
    const idToken = await getIdToken(engineUrl);
    if (idToken) headers.Authorization = idToken;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    // Non-200 is a HARD failure — the engine ran but rejected/erred, so it did
    // not commit. Null lets the caller release the claim and fall back.
    if (!response.ok) return null;
    return (await response.json()) as EngineResult;
  } catch (err) {
    // AbortSignal.timeout() firing rejects fetch with a DOMException whose name
    // is "TimeoutError". That is the UNCERTAIN case: the engine may have already
    // committed the booking before we gave up. Signal it distinctly so a booking
    // is held, not released-and-retried (which would double-book). Every other
    // error (connection refused, JSON parse, a generic AbortError) is a hard
    // failure where the engine did not act → null.
    if ((err as { name?: string } | null)?.name === "TimeoutError") {
      return ENGINE_TIMEOUT;
    }
    return null;
  }
}

// ─── Booking idempotency ──────────────────────────────────────────────────────
//
// A retried ElevenLabs / Twilio tool-call webhook, or the slow-engine-then-TS-
// fallback path, can submit the same booking twice. Without a claim, that books
// a real patient into two appointments. We derive a deterministic key from
// conversation + slot + caller and atomically CLAIM it in Firestore (create()
// fails ALREADY_EXISTS on a concurrent or retried second attempt) BEFORE any PMS
// write. Both the engine path and the TS-fallback path claim against the same
// key, so whichever runs first wins and the other short-circuits.
//
// Mirrors the WriteUpp webhook dedup pattern (atomic create(), gRPC code 6).

const BOOKING_CLAIM_COLLECTION = "_ava_booking_claims";

export type BookingClaimStatus = "pending" | "settled";

export interface BookingClaimResult {
  /** True when this caller won the claim and should proceed with the PMS write. */
  claimed: boolean;
  /** Firestore doc id for the claim — used to settle/release it. */
  key: string;
  /**
   * Set only when claimed === false. The speakable result of the booking that
   * already won the claim, so the duplicate returns the same confirmation
   * instead of writing again. Null when the prior claim is still in flight.
   */
  priorResult: string | null;
}

/**
 * Deterministic booking key from conversation_id + slot start + caller phone.
 * Normalises so trivial formatting differences (whitespace, +44 vs raw) collapse
 * to one key. Returns null when there is not enough signal to safely dedup (no
 * slot at all), so the caller proceeds without a claim rather than over-blocking.
 */
export function bookingClaimKey(parts: {
  conversationId: string;
  slot: string;
  callerPhone: string;
}): string | null {
  const slot = (parts.slot ?? "").trim();
  if (!slot) return null;
  // Normalise the slot to an ISO instant when parseable so "2pm" vs the ISO it
  // resolves to do not split the key. Fall back to the raw trimmed string.
  const parsed = new Date(slot);
  const slotNorm = isNaN(parsed.getTime()) ? slot.toLowerCase() : parsed.toISOString();
  const phoneNorm = (parts.callerPhone ?? "").replace(/[^\d+]/g, "");
  const convNorm = (parts.conversationId ?? "").trim();
  const raw = `${convNorm}|${slotNorm}|${phoneNorm}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Atomically claim a booking key before writing to the PMS.
 *
 * - First caller: create() succeeds → { claimed: true }. Proceed with the write,
 *   then call settleBooking() with the confirmation (or releaseBooking() if the
 *   PMS write failed, so a genuine retry can try again).
 * - Concurrent / retried caller: create() throws ALREADY_EXISTS (code 6) →
 *   { claimed: false, priorResult }. Return priorResult and do NOT write.
 */
export async function claimBooking(
  db: Firestore,
  clinicId: string,
  key: string,
): Promise<BookingClaimResult> {
  const ref = db
    .collection("clinics")
    .doc(clinicId)
    .collection(BOOKING_CLAIM_COLLECTION)
    .doc(key);
  try {
    await ref.create({ status: "pending", createdAt: new Date().toISOString() });
    return { claimed: true, key, priorResult: null };
  } catch (err) {
    // gRPC code 6 = ALREADY_EXISTS — a concurrent or retried request won.
    if ((err as { code?: number }).code === 6) {
      const snap = await ref.get();
      const data = snap.data();
      return { claimed: false, key, priorResult: (data?.result as string) ?? null };
    }
    throw err;
  }
}

/** Record the winning booking's result so duplicate retries can replay it. */
export async function settleBooking(
  db: Firestore,
  clinicId: string,
  key: string,
  result: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await db
    .collection("clinics")
    .doc(clinicId)
    .collection(BOOKING_CLAIM_COLLECTION)
    .doc(key)
    .set(
      { status: "settled", result, settledAt: new Date().toISOString(), ...meta },
      { merge: true },
    );
}

/**
 * Release a claim when the PMS write failed, so a genuine retry is allowed to
 * book rather than being permanently blocked by a dead claim.
 */
export async function releaseBooking(
  db: Firestore,
  clinicId: string,
  key: string,
): Promise<void> {
  try {
    await db
      .collection("clinics")
      .doc(clinicId)
      .collection(BOOKING_CLAIM_COLLECTION)
      .doc(key)
      .delete();
  } catch {
    /* best-effort — a leftover pending claim is cleaned by the data-health cron */
  }
}
