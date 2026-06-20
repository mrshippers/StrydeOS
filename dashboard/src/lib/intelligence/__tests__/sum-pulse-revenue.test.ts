/**
 * TDD tests for sumPulseRevenue (P0-3).
 *
 * Rules under test:
 *  - Sum real per-event revenueImpact when present (> 0).
 *  - Fall back to a caller-supplied avgSessionPounds when an event has no
 *    revenueImpact (value <= 0).
 *  - Label is "measured" only when every event contributed a real value.
 *  - Label is "estimated" when any fallback was used.
 *  - Label is "count-only" when there are events but no fallback and no real
 *    values (i.e. avgSessionPounds is 0 or null) -- never show a fabricated
 *    currency figure.
 *  - Empty events array returns zeros and "measured" (vacuously true: no
 *    fallback was used).
 */

import { describe, it, expect } from "vitest";
import { sumPulseRevenue } from "../sum-pulse-revenue";

type MinEvent = { revenueImpact: number };

describe("sumPulseRevenue", () => {
  it("returns 0 pounds and 'measured' for an empty event list", () => {
    const result = sumPulseRevenue([], 65);
    expect(result.pounds).toBe(0);
    expect(result.label).toBe("measured");
  });

  it("sums real revenueImpact values and labels as 'measured'", () => {
    const events: MinEvent[] = [
      { revenueImpact: 70 },
      { revenueImpact: 85 },
      { revenueImpact: 45 },
    ];
    const result = sumPulseRevenue(events, 65);
    expect(result.pounds).toBe(200);
    expect(result.label).toBe("measured");
  });

  it("uses avgSessionPounds fallback when revenueImpact is 0 and labels 'estimated'", () => {
    const events: MinEvent[] = [
      { revenueImpact: 0 },
      { revenueImpact: 0 },
    ];
    const result = sumPulseRevenue(events, 80);
    expect(result.pounds).toBe(160);
    expect(result.label).toBe("estimated");
  });

  it("labels 'estimated' when any event uses the fallback", () => {
    const events: MinEvent[] = [
      { revenueImpact: 100 },
      { revenueImpact: 0 },
    ];
    const result = sumPulseRevenue(events, 70);
    expect(result.pounds).toBe(170);
    expect(result.label).toBe("estimated");
  });

  it("labels 'count-only' and returns 0 pounds when no real values and fallback is 0", () => {
    const events: MinEvent[] = [
      { revenueImpact: 0 },
      { revenueImpact: 0 },
    ];
    const result = sumPulseRevenue(events, 0);
    expect(result.pounds).toBe(0);
    expect(result.label).toBe("count-only");
  });

  it("labels 'count-only' when no real values and fallback is null", () => {
    const events: MinEvent[] = [{ revenueImpact: 0 }];
    const result = sumPulseRevenue(events, null);
    expect(result.pounds).toBe(0);
    expect(result.label).toBe("count-only");
  });

  it("rounds the total to whole pounds", () => {
    const events: MinEvent[] = [
      { revenueImpact: 10.6 },
      { revenueImpact: 20.3 },
    ];
    const result = sumPulseRevenue(events, 65);
    expect(result.pounds).toBe(31);
    expect(result.label).toBe("measured");
  });

  it("treats negative revenueImpact as missing (falls back)", () => {
    const events: MinEvent[] = [{ revenueImpact: -5 }];
    const result = sumPulseRevenue(events, 60);
    expect(result.pounds).toBe(60);
    expect(result.label).toBe("estimated");
  });
});
