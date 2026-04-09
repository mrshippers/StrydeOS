import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InsightEvent } from "@/types/insight-events";

vi.mock("../coaching-prompts", () => ({
  generateCoachingNarrative: vi.fn(),
}));

import { enrichEventsWithNarratives } from "../enrich-narratives";
import { generateCoachingNarrative } from "../coaching-prompts";

const mockedGenerate = vi.mocked(generateCoachingNarrative);

function makeEvent(overrides: Partial<InsightEvent> = {}): InsightEvent {
  return {
    id: "evt-1",
    type: "CLINICIAN_FOLLOWUP_DROP",
    clinicId: "clinic-1",
    severity: "warning",
    title: "Test",
    description: "Test",
    suggestedAction: "Test",
    actionTarget: "owner",
    createdAt: "2026-04-09T10:00:00Z",
    metadata: {},
    ...overrides,
  } as InsightEvent;
}

function makeMockDb(clinicExists: boolean = true) {
  return {
    doc: vi.fn(() => ({
      get: vi.fn(async () => ({
        exists: clinicExists,
        data: () => ({ name: "Spires", settings: { insightConfig: { revenuePerSession: 75 } } }),
      })),
      update: vi.fn(async () => {}),
    })),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("enrichEventsWithNarratives", () => {
  it("returns zeros for empty events array", async () => {
    const db = makeMockDb();
    const result = await enrichEventsWithNarratives(db as any, "clinic-1", []);
    expect(result).toEqual({ enriched: 0, skipped: 0, errors: [] });
  });

  it("returns clinic not found when clinic doc doesn't exist", async () => {
    const db = makeMockDb(false);
    const events = [makeEvent()];
    const result = await enrichEventsWithNarratives(db as any, "clinic-1", events);
    expect(result.errors).toContain("Clinic not found");
    expect(result.skipped).toBe(1);
  });

  it("skips events that already have ownerNarrative", async () => {
    const db = makeMockDb();
    const events = [makeEvent({ ownerNarrative: "Already generated" })];
    const result = await enrichEventsWithNarratives(db as any, "clinic-1", events);
    expect(result.skipped).toBe(1);
    expect(result.enriched).toBe(0);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("enriches events with generated narratives", async () => {
    const db = makeMockDb();
    mockedGenerate.mockResolvedValue({
      ownerNarrative: "Owner: check Andrew's schedule",
      clinicianNarrative: "A few patients didn't rebook",
    });

    const events = [makeEvent({ id: "evt-1" })];
    const result = await enrichEventsWithNarratives(db as any, "clinic-1", events);

    expect(result.enriched).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(mockedGenerate).toHaveBeenCalledOnce();
  });

  it("handles generateCoachingNarrative errors gracefully", async () => {
    const db = makeMockDb();
    mockedGenerate.mockRejectedValue(new Error("LLM rate limited"));

    const events = [makeEvent()];
    const result = await enrichEventsWithNarratives(db as any, "clinic-1", events);

    expect(result.enriched).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("LLM rate limited");
  });
});
