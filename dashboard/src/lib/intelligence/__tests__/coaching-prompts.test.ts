import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InsightEvent } from "@/types/insight-events";

// Mock the ai-sdk before importing the module under test
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/gateway", () => ({
  gateway: vi.fn(() => "mock-model"),
}));

import { generateCoachingNarrative } from "../coaching-prompts";
import type { CoachingContext } from "../coaching-prompts";
import { generateText } from "ai";

const mockedGenerateText = vi.mocked(generateText);

function makeEvent(overrides: Partial<InsightEvent> = {}): InsightEvent {
  return {
    id: "evt-1",
    type: "CLINICIAN_FOLLOWUP_DROP",
    clinicId: "clinic-1",
    severity: "warning",
    title: "Follow-up drop",
    description: "Test",
    suggestedAction: "Review",
    actionTarget: "owner",
    createdAt: "2026-04-09T10:00:00Z",
    metadata: { currentRate: "0.55", previousRate: "0.70", dropPct: "21" },
    ...overrides,
  } as InsightEvent;
}

function makeContext(overrides: Partial<CoachingContext> = {}): CoachingContext {
  return {
    clinicName: "Spires Physiotherapy",
    clinicianName: "Andrew",
    revenuePerSession: 65,
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateCoachingNarrative", () => {
  it("returns empty narratives for unknown event type", async () => {
    const event = makeEvent({ type: "UNKNOWN_TYPE" as InsightEvent["type"] });
    const result = await generateCoachingNarrative(event, makeContext());

    expect(result).toEqual({
      ownerNarrative: "",
      clinicianNarrative: "",
    });
    // Should not call the LLM at all
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it("parses OWNER/CLINICIAN format correctly from LLM response", async () => {
    mockedGenerateText.mockResolvedValue({
      text: "OWNER: Andrew's follow-up rate dropped this week. Consider a coaching conversation.\nCLINICIAN: A few of your patients from last week haven't rebooked yet.",
    } as never);

    const result = await generateCoachingNarrative(
      makeEvent(),
      makeContext()
    );

    expect(result.ownerNarrative).toBe(
      "Andrew's follow-up rate dropped this week. Consider a coaching conversation."
    );
    expect(result.clinicianNarrative).toBe(
      "A few of your patients from last week haven't rebooked yet."
    );
  });

  it("falls back to full text as ownerNarrative when format is unexpected", async () => {
    mockedGenerateText.mockResolvedValue({
      text: "Something went wrong with the format — here is plain text.",
    } as never);

    const result = await generateCoachingNarrative(
      makeEvent(),
      makeContext()
    );

    // parseNarratives falls back: ownerNarrative = full text, clinicianNarrative = ""
    expect(result.ownerNarrative).toBe(
      "Something went wrong with the format — here is plain text."
    );
    expect(result.clinicianNarrative).toBe("");
  });

  it("passes correct system prompt and user prompt to generateText", async () => {
    mockedGenerateText.mockResolvedValue({
      text: "OWNER: Test owner.\nCLINICIAN: Test clinician.",
    } as never);

    await generateCoachingNarrative(
      makeEvent({ clinicianName: "Andrew" }),
      makeContext({ clinicianName: "Andrew", revenuePerSession: 65 })
    );

    expect(mockedGenerateText).toHaveBeenCalledOnce();
    const callArgs = mockedGenerateText.mock.calls[0][0] as Record<string, unknown>;

    // System prompt should contain the coaching voice identity
    expect(callArgs.system).toContain("coaching voice inside StrydeOS");

    // User prompt should have interpolated values
    const prompt = callArgs.prompt as string;
    expect(prompt).toContain("Andrew");
    expect(prompt).toContain("65");
    expect(prompt).toContain("Spires Physiotherapy");

    // Should request the OWNER/CLINICIAN format
    expect(prompt).toContain("OWNER:");
    expect(prompt).toContain("CLINICIAN:");
  });

  it("interpolates metadata variables into the prompt", async () => {
    mockedGenerateText.mockResolvedValue({
      text: "OWNER: Noted.\nCLINICIAN: Noted.",
    } as never);

    const event = makeEvent({
      metadata: { currentRate: "0.55", previousRate: "0.70", dropPct: "21" },
    });

    await generateCoachingNarrative(event, makeContext());

    const callArgs = mockedGenerateText.mock.calls[0][0] as Record<string, unknown>;
    const prompt = callArgs.prompt as string;

    expect(prompt).toContain("0.55");
    expect(prompt).toContain("0.70");
    expect(prompt).toContain("21");
  });

  it("uses event clinicianName when context clinicianName is missing", async () => {
    mockedGenerateText.mockResolvedValue({
      text: "OWNER: Check.\nCLINICIAN: Check.",
    } as never);

    const event = makeEvent({ clinicianName: "Max" });
    const ctx = makeContext({ clinicianName: undefined });

    await generateCoachingNarrative(event, ctx);

    const prompt = (mockedGenerateText.mock.calls[0][0] as Record<string, unknown>).prompt as string;
    expect(prompt).toContain("Max");
  });
});
