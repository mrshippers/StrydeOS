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
        data: () => ({ name: "Spires", sessionPricePence: 7500 }),
      })),
      update: vi.fn(async () => {}),
      set: vi.fn(async () => {}),
    })),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("enrichEventsWithNarratives", () => {
  it("returns zeros for empty events array", async () => {
    const db = makeMockDb();
    const result = await enrichEventsWithNarratives(db as any, "clinic-1", []);
    expect(result).toEqual({ enriched: 0, skipped: 0, errors: [], llmTimeouts: 0 });
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

  it("records llmTimeouts=0 on successful enrichment", async () => {
    const db = makeMockDb();
    mockedGenerate.mockResolvedValue({
      ownerNarrative: "Owner text",
      clinicianNarrative: "Clinician text",
    });

    const result = await enrichEventsWithNarratives(db as any, "clinic-1", [makeEvent({ id: "e1" })]);

    expect(result.llmTimeouts).toBe(0);
    expect(result.enriched).toBe(1);
  });

  it("increments llmTimeouts and continues loop when LLM times out on an event", async () => {
    const db = makeMockDb();
    // First event: timedOut=true (both attempts exhausted)
    // Second event: normal success
    mockedGenerate
      .mockResolvedValueOnce({ ownerNarrative: "", clinicianNarrative: "", timedOut: true })
      .mockResolvedValueOnce({ ownerNarrative: "Owner ok", clinicianNarrative: "Clinician ok" });

    const events = [
      makeEvent({ id: "evt-timeout" }),
      makeEvent({ id: "evt-success" }),
    ];
    const result = await enrichEventsWithNarratives(db as any, "clinic-1", events);

    // Loop continued despite timeout on first event
    expect(result.llmTimeouts).toBe(1);
    expect(result.skipped).toBe(1); // the timed-out event
    expect(result.enriched).toBe(1); // the second event succeeded
    expect(result.errors).toHaveLength(0);
    // Both events were attempted
    expect(mockedGenerate).toHaveBeenCalledTimes(2);
  });

  it("subsequent events still processed after a timed-out event", async () => {
    const db = makeMockDb();
    mockedGenerate
      .mockResolvedValueOnce({ ownerNarrative: "", clinicianNarrative: "", timedOut: true })
      .mockResolvedValueOnce({ ownerNarrative: "", clinicianNarrative: "", timedOut: true })
      .mockResolvedValueOnce({ ownerNarrative: "Third ok", clinicianNarrative: "Third clinician" });

    const events = [
      makeEvent({ id: "evt-1" }),
      makeEvent({ id: "evt-2" }),
      makeEvent({ id: "evt-3" }),
    ];
    const result = await enrichEventsWithNarratives(db as any, "clinic-1", events);

    expect(result.llmTimeouts).toBe(2);
    expect(result.enriched).toBe(1);
    expect(result.skipped).toBe(2);
    // All three events were attempted - no early loop exit
    expect(mockedGenerate).toHaveBeenCalledTimes(3);
  });

  it("returns llmTimeouts count in result shape", async () => {
    const db = makeMockDb();
    const result = await enrichEventsWithNarratives(db as any, "clinic-1", []);
    expect(result).toHaveProperty("llmTimeouts");
    expect(result.llmTimeouts).toBe(0);
  });
});
