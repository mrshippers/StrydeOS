/**
 * Clinic-onboarding enrichment orchestrator.
 *
 * Flow:
 *   1. Fan out Places + Companies House in parallel (both independent of each other).
 *   2. Pick a website URL (explicit > Places website). Fetch if we have one.
 *   3. Hand the three signals to the Haiku synthesiser.
 *
 * Nothing throws. Each source failure is isolated — one down does not take
 * down the others, and synthesiser is always called (it handles the all-null case).
 */

import type { KnowledgeEntry } from "../ava-knowledge";
import {
  fetchPlaces,
  fetchCompaniesHouse,
  fetchWebsite,
  type PlacesResult,
  type CompaniesHouseResult,
  type WebsiteResult,
} from "./sources";
import { synthesiseKnowledge } from "./synthesise";

export interface EnrichInput {
  clinicName: string;
  country?: string;
  /** Override Places-resolved website (e.g. user typed it in at signup). */
  explicitWebsite?: string;
}

export interface EnrichResult {
  entries: KnowledgeEntry[];
  sources: {
    places: boolean;
    companiesHouse: boolean;
    website: boolean;
  };
  /** Structured signals for the UI, so it can show "Found via Google" etc. */
  resolved: {
    places: PlacesResult | null;
    companiesHouse: CompaniesHouseResult | null;
    website: WebsiteResult | null;
  };
}

export async function enrichClinic(input: EnrichInput): Promise<EnrichResult> {
  // Fan out the two fully-independent sources in parallel
  const [placesSettled, chSettled] = await Promise.allSettled([
    fetchPlaces({ clinicName: input.clinicName, country: input.country }),
    fetchCompaniesHouse({ clinicName: input.clinicName }),
  ]);

  const places =
    placesSettled.status === "fulfilled" ? placesSettled.value : null;
  const companiesHouse =
    chSettled.status === "fulfilled" ? chSettled.value : null;

  // Website fetch is chained — prefer explicit override, fall back to Places
  const websiteUrl = input.explicitWebsite ?? places?.website ?? undefined;
  let website: WebsiteResult | null = null;
  if (websiteUrl) {
    try {
      website = await fetchWebsite(websiteUrl);
    } catch {
      website = null;
    }
  }

  const entries = await synthesiseKnowledge({
    clinicName: input.clinicName,
    places,
    companiesHouse,
    website,
  });

  return {
    entries,
    sources: {
      places: places !== null,
      companiesHouse: companiesHouse !== null,
      website: website !== null,
    },
    resolved: { places, companiesHouse, website },
  };
}
