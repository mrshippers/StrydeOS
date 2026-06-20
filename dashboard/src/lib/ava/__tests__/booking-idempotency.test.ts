/**
 * Tests for P0-1 booking idempotency primitives in engine-proxy.ts.
 *
 * bookingClaimKey derives a deterministic key from conversation + slot + caller.
 * claimBooking atomically claims it (create() → ALREADY_EXISTS on a retry), so a
 * duplicate booking attempt short-circuits with the prior result instead of
 * writing a second appointment.
 */

import { describe, it, expect, vi } from "vitest";
import {
  bookingClaimKey,
  claimBooking,
  settleBooking,
  releaseBooking,
} from "@/lib/ava/engine-proxy";
import type { Firestore } from "firebase-admin/firestore";

// ─── bookingClaimKey ──────────────────────────────────────────────────────────

describe("bookingClaimKey", () => {
  it("is deterministic for the same conversation + slot + phone", () => {
    const a = bookingClaimKey({
      conversationId: "conv_1",
      slot: "2026-07-01T14:00:00.000Z",
      callerPhone: "+447700900123",
    });
    const b = bookingClaimKey({
      conversationId: "conv_1",
      slot: "2026-07-01T14:00:00.000Z",
      callerPhone: "+447700900123",
    });
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it("normalises slot formatting so equivalent times collapse to one key", () => {
    // Same instant, different string formatting → same key.
    const iso = bookingClaimKey({
      conversationId: "conv_1",
      slot: "2026-07-01T14:00:00.000Z",
      callerPhone: "+447700900123",
    });
    const unpadded = bookingClaimKey({
      conversationId: "conv_1",
      slot: "2026-07-01T14:00:00Z",
      callerPhone: "+447700900123",
    });
    expect(iso).toBe(unpadded);
  });

  it("differs when the slot differs", () => {
    const slotA = bookingClaimKey({ conversationId: "c", slot: "2026-07-01T14:00:00Z", callerPhone: "+44" });
    const slotB = bookingClaimKey({ conversationId: "c", slot: "2026-07-01T15:00:00Z", callerPhone: "+44" });
    expect(slotA).not.toBe(slotB);
  });

  it("returns null when there is no slot to key on", () => {
    expect(bookingClaimKey({ conversationId: "c", slot: "", callerPhone: "+44" })).toBeNull();
  });
});

// ─── claimBooking ─────────────────────────────────────────────────────────────

/**
 * Firestore mock where the FIRST create() succeeds and every subsequent create()
 * on the same doc throws ALREADY_EXISTS (gRPC code 6) — exactly what Firestore
 * does for a real concurrent / retried claim.
 */
function makeClaimDb() {
  const store = new Map<string, Record<string, unknown>>();
  const docRef = (key: string) => ({
    create: vi.fn(async (data: Record<string, unknown>) => {
      if (store.has(key)) {
        const err = new Error("ALREADY_EXISTS") as Error & { code: number };
        err.code = 6;
        throw err;
      }
      store.set(key, data);
    }),
    get: vi.fn(async () => ({ data: () => store.get(key) })),
    set: vi.fn(async (data: Record<string, unknown>) => {
      store.set(key, { ...(store.get(key) ?? {}), ...data });
    }),
    delete: vi.fn(async () => {
      store.delete(key);
    }),
  });
  const refs = new Map<string, ReturnType<typeof docRef>>();
  const db = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn((key: string) => {
            if (!refs.has(key)) refs.set(key, docRef(key));
            return refs.get(key)!;
          }),
        })),
      })),
    })),
  };
  return db as unknown as Firestore;
}

describe("claimBooking", () => {
  it("first caller wins the claim; the duplicate retry is short-circuited", async () => {
    const db = makeClaimDb();
    const key = "key_abc";

    const first = await claimBooking(db, "clinic_001", key);
    expect(first.claimed).toBe(true);

    // The winner settles with the confirmation it spoke.
    await settleBooking(db, "clinic_001", key, "All sorted — booked for Wednesday at 2pm.");

    // A retried/concurrent second attempt with the SAME key must NOT claim.
    const second = await claimBooking(db, "clinic_001", key);
    expect(second.claimed).toBe(false);
    // And it replays the prior confirmation instead of booking again.
    expect(second.priorResult).toBe("All sorted — booked for Wednesday at 2pm.");
  });

  it("releaseBooking frees a failed claim so a genuine retry can book", async () => {
    const db = makeClaimDb();
    const key = "key_release";

    const first = await claimBooking(db, "clinic_001", key);
    expect(first.claimed).toBe(true);

    // PMS write failed → release.
    await releaseBooking(db, "clinic_001", key);

    // Retry can now win the claim again.
    const retry = await claimBooking(db, "clinic_001", key);
    expect(retry.claimed).toBe(true);
  });
});
