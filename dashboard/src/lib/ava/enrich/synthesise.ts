/**
 * Haiku 4.5 synthesiser — turns raw public-source signals into Ava knowledge
 * entries across the 7 Ava categories.
 *
 * Contract:
 * - Never throws. On any failure (LLM error, malformed JSON, schema rejection)
 *   returns [] and the orchestrator proceeds without auto-entries.
 * - Every emitted entry has source: "auto" and a validated category.
 * - Entries are deduped within the same category by lower-cased title.
 */

import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import {
  CATEGORY_ORDER,
  type KnowledgeCategory,
  type KnowledgeConfidence,
  type KnowledgeEntry,
} from "../ava-knowledge";
import type {
  PlacesResult,
  CompaniesHouseResult,
  WebsiteResult,
} from "./sources";

const VALID_CATEGORIES: ReadonlySet<string> = new Set(CATEGORY_ORDER);
const VALID_CONFIDENCE: ReadonlySet<string> = new Set<KnowledgeConfidence>([
  "high",
  "medium",
  "low",
]);

export interface SynthesiseInput {
  clinicName: string;
  places: PlacesResult | null;
  companiesHouse: CompaniesHouseResult | null;
  website: WebsiteResult | null;
}

const SYSTEM_PROMPT = `You are the onboarding assistant inside StrydeOS, a clinical performance platform for private physiotherapy practices in the UK.

Your job: given raw public data about a clinic (Google Places, Companies House, clinic website text), produce a structured knowledge base that Ava — the clinic's AI voice receptionist — can use to answer patient calls accurately.

Rules:
- Only state facts that are directly supported by the evidence. If evidence is weak, mark confidence: "low" (or omit the entry entirely).
- Never invent clinician names, prices, services, or policies that are not in the evidence.
- Write in warm, human, UK English — short sentences, no corporate filler, no emojis.
- Prices in £. Times in 24h or "morning / afternoon / evening" when hours are fuzzy.
- Do not include the clinic's own name in every content line — Ava already knows it.
- If you cannot find useful information for a category, skip it. Fewer accurate entries > more speculative ones.

Output format: strict JSON only, no prose around it:
{
  "entries": [
    { "category": "services" | "team" | "location" | "pricing" | "policies" | "faqs" | "custom",
      "title": "short label, ~1-4 words",
      "content": "1-3 sentence answer Ava will read or paraphrase",
      "confidence": "high" | "medium" | "low" }
  ]
}

Category meaning:
- services: conditions treated, modalities, service types (physio, shockwave, online consults)
- team: clinicians — names, days, specialties (only if evidence is explicit)
- location: address, nearest station, parking, accessibility
- pricing: appointment prices (IA, follow-up, block bookings)
- policies: cancellation window, insurance accepted, late arrivals, under-16s
- faqs: what to wear, what to bring, referral needed, appointment length
- custom: seasonal hours, closures, anything else worth knowing`;

export async function synthesiseKnowledge(input: SynthesiseInput): Promise<KnowledgeEntry[]> {
  if (!input.places && !input.companiesHouse && !input.website) return [];

  const prompt = buildPrompt(input);

  let text: string;
  try {
    const result = await generateText({
      model: gateway("anthropic/claude-haiku-4.5"),
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 2_000,
      temperature: 0.2,
    });
    text = result.text;
  } catch {
    return [];
  }

  const parsed = parseJsonLenient(text);
  if (!parsed || !Array.isArray(parsed.entries)) return [];

  const now = new Date().toISOString();
  const seen = new Set<string>();
  const out: KnowledgeEntry[] = [];

  for (const raw of parsed.entries) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as {
      category?: unknown;
      title?: unknown;
      content?: unknown;
      confidence?: unknown;
    };

    const category = typeof r.category === "string" ? r.category.trim() : "";
    const title = typeof r.title === "string" ? r.title.trim() : "";
    const content = typeof r.content === "string" ? r.content.trim() : "";
    const rawConfidence = typeof r.confidence === "string" ? r.confidence.trim() : "";

    if (!VALID_CATEGORIES.has(category)) continue;
    if (!title || !content) continue;

    const confidence: KnowledgeConfidence = VALID_CONFIDENCE.has(rawConfidence)
      ? (rawConfidence as KnowledgeConfidence)
      : "medium";

    const dedupeKey = `${category}::${title.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      id: `auto-${category}-${randomSuffix()}`,
      category: category as KnowledgeCategory,
      title,
      content,
      updatedAt: now,
      source: "auto",
      confidence,
    });
  }

  return out;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function buildPrompt(input: SynthesiseInput): string {
  const parts: string[] = [];
  parts.push(`Clinic name: ${input.clinicName}`);
  parts.push("");

  if (input.places) {
    parts.push("— EVIDENCE: Google Places —");
    parts.push(`name: ${input.places.name}`);
    if (input.places.address) parts.push(`address: ${input.places.address}`);
    if (input.places.phone) parts.push(`phone: ${input.places.phone}`);
    if (input.places.website) parts.push(`website: ${input.places.website}`);
    if (input.places.hours?.length) {
      parts.push("opening hours:");
      for (const h of input.places.hours) parts.push(`  ${h}`);
    }
    if (typeof input.places.rating === "number") {
      parts.push(`google rating: ${input.places.rating} (${input.places.userRatingCount ?? 0} reviews)`);
    }
    parts.push("");
  }

  if (input.companiesHouse) {
    parts.push("— EVIDENCE: Companies House —");
    parts.push(`company: ${input.companiesHouse.companyName}`);
    parts.push(`company number: ${input.companiesHouse.companyNumber}`);
    if (input.companiesHouse.status) parts.push(`status: ${input.companiesHouse.status}`);
    if (input.companiesHouse.incorporatedOn)
      parts.push(`incorporated: ${input.companiesHouse.incorporatedOn}`);
    if (input.companiesHouse.registeredAddress)
      parts.push(`registered address: ${input.companiesHouse.registeredAddress}`);
    if (input.companiesHouse.sicCodes.length)
      parts.push(`SIC codes: ${input.companiesHouse.sicCodes.join(", ")}`);
    parts.push("");
  }

  if (input.website) {
    parts.push("— EVIDENCE: Clinic website —");
    parts.push(`url: ${input.website.url}`);
    if (input.website.title) parts.push(`page title: ${input.website.title}`);
    parts.push("extracted text:");
    parts.push(input.website.text);
    parts.push("");
  }

  parts.push(
    "Now produce the knowledge base JSON. Only include entries you can defend from the evidence above.",
  );
  return parts.join("\n");
}

/** Accept raw JSON or JSON wrapped in ```json fences. Returns null on failure. */
function parseJsonLenient(text: string): { entries?: unknown } | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedMatch ? fencedMatch[1] : trimmed;

  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object") return parsed as { entries?: unknown };
    return null;
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    try {
      return JSON.parse(objectMatch[0]) as { entries?: unknown };
    } catch {
      return null;
    }
  }
}

function randomSuffix(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return uuid.replace(/-/g, "").slice(0, 10);
}
