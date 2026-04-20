/**
 * Tests for enrichClinic() — the parallel orchestrator that fans out to
 * Places → Companies House → website, chains website fetch off the Places
 * website URL, and calls the synthesiser once.
 *
 * Run: npx vitest run src/lib/ava/enrich/__tests__/orchestrator.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock leaf modules BEFORE importing the orchestrator
vi.mock("../sources", () => ({
  fetchPlaces: vi.fn(),
  fetchCompaniesHouse: vi.fn(),
  fetchWebsite: vi.fn(),
}));

vi.mock("../synthesise", () => ({
  synthesiseKnowledge: vi.fn(),
}));

import { enrichClinic } from "../orchestrator";
import { fetchPlaces, fetchCompaniesHouse, fetchWebsite } from "../sources";
import { synthesiseKnowledge } from "../synthesise";

const mockedPlaces = vi.mocked(fetchPlaces);
const mockedCH = vi.mocked(fetchCompaniesHouse);
const mockedWebsite = vi.mocked(fetchWebsite);
const mockedSynth = vi.mocked(synthesiseKnowledge);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enrichClinic", () => {
  it("runs Places and Companies House in parallel, then website off Places URL", async () => {
    mockedPlaces.mockResolvedValue({
      name: "Spires",
      address: "45 Mill Lane",
      phone: "020 7794 0202",
      website: "https://spires.co.uk",
      hours: null,
      rating: 4.9,
      userRatingCount: 128,
    });
    mockedCH.mockResolvedValue({
      companyNumber: "12345678",
      companyName: "SPIRES PHYSIOTHERAPY LTD",
      status: "active",
      incorporatedOn: "2018-04-12",
      sicCodes: ["86900"],
      registeredAddress: "45 Mill Lane",
    });
    mockedWebsite.mockResolvedValue({
      url: "https://spires.co.uk",
      title: "Spires Physio",
      text: "We treat back pain...",
    });
    mockedSynth.mockResolvedValue([
      {
        id: "auto-services-xyz",
        category: "services",
        title: "Physio",
        content: "back pain",
        updatedAt: "2026-04-20T00:00:00Z",
        source: "auto",
        confidence: "high",
      },
    ]);

    const result = await enrichClinic({ clinicName: "Spires Physiotherapy", country: "uk" });

    expect(mockedPlaces).toHaveBeenCalledWith(
      { clinicName: "Spires Physiotherapy", country: "uk" },
    );
    expect(mockedCH).toHaveBeenCalledWith(
      { clinicName: "Spires Physiotherapy" },
    );
    expect(mockedWebsite).toHaveBeenCalledWith("https://spires.co.uk");
    expect(mockedSynth).toHaveBeenCalledTimes(1);

    expect(result.entries).toHaveLength(1);
    expect(result.sources.places).toBe(true);
    expect(result.sources.companiesHouse).toBe(true);
    expect(result.sources.website).toBe(true);
  });

  it("uses the explicit website URL if provided, ignoring Places website", async () => {
    mockedPlaces.mockResolvedValue({
      name: "Acme",
      address: null,
      phone: null,
      website: "https://wrong.example.com",
      hours: null,
      rating: null,
      userRatingCount: null,
    });
    mockedCH.mockResolvedValue(null);
    mockedWebsite.mockResolvedValue(null);
    mockedSynth.mockResolvedValue([]);

    await enrichClinic({
      clinicName: "Acme Clinic",
      country: "uk",
      explicitWebsite: "https://correct.example.com",
    });

    expect(mockedWebsite).toHaveBeenCalledWith("https://correct.example.com");
  });

  it("skips website fetch when neither explicit URL nor Places URL is available", async () => {
    mockedPlaces.mockResolvedValue(null);
    mockedCH.mockResolvedValue(null);
    mockedWebsite.mockResolvedValue(null);
    mockedSynth.mockResolvedValue([]);

    await enrichClinic({ clinicName: "Acme", country: "uk" });

    expect(mockedWebsite).not.toHaveBeenCalled();
  });

  it("still calls synthesiser when all sources return null (synth handles empty case)", async () => {
    mockedPlaces.mockResolvedValue(null);
    mockedCH.mockResolvedValue(null);
    mockedSynth.mockResolvedValue([]);

    const result = await enrichClinic({ clinicName: "NoMatch", country: "uk" });

    expect(mockedSynth).toHaveBeenCalledTimes(1);
    expect(result.entries).toEqual([]);
    expect(result.sources.places).toBe(false);
    expect(result.sources.companiesHouse).toBe(false);
    expect(result.sources.website).toBe(false);
  });

  it("sources failures do not abort other sources", async () => {
    mockedPlaces.mockRejectedValue(new Error("Places blew up"));
    mockedCH.mockResolvedValue({
      companyNumber: "99999",
      companyName: "BACKUP LTD",
      status: "active",
      incorporatedOn: null,
      sicCodes: [],
      registeredAddress: null,
    });
    mockedSynth.mockResolvedValue([]);

    const result = await enrichClinic({ clinicName: "Backup", country: "uk" });

    expect(result.sources.places).toBe(false);
    expect(result.sources.companiesHouse).toBe(true);
    expect(mockedSynth).toHaveBeenCalledTimes(1);
  });
});
