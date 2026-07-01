import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { run, inputSchema } from "../tools/insurance/intakes-list";
import type { ToolContext, Role } from "../types";
import type { InsuranceRecord } from "@/lib/insurance/types";

const NOW = new Date("2026-07-01T12:00:00.000Z");

/** A canonical InsuranceRecord (approved, in-window) with per-test overrides. */
function rec(o: Partial<InsuranceRecord> & { id?: string } = {}): { id: string; data: InsuranceRecord } {
  const { id = "i1", ...rest } = o;
  return {
    id,
    data: {
      tenantId: "clinic-spires",
      patientRef: "p1",
      source: "form",
      insurerName: "Bupa",
      policyNumber: "AB1234567890",
      confidence: 1,
      capturedAt: NOW.toISOString(),
      capturedBy: "patient",
      reviewStatus: "approved",
      audit: [],
      ...rest,
    },
  };
}

/**
 * Minimal Firestore stub. The query builder is a no-op (returns every seeded
 * doc); the tool does its own precise window/status filtering in memory, so the
 * stub does not need to emulate where/orderBy/limit. `collectionSpy` proves the
 * PHI gate short-circuits before any data read.
 */
function makeCtx(role: Role, docs: Array<{ id: string; data: InsuranceRecord }>) {
  const collectionSpy = vi.fn((_path: string) => {
    const q: Record<string, unknown> = {};
    q.where = () => q;
    q.orderBy = () => q;
    q.limit = () => q;
    q.get = async () => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
    return q;
  });
  const db = {
    collection: collectionSpy,
    doc: () => ({ get: async () => ({ exists: false }) }),
  };
  const ctx = { clinicId: "clinic-spires", role, db, env: {} } as unknown as ToolContext;
  return { ctx, collectionSpy };
}

const input = (o: Partial<{ days_back: number; status: string; limit: number }> = {}) =>
  inputSchema.parse(o);

describe("insurance_intakes_list", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("1. empty window → summary.total 0, rows []", async () => {
    const { ctx } = makeCtx("owner", []);
    const { data } = await run(ctx, input());
    expect(data.summary.total).toBe(0);
    expect(data.rows).toEqual([]);
  });

  it("2. AXA intake in window → row present, insurerName 'AXA'", async () => {
    const { ctx } = makeCtx("owner", [rec({ insurerName: "AXA" })]);
    const { data } = await run(ctx, input());
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].insurerName).toBe("AXA");
    expect(data.summary.byInsurer.AXA).toBe(1);
  });

  it("3. policyNumber '1234567890' → policyLast4 '7890', no full number (or card field) anywhere", async () => {
    const { ctx } = makeCtx("owner", [rec({ policyNumber: "1234567890" })]);
    const { data } = await run(ctx, input());
    expect(data.rows[0].policyLast4).toBe("7890");
    const serialised = JSON.stringify(data);
    expect(serialised).not.toContain("1234567890");
    expect(serialised).not.toMatch(/card|image|photo/i);
  });

  it("4. reviewStatus 'pending' → needsAction true", async () => {
    const { ctx } = makeCtx("owner", [rec({ reviewStatus: "pending" })]);
    const { data } = await run(ctx, input());
    expect(data.rows[0].needsAction).toBe(true);
    expect(data.summary.needsActionCount).toBe(1);
  });

  it("5. incomplete true → needsAction true, incompleteReason surfaced", async () => {
    const { ctx } = makeCtx("owner", [
      rec({ incomplete: true, incompleteReason: "missing pre-authorisation" }),
    ]);
    const { data } = await run(ctx, input());
    expect(data.rows[0].needsAction).toBe(true);
    expect(data.rows[0].incomplete).toBe(true);
    expect(data.rows[0].incompleteReason).toBe("missing pre-authorisation");
    expect(data.summary.incompleteCount).toBe(1);
  });

  it("6. insurerMismatch true → needsAction true, claimedInsurer surfaced", async () => {
    const { ctx } = makeCtx("owner", [rec({ insurerMismatch: true, claimedInsurer: "AXA" })]);
    const { data } = await run(ctx, input());
    expect(data.rows[0].needsAction).toBe(true);
    expect(data.rows[0].insurerMismatch).toBe(true);
    expect(data.rows[0].claimedInsurer).toBe("AXA");
    expect(data.summary.mismatchCount).toBe(1);
  });

  it("7. non-privileged role → gate rejects, throws, no data read", async () => {
    const { ctx, collectionSpy } = makeCtx("clinician", [rec({ insurerName: "AXA" })]);
    await expect(run(ctx, input())).rejects.toThrow(/role|PHI/i);
    expect(collectionSpy).not.toHaveBeenCalled();
  });

  it("8. intake with capturedAt outside days_back → excluded", async () => {
    const { ctx } = makeCtx("owner", [
      rec({ id: "in", capturedAt: NOW.toISOString() }),
      rec({ id: "out", capturedAt: "2026-05-01T09:00:00.000Z" }), // 61 days before NOW
    ]);
    const { data } = await run(ctx, input({ days_back: 7 }));
    const ids = data.rows.map((r) => r.id);
    expect(ids).toContain("in");
    expect(ids).not.toContain("out");
    expect(data.summary.total).toBe(1);
  });
});
