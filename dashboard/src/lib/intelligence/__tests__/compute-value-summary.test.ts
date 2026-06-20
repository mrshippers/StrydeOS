/**
 * TDD tests for computeValueSummary ROI multiple (P0-5).
 *
 * Rules under test:
 *  - roiMultiple is derived from the real subscriptionCostPence resolved via
 *    billing.monthlyPricePence (direct) or billing.tier + MODULE_PRICING matrix.
 *  - roiMultiple is null when no price can be resolved (neither monthlyPricePence
 *    nor tier is present). The hardcoded 29900 default must NOT be used.
 *  - subscriptionCostPence is null when unresolved (so callers/UI can suppress).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeValueSummary } from "../compute-value-summary";
import type { Firestore } from "firebase-admin/firestore";

// ─── Firestore stub factory ─────────────────────────────────────────────────

function makeFirestoreStub(clinicData: Record<string, unknown>): Firestore {
  const mockGet = vi.fn().mockResolvedValue({ data: () => clinicData });
  const mockEventsGet = vi.fn().mockResolvedValue({ docs: [] });

  return {
    collection: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      get: mockEventsGet,
    }),
    doc: vi.fn().mockReturnValue({
      get: mockGet,
      set: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as Firestore;
}

describe("computeValueSummary - ROI multiple (P0-5)", () => {
  it("(a) computes correct roiMultiple when billing.monthlyPricePence is set", async () => {
    // Clinic on Full Stack Studio paying £299/mo (29900p)
    const db = makeFirestoreStub({ billing: { monthlyPricePence: 29900, tier: "studio" } });

    const summary = await computeValueSummary(db, "clinic-1", 2026, 3);

    expect(summary.subscriptionCostPence).toBe(29900);
    // No value events => totalValuePence = 0, so multiple = 0
    expect(summary.roiMultiple).toBe(0);
  });

  it("(a) computes correct roiMultiple with real value events and known price", async () => {
    // Override the events query to return a synthetic event
    const clinicData = { billing: { monthlyPricePence: 19900, tier: "solo" } };
    const mockClinicGet = vi.fn().mockResolvedValue({ data: () => clinicData });
    const mockEventsGet = vi.fn().mockResolvedValue({
      docs: [
        {
          id: "ev-1",
          data: () => ({
            attributedAt: "2026-03-15",
            module: "ava",
            type: "AVA_CALL_HANDLED",
            confidence: "high",
            valuePence: 39800, // £398 generated
          }),
        },
      ],
    });

    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        get: mockEventsGet,
      }),
      doc: vi.fn().mockReturnValue({
        get: mockClinicGet,
        set: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as Firestore;

    const summary = await computeValueSummary(db, "clinic-1", 2026, 3);

    expect(summary.subscriptionCostPence).toBe(19900);
    // 39800 / 19900 = 2.0
    expect(summary.roiMultiple).toBeCloseTo(2.0);
  });

  it("(a) resolves subscriptionCostPence from tier matrix when monthlyPricePence absent", async () => {
    // Clinic has tier=clinic but no monthlyPricePence
    const db = makeFirestoreStub({ billing: { tier: "clinic" } });

    const summary = await computeValueSummary(db, "clinic-1", 2026, 3);

    // Full Stack Clinic tier = 39900p per MODULE_PRICING
    expect(summary.subscriptionCostPence).toBe(39900);
    expect(summary.roiMultiple).toBe(0); // 0 events
  });

  it("(a) resolves subscriptionCostPence for solo tier", async () => {
    const db = makeFirestoreStub({ billing: { tier: "solo" } });

    const summary = await computeValueSummary(db, "clinic-1", 2026, 3);

    // Full Stack Solo = 19900p
    expect(summary.subscriptionCostPence).toBe(19900);
    expect(summary.roiMultiple).toBe(0);
  });

  it("(b) suppresses roiMultiple (null) when no price can be resolved", async () => {
    // No billing data at all
    const db = makeFirestoreStub({});

    const summary = await computeValueSummary(db, "clinic-1", 2026, 3);

    expect(summary.subscriptionCostPence).toBeNull();
    expect(summary.roiMultiple).toBeNull();
  });

  it("(b) suppresses roiMultiple when billing exists but tier and monthlyPricePence are both missing", async () => {
    // billing present but empty
    const db = makeFirestoreStub({ billing: {} });

    const summary = await computeValueSummary(db, "clinic-1", 2026, 3);

    expect(summary.subscriptionCostPence).toBeNull();
    expect(summary.roiMultiple).toBeNull();
  });

  it("does NOT fall back to 29900 when billing is unset", async () => {
    const db = makeFirestoreStub({});

    const summary = await computeValueSummary(db, "clinic-1", 2026, 3);

    // Hardcoded 29900 default must not appear
    expect(summary.subscriptionCostPence).not.toBe(29900);
    expect(summary.roiMultiple).not.toBe(0); // null, not 0
  });
});
