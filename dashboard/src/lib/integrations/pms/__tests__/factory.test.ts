/**
 * Tests for PMS adapter factory and status maps.
 */

import { describe, it, expect } from "vitest";
import {
  WRITEUPP_STATUS_MAP,
  CLINIKO_STATUS_MAP,
  HALAXY_STATUS_MAP,
  ZANDA_STATUS_MAP,
  PPS_STATUS_MAP,
} from "@/types/pms";

// ─── PMS Factory ─────────────────────────────────────────────────────────────

describe("createPMSAdapter", () => {
  it("creates a WriteUpp adapter", async () => {
    const { createPMSAdapter } = await import("../factory");
    const adapter = createPMSAdapter({
      provider: "writeupp",
      apiKey: "test-key",
    });
    expect(adapter.provider).toBe("writeupp");
  });

  it("creates a Cliniko adapter", async () => {
    const { createPMSAdapter } = await import("../factory");
    const adapter = createPMSAdapter({
      provider: "cliniko",
      apiKey: "test-key",
    });
    expect(adapter.provider).toBe("cliniko");
  });

  it("creates a Halaxy adapter", async () => {
    const { createPMSAdapter } = await import("../factory");
    const adapter = createPMSAdapter({
      provider: "halaxy",
      apiKey: "test-key",
    });
    expect(adapter.provider).toBe("halaxy");
  });

  it("creates a Zanda (Power Diary) adapter", async () => {
    const { createPMSAdapter } = await import("../factory");
    const adapter = createPMSAdapter({
      provider: "powerdiary",
      apiKey: "test-key",
    });
    expect(adapter.provider).toBe("powerdiary");
  });

  it("throws for TM3 (not yet implemented)", async () => {
    const { createPMSAdapter } = await import("../factory");
    expect(
      () => createPMSAdapter({ provider: "tm3", apiKey: "key" }),
    ).toThrow(/TM3 adapter not yet implemented/);
  });

  it("throws for PPS (not yet implemented)", async () => {
    const { createPMSAdapter } = await import("../factory");
    assert.throws(
      () => createPMSAdapter({ provider: "pps", apiKey: "key" }),
      /PPS adapter not yet implemented/
    );
  });

  it("throws for unknown provider", async () => {
    const { createPMSAdapter } = await import("../factory");
    expect(
      () =>
        createPMSAdapter({
          provider: "nonexistent" as any,
          apiKey: "key",
        }),
    ).toThrow(/Unknown PMS provider/);
  });
});

// ─── Status Maps ─────────────────────────────────────────────────────────────

describe("WriteUpp status map", () => {
  it("maps all expected statuses", () => {
    expect(WRITEUPP_STATUS_MAP["Confirmed"]).toBe("scheduled");
    expect(WRITEUPP_STATUS_MAP["Attended"]).toBe("completed");
    expect(WRITEUPP_STATUS_MAP["Did Not Attend"]).toBe("dna");
    expect(WRITEUPP_STATUS_MAP["Cancelled"]).toBe("cancelled");
    expect(WRITEUPP_STATUS_MAP["Late Cancellation"]).toBe("late_cancel");
  });
});

describe("Cliniko status map", () => {
  it("maps all expected statuses", () => {
    expect(CLINIKO_STATUS_MAP["booked"]).toBe("scheduled");
    expect(CLINIKO_STATUS_MAP["arrived"]).toBe("completed");
    expect(CLINIKO_STATUS_MAP["did_not_arrive"]).toBe("dna");
    expect(CLINIKO_STATUS_MAP["cancelled"]).toBe("cancelled");
  });
});

describe("Halaxy status map", () => {
  it("maps all expected statuses", () => {
    expect(HALAXY_STATUS_MAP["booked"]).toBe("scheduled");
    expect(HALAXY_STATUS_MAP["fulfilled"]).toBe("completed");
    expect(HALAXY_STATUS_MAP["noshow"]).toBe("dna");
    expect(HALAXY_STATUS_MAP["cancelled"]).toBe("cancelled");
    expect(HALAXY_STATUS_MAP["entered-in-error"]).toBe("cancelled");
  });
});

describe("Zanda status map", () => {
  it("maps all expected statuses", () => {
    expect(ZANDA_STATUS_MAP["confirmed"]).toBe("scheduled");
    expect(ZANDA_STATUS_MAP["arrived"]).toBe("completed");
    expect(ZANDA_STATUS_MAP["dna"]).toBe("dna");
    expect(ZANDA_STATUS_MAP["did not attend"]).toBe("dna");
    expect(ZANDA_STATUS_MAP["cancelled"]).toBe("cancelled");
    expect(ZANDA_STATUS_MAP["late cancellation"]).toBe("late_cancel");
    expect(ZANDA_STATUS_MAP["no show"]).toBe("dna");
  });
});

describe("PPS status map", () => {
  it("maps all expected statuses", () => {
    assert.equal(PPS_STATUS_MAP["booked"], "scheduled");
    assert.equal(PPS_STATUS_MAP["confirmed"], "scheduled");
    assert.equal(PPS_STATUS_MAP["attended"], "completed");
    assert.equal(PPS_STATUS_MAP["completed"], "completed");
    assert.equal(PPS_STATUS_MAP["dna"], "dna");
    assert.equal(PPS_STATUS_MAP["did not attend"], "dna");
    assert.equal(PPS_STATUS_MAP["no show"], "dna");
    assert.equal(PPS_STATUS_MAP["cancelled"], "cancelled");
    assert.equal(PPS_STATUS_MAP["late cancellation"], "late_cancel");
    assert.equal(PPS_STATUS_MAP["late cancel"], "late_cancel");
  });
});
