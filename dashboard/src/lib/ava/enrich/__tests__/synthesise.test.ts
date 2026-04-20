/**
 * Tests for the Haiku-backed synthesiser that turns raw enrichment signals
 * into KnowledgeEntry[] across the 7 Ava knowledge categories.
 *
 * Run: npx vitest run src/lib/ava/enrich/__tests__/synthesise.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI SDK BEFORE importing the module under test
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/gateway", () => ({
  gateway: vi.fn(() => "mock-model"),
}));

import { synthesiseKnowledge } from "../synthesise";
import { generateText } from "ai";
import type { PlacesResult, CompaniesHouseResult, WebsiteResult } from "../sources";

const mockedGenerateText = vi.mocked(generateText);

function buildLlmJson(entries: Array<{ category: string; title: string; content: string; confidence?: string }>): string {
  return JSON.stringify({ entries });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Fixture data ─────────────────────────────────────────────────────────────

const spiresPlaces: PlacesResult = {
  name: "Spires Physiotherapy",
  address: "45 Mill Lane, West Hampstead, London NW3 1LB",
  phone: "020 7794 0202",
  website: "https://www.spiresphysiotherapy.com",
  hours: ["Monday: 8:00 AM – 8:00 PM", "Saturday: 9:00 AM – 1:00 PM"],
  rating: 4.9,
  userRatingCount: 128,
};

const spiresCH: CompaniesHouseResult = {
  companyNumber: "12345678",
  companyName: "SPIRES PHYSIOTHERAPY LTD",
  status: "active",
  incorporatedOn: "2018-04-12",
  sicCodes: ["86900"],
  registeredAddress: "45 Mill Lane, London, NW3 1LB",
};

const spiresWebsite: WebsiteResult = {
  url: "https://www.spiresphysiotherapy.com",
  title: "Spires Physio",
  text: "Private physiotherapy clinic in West Hampstead. We treat back pain, sports injuries and post-surgical rehab. Initial assessments £75. Follow-ups £75. 24-hour cancellation policy. We accept Bupa, AXA, Vitality, Aviva, WPA, Cigna.",
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("synthesiseKnowledge", () => {
  it("returns empty array when all sources are null (nothing to synthesise)", async () => {
    const out = await synthesiseKnowledge({
      clinicName: "Anything",
      places: null,
      companiesHouse: null,
      website: null,
    });
    expect(out).toEqual([]);
    // LLM should never be called when there is no evidence
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it("calls Haiku and returns validated KnowledgeEntry[] with source=auto", async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: buildLlmJson([
        {
          category: "services",
          title: "Physiotherapy",
          content: "Private physio clinic treating back pain, sports injuries and post-surgical rehab.",
          confidence: "high",
        },
        {
          category: "pricing",
          title: "Initial Assessment",
          content: "£75 for a 45-minute initial assessment.",
          confidence: "high",
        },
        {
          category: "location",
          title: "Clinic Address",
          content: "45 Mill Lane, West Hampstead, London NW3 1LB.",
          confidence: "high",
        },
      ]),
    } as Awaited<ReturnType<typeof generateText>>);

    const entries = await synthesiseKnowledge({
      clinicName: "Spires Physiotherapy",
      places: spiresPlaces,
      companiesHouse: spiresCH,
      website: spiresWebsite,
    });

    expect(entries).toHaveLength(3);
    entries.forEach((e) => {
      expect(e.source).toBe("auto");
      expect(e.id).toBeDefined();
      expect(e.updatedAt).toBeDefined();
    });
    expect(entries.find((e) => e.category === "pricing")?.content).toContain("£75");
    expect(entries.find((e) => e.category === "location")?.content).toContain("Mill Lane");
  });

  it("drops entries with invalid category", async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: buildLlmJson([
        { category: "services", title: "Physio", content: "Valid." },
        { category: "nonsense", title: "Bad", content: "Should be dropped." },
      ]),
    } as Awaited<ReturnType<typeof generateText>>);

    const entries = await synthesiseKnowledge({
      clinicName: "Acme",
      places: spiresPlaces,
      companiesHouse: null,
      website: null,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe("services");
  });

  it("drops entries missing title or content", async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: buildLlmJson([
        { category: "services", title: "", content: "No title." },
        { category: "services", title: "No content", content: "" },
        { category: "services", title: "Good", content: "Valid content." },
      ]),
    } as Awaited<ReturnType<typeof generateText>>);

    const entries = await synthesiseKnowledge({
      clinicName: "Acme",
      places: spiresPlaces,
      companiesHouse: null,
      website: null,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Good");
  });

  it("defaults confidence to medium when LLM omits it", async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: buildLlmJson([
        { category: "services", title: "Physio", content: "Treatment." },
      ]),
    } as Awaited<ReturnType<typeof generateText>>);

    const entries = await synthesiseKnowledge({
      clinicName: "Acme",
      places: spiresPlaces,
      companiesHouse: null,
      website: null,
    });

    expect(entries[0].confidence).toBe("medium");
  });

  it("tolerates JSON wrapped in markdown code fences", async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text:
        "```json\n" +
        buildLlmJson([
          { category: "faqs", title: "Do I need a referral?", content: "No — book direct." },
        ]) +
        "\n```",
    } as Awaited<ReturnType<typeof generateText>>);

    const entries = await synthesiseKnowledge({
      clinicName: "Acme",
      places: spiresPlaces,
      companiesHouse: null,
      website: null,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe("faqs");
  });

  it("returns [] when LLM returns invalid JSON (never throws)", async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: "this is not json at all",
    } as Awaited<ReturnType<typeof generateText>>);

    const entries = await synthesiseKnowledge({
      clinicName: "Acme",
      places: spiresPlaces,
      companiesHouse: null,
      website: null,
    });
    expect(entries).toEqual([]);
  });

  it("returns [] when LLM call throws (never leaks errors)", async () => {
    mockedGenerateText.mockRejectedValueOnce(new Error("Anthropic timeout"));

    const entries = await synthesiseKnowledge({
      clinicName: "Acme",
      places: spiresPlaces,
      companiesHouse: null,
      website: null,
    });
    expect(entries).toEqual([]);
  });

  it("passes all signals to the LLM prompt as structured evidence blocks", async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: buildLlmJson([]),
    } as Awaited<ReturnType<typeof generateText>>);

    await synthesiseKnowledge({
      clinicName: "Spires Physiotherapy",
      places: spiresPlaces,
      companiesHouse: spiresCH,
      website: spiresWebsite,
    });

    expect(mockedGenerateText).toHaveBeenCalledTimes(1);
    const call = mockedGenerateText.mock.calls[0][0];
    const prompt = String(call.prompt ?? "");

    expect(prompt).toContain("Spires Physiotherapy");
    expect(prompt).toContain("Mill Lane");
    expect(prompt).toContain("12345678"); // company number
    expect(prompt).toContain("back pain"); // website text
    expect(call.system).toBeDefined();
  });
});
