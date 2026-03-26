/**
 * Tests for PMS adapter factory and status maps.
 *
 * Run: npx tsx --test src/lib/integrations/pms/__tests__/factory.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
    assert.equal(adapter.provider, "writeupp");
  });

  it("creates a Cliniko adapter", async () => {
    const { createPMSAdapter } = await import("../factory");
    const adapter = createPMSAdapter({
      provider: "cliniko",
      apiKey: "test-key",
    });
    assert.equal(adapter.provider, "cliniko");
  });

  it("creates a Halaxy adapter", async () => {
    const { createPMSAdapter } = await import("../factory");
    const adapter = createPMSAdapter({
      provider: "halaxy",
      apiKey: "test-key",
    });
    assert.equal(adapter.provider, "halaxy");
  });

  it("creates a Zanda (Power Diary) adapter", async () => {
    const { createPMSAdapter } = await import("../factory");
    const adapter = createPMSAdapter({
      provider: "powerdiary",
      apiKey: "test-key",
    });
    assert.equal(adapter.provider, "powerdiary");
  });

  it("throws for TM3 (not yet implemented)", async () => {
    const { createPMSAdapter } = await import("../factory");
    assert.throws(
      () => createPMSAdapter({ provider: "tm3", apiKey: "key" }),
      /TM3 adapter not yet implemented/
    );
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
    assert.throws(
      () =>
        createPMSAdapter({
          provider: "nonexistent" as any,
          apiKey: "key",
        }),
      /Unknown PMS provider/
    );
  });
});

// ─── Status Maps ─────────────────────────────────────────────────────────────

describe("WriteUpp status map", () => {
  it("maps all expected statuses", () => {
    assert.equal(WRITEUPP_STATUS_MAP["Confirmed"], "scheduled");
    assert.equal(WRITEUPP_STATUS_MAP["Attended"], "completed");
    assert.equal(WRITEUPP_STATUS_MAP["Did Not Attend"], "dna");
    assert.equal(WRITEUPP_STATUS_MAP["Cancelled"], "cancelled");
    assert.equal(WRITEUPP_STATUS_MAP["Late Cancellation"], "late_cancel");
  });
});

describe("Cliniko status map", () => {
  it("maps all expected statuses", () => {
    assert.equal(CLINIKO_STATUS_MAP["booked"], "scheduled");
    assert.equal(CLINIKO_STATUS_MAP["arrived"], "completed");
    assert.equal(CLINIKO_STATUS_MAP["did_not_arrive"], "dna");
    assert.equal(CLINIKO_STATUS_MAP["cancelled"], "cancelled");
  });
});

describe("Halaxy status map", () => {
  it("maps all expected statuses", () => {
    assert.equal(HALAXY_STATUS_MAP["booked"], "scheduled");
    assert.equal(HALAXY_STATUS_MAP["fulfilled"], "completed");
    assert.equal(HALAXY_STATUS_MAP["noshow"], "dna");
    assert.equal(HALAXY_STATUS_MAP["cancelled"], "cancelled");
    assert.equal(HALAXY_STATUS_MAP["entered-in-error"], "cancelled");
  });
});

describe("Zanda status map", () => {
  it("maps all expected statuses", () => {
    assert.equal(ZANDA_STATUS_MAP["confirmed"], "scheduled");
    assert.equal(ZANDA_STATUS_MAP["arrived"], "completed");
    assert.equal(ZANDA_STATUS_MAP["dna"], "dna");
    assert.equal(ZANDA_STATUS_MAP["did not attend"], "dna");
    assert.equal(ZANDA_STATUS_MAP["cancelled"], "cancelled");
    assert.equal(ZANDA_STATUS_MAP["late cancellation"], "late_cancel");
    assert.equal(ZANDA_STATUS_MAP["no show"], "dna");
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
