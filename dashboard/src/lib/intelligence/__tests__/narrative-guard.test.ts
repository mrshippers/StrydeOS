import { describe, it, expect } from "vitest";
import {
  guardNarrative,
  extractNumbers,
  buildAllowedNumbers,
} from "../narrative-guard";
import type { InsightEvent } from "@/types/insight-events";

function makeEvent(overrides: Partial<InsightEvent> = {}): InsightEvent {
  return {
    id: "evt-1",
    type: "REVENUE_LEAK_DETECTED",
    clinicId: "clinic-1",
    severity: "warning",
    title: "Revenue leak",
    description: "Patients dropping mid-programme",
    suggestedAction: "Review patients",
    actionTarget: "owner",
    createdAt: "2026-06-20T10:00:00Z",
    revenueImpact: 390,
    metadata: { patientCount: "6", leakedRounded: "390" },
    ...overrides,
  } as InsightEvent;
}

describe("extractNumbers", () => {
  it("extracts currency values", () => {
    expect(extractNumbers("Revenue at risk is £390")).toContain(390);
  });

  it("extracts percentage values", () => {
    expect(extractNumbers("Follow-up dropped by 21%")).toContain(21);
  });

  it("extracts x-multiples", () => {
    expect(extractNumbers("That is a 2.4x improvement")).toContain(2.4);
  });

  it("returns empty set for text with no numbers", () => {
    expect(extractNumbers("No numbers here at all")).toEqual(new Set());
  });

  it("handles multiple numeric types in one string", () => {
    const nums = extractNumbers("£390 and 21% and 2.4x improvement");
    expect(nums).toContain(390);
    expect(nums).toContain(21);
    expect(nums).toContain(2.4);
  });
});

describe("buildAllowedNumbers", () => {
  it("includes revenueImpact from the event", () => {
    const event = makeEvent({ revenueImpact: 390 });
    const allowed = buildAllowedNumbers(event, 75);
    expect(allowed).toContain(390);
  });

  it("includes revenuePerSession from context", () => {
    const event = makeEvent();
    const allowed = buildAllowedNumbers(event, 65);
    expect(allowed).toContain(65);
  });

  it("includes numeric metadata values", () => {
    const event = makeEvent({
      metadata: { patientCount: "6", dropPct: "21" },
    });
    const allowed = buildAllowedNumbers(event, 65);
    expect(allowed).toContain(6);
    expect(allowed).toContain(21);
  });

  it("ignores non-numeric metadata values", () => {
    const event = makeEvent({ metadata: { name: "Andrew", dropPct: "21" } });
    const allowed = buildAllowedNumbers(event, 65);
    expect(allowed).toContain(21);
    // "Andrew" has no numeric content -- set should not contain NaN
    for (const n of allowed) {
      expect(Number.isFinite(n)).toBe(true);
    }
  });
});

describe("guardNarrative", () => {
  it("accepts a narrative whose figures all appear in allowed numbers", () => {
    const event = makeEvent({ revenueImpact: 390, metadata: { patientCount: "6" } });
    const result = guardNarrative(
      "Six patients have not returned, representing £390 in missed revenue.",
      event,
      75
    );
    expect(result.accepted).toBe(true);
    expect(result.narrative).toBe(
      "Six patients have not returned, representing £390 in missed revenue."
    );
  });

  it("rejects a narrative containing a fabricated currency figure", () => {
    const event = makeEvent({ revenueImpact: 390, metadata: {} });
    // £1200 is NOT in the event metadata
    const result = guardNarrative(
      "Patients have not returned, costing the clinic £1200 this week.",
      event,
      75
    );
    expect(result.accepted).toBe(false);
    expect(result.fabricatedNumbers).toContain(1200);
  });

  it("rejects a narrative containing a fabricated percentage", () => {
    const event = makeEvent({
      revenueImpact: 390,
      metadata: { dropPct: "21" },
    });
    // 74% is the PBB benchmark stat that was previously in the prompt -- NOT in metadata
    const result = guardNarrative(
      "Average rebooking is 74% but top clinics hit 85%.",
      event,
      75
    );
    expect(result.accepted).toBe(false);
    expect(result.fabricatedNumbers).toContain(74);
    expect(result.fabricatedNumbers).toContain(85);
  });

  it("rejects a narrative containing a fabricated x-multiple", () => {
    const event = makeEvent({ revenueImpact: 390, metadata: {} });
    const result = guardNarrative(
      "Top physios achieve a 2.4x follow-up rate.",
      event,
      75
    );
    expect(result.accepted).toBe(false);
    expect(result.fabricatedNumbers).toContain(2.4);
  });

  it("accepts a narrative with no currency, percentage, or x-multiple", () => {
    const event = makeEvent();
    const result = guardNarrative(
      "A few patients have not returned. Worth a follow-up call.",
      event,
      75
    );
    expect(result.accepted).toBe(true);
  });

  it("accepts a narrative where figures come from numeric metadata", () => {
    const event = makeEvent({
      revenueImpact: undefined,
      metadata: { currentRate: "0.55", dropPct: "21" },
    });
    const result = guardNarrative(
      "Follow-up dropped 21% this week from 0.55 last period.",
      event,
      65
    );
    expect(result.accepted).toBe(true);
  });
});

describe("interpolate placeholder validation (missing/non-finite skip)", () => {
  // These tests exercise the exported helper that coaching-prompts uses
  // to detect holes before calling the LLM.
  it("detects missing placeholders in a template", async () => {
    const { detectMissingPlaceholders } = await import("../coaching-prompts");
    const template = "Revenue: £{revenueImpact}, patients: {patientCount}";
    // revenueImpact missing (undefined), patientCount present
    const vars: Record<string, unknown> = { patientCount: 6 };
    const missing = detectMissingPlaceholders(template, vars);
    expect(missing).toContain("revenueImpact");
    expect(missing).not.toContain("patientCount");
  });

  it("detects non-finite numeric placeholders", async () => {
    const { detectMissingPlaceholders } = await import("../coaching-prompts");
    const template = "Revenue: £{revenueImpact}";
    const vars: Record<string, unknown> = { revenueImpact: NaN };
    const missing = detectMissingPlaceholders(template, vars);
    expect(missing).toContain("revenueImpact");
  });

  it("returns empty array when all placeholders are satisfied", async () => {
    const { detectMissingPlaceholders } = await import("../coaching-prompts");
    const template = "Revenue: £{revenueImpact}, patients: {patientCount}";
    const vars: Record<string, unknown> = { revenueImpact: 390, patientCount: 6 };
    const missing = detectMissingPlaceholders(template, vars);
    expect(missing).toHaveLength(0);
  });
});
