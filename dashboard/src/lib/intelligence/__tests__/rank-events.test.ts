import { describe, it, expect } from "vitest";
import { rankEvents } from "../rank-events";
import type { InsightEvent } from "@/types/insight-events";

function makeEvent(overrides: Partial<InsightEvent> = {}): InsightEvent {
  return {
    id: "evt-1",
    type: "CLINICIAN_FOLLOWUP_DROP",
    clinicId: "clinic-1",
    severity: "warning",
    title: "Test event",
    description: "Test",
    suggestedAction: "Test",
    actionTarget: "owner",
    createdAt: "2026-04-09T10:00:00Z",
    metadata: {},
    ...overrides,
  } as InsightEvent;
}

describe("rankEvents", () => {
  it("sorts critical before warning before positive", () => {
    const events = [
      makeEvent({ id: "positive", severity: "positive" }),
      makeEvent({ id: "critical", severity: "critical" }),
      makeEvent({ id: "warning", severity: "warning" }),
    ];

    const ranked = rankEvents(events);
    expect(ranked.map((e) => e.id)).toEqual(["critical", "warning", "positive"]);
  });

  it("within same severity, higher revenueImpact ranks first", () => {
    const events = [
      makeEvent({ id: "low", severity: "critical", revenueImpact: 100 }),
      makeEvent({ id: "high", severity: "critical", revenueImpact: 500 }),
    ];

    const ranked = rankEvents(events);
    expect(ranked[0].id).toBe("high");
  });

  it("within same severity and revenue, newest ranks first", () => {
    const events = [
      makeEvent({ id: "old", severity: "warning", createdAt: "2026-04-08T10:00:00Z" }),
      makeEvent({ id: "new", severity: "warning", createdAt: "2026-04-09T10:00:00Z" }),
    ];

    const ranked = rankEvents(events);
    expect(ranked[0].id).toBe("new");
  });

  it("does not mutate the original array", () => {
    const events = [
      makeEvent({ id: "b", severity: "positive" }),
      makeEvent({ id: "a", severity: "critical" }),
    ];
    const original = [...events];
    rankEvents(events);
    expect(events.map((e) => e.id)).toEqual(original.map((e) => e.id));
  });

  it("handles empty array", () => {
    expect(rankEvents([])).toEqual([]);
  });

  it("treats undefined revenueImpact as 0", () => {
    const events = [
      makeEvent({ id: "none", severity: "critical", revenueImpact: undefined }),
      makeEvent({ id: "some", severity: "critical", revenueImpact: 200 }),
    ];

    const ranked = rankEvents(events);
    expect(ranked[0].id).toBe("some");
  });
});
