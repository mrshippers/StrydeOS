/**
 * Tests for the draft / approval pipeline on AvaKnowledgeEntry.
 *
 * Slice 1 of the Ava KB AI auto-generator: extends entries with a status field
 * so AI-generated drafts can land in a review queue without leaking to the
 * live Ava agent. Drafts and archived entries MUST be invisible to the sync
 * layer (compileKnowledgeChunks / compileKnowledgeDocument).
 *
 * Run: npx vitest run src/lib/ava/__tests__/knowledge-draft.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  compileKnowledgeChunks,
  compileKnowledgeDocument,
  filterLiveEntries,
  normaliseEntryForRead,
  newEntryDefaults,
  type KnowledgeEntry,
} from "../ava-knowledge";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function entry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "test-id",
    category: "services",
    title: "Sports Physio",
    content: "ACL recovery and rotator cuff work.",
    updatedAt: "2026-05-20T09:00:00.000Z",
    ...overrides,
  };
}

// ── Backward-compat migration on read ────────────────────────────────────────

describe("normaliseEntryForRead — backward compat", () => {
  it("defaults missing status to 'approved' (existing entries are live)", () => {
    const raw = entry({ status: undefined });
    const out = normaliseEntryForRead(raw);
    expect(out.status).toBe("approved");
  });

  it("defaults missing source to 'manual' (legacy entries)", () => {
    const raw = entry({ source: undefined });
    const out = normaliseEntryForRead(raw);
    expect(out.source).toBe("manual");
  });

  it("preserves status when present", () => {
    const raw = entry({ status: "draft", source: "ai_generated" });
    const out = normaliseEntryForRead(raw);
    expect(out.status).toBe("draft");
    expect(out.source).toBe("ai_generated");
  });

  it("preserves the legacy 'auto' source value untouched", () => {
    const raw = entry({ source: "auto" });
    const out = normaliseEntryForRead(raw);
    expect(out.source).toBe("auto");
  });
});

// ── Defaults on entry creation ───────────────────────────────────────────────

describe("newEntryDefaults", () => {
  it("manual entries default to status='approved' (UI path stays live)", () => {
    const out = newEntryDefaults("manual");
    expect(out.status).toBe("approved");
    expect(out.source).toBe("manual");
  });

  it("ai_generated entries default to status='draft' (review-gated)", () => {
    const out = newEntryDefaults("ai_generated");
    expect(out.status).toBe("draft");
    expect(out.source).toBe("ai_generated");
  });
});

// ── Live-sync filtering ──────────────────────────────────────────────────────

describe("filterLiveEntries — only approved entries reach Ava", () => {
  const approved = entry({ id: "a", status: "approved" });
  const draft = entry({ id: "b", status: "draft", source: "ai_generated" });
  const archived = entry({ id: "c", status: "archived" });
  const legacyNoStatus = entry({ id: "d", status: undefined });

  it("includes status='approved'", () => {
    expect(filterLiveEntries([approved]).map((e) => e.id)).toEqual(["a"]);
  });

  it("excludes status='draft' (AI drafts stay in review queue)", () => {
    expect(filterLiveEntries([approved, draft]).map((e) => e.id)).toEqual(["a"]);
  });

  it("excludes status='archived'", () => {
    expect(filterLiveEntries([approved, archived]).map((e) => e.id)).toEqual([
      "a",
    ]);
  });

  it("includes legacy entries with no status field (treated as approved)", () => {
    expect(filterLiveEntries([legacyNoStatus]).map((e) => e.id)).toEqual(["d"]);
  });

  it("filters out all non-approved in a mixed array", () => {
    const out = filterLiveEntries([approved, draft, archived, legacyNoStatus]);
    expect(out.map((e) => e.id)).toEqual(["a", "d"]);
  });
});

// ── Compile pipeline must respect status ─────────────────────────────────────

describe("compileKnowledgeChunks — drafts are invisible to Ava sync", () => {
  it("omits draft entries from compiled chunks", () => {
    const entries: KnowledgeEntry[] = [
      entry({
        id: "live",
        category: "services",
        title: "Sports Physio",
        content: "ACL recovery.",
        status: "approved",
      }),
      entry({
        id: "draft",
        category: "services",
        title: "Shockwave",
        content: "AI-generated suggestion, not yet reviewed.",
        status: "draft",
        source: "ai_generated",
      }),
    ];

    const chunks = compileKnowledgeChunks(entries);
    const services = chunks.find((c) => c.name === "Services & Treatments");

    expect(services).toBeDefined();
    expect(services!.content).toContain("Sports Physio");
    expect(services!.content).not.toContain("Shockwave");
  });

  it("omits archived entries from compiled chunks", () => {
    const entries: KnowledgeEntry[] = [
      entry({
        id: "live",
        category: "pricing",
        title: "Initial",
        content: "Sixty-five pounds.",
        status: "approved",
      }),
      entry({
        id: "old",
        category: "pricing",
        title: "Old Initial",
        content: "Fifty pounds (outdated).",
        status: "archived",
      }),
    ];

    const chunks = compileKnowledgeChunks(entries);
    const pricing = chunks.find((c) => c.name === "Pricing");

    expect(pricing).toBeDefined();
    expect(pricing!.content).toContain("sixty-five pounds".replace(/^./, "S"));
    expect(pricing!.content).not.toContain("Old Initial");
  });

  it("drops the category entirely if every entry in it is a draft", () => {
    const entries: KnowledgeEntry[] = [
      entry({
        id: "d1",
        category: "faqs",
        title: "What to wear",
        content: "Comfortable kit.",
        status: "draft",
        source: "ai_generated",
      }),
    ];

    const chunks = compileKnowledgeChunks(entries);
    expect(chunks.find((c) => c.name === "FAQs")).toBeUndefined();
  });
});

describe("compileKnowledgeDocument — drafts are invisible in fallback prompt", () => {
  it("excludes draft and archived entries", () => {
    const entries: KnowledgeEntry[] = [
      entry({
        id: "live",
        category: "policies",
        title: "Cancellation",
        content: "Twenty-four hours notice.",
        status: "approved",
      }),
      entry({
        id: "draft",
        category: "policies",
        title: "Late arrivals (AI draft)",
        content: "Should not appear in fallback prompt.",
        status: "draft",
        source: "ai_generated",
      }),
      entry({
        id: "arch",
        category: "policies",
        title: "Old policy",
        content: "Outdated, must be hidden.",
        status: "archived",
      }),
    ];

    const doc = compileKnowledgeDocument(entries);

    expect(doc).toContain("Cancellation");
    expect(doc).not.toContain("Late arrivals (AI draft)");
    expect(doc).not.toContain("Old policy");
  });

  it("returns empty string when only drafts exist (Ava sees nothing)", () => {
    const entries: KnowledgeEntry[] = [
      entry({
        id: "d",
        category: "services",
        title: "AI Suggestion",
        content: "Pending approval.",
        status: "draft",
        source: "ai_generated",
      }),
    ];
    expect(compileKnowledgeDocument(entries)).toBe("");
  });
});

// ── generatedFrom provenance ─────────────────────────────────────────────────

describe("generatedFrom provenance on ai_generated entries", () => {
  it("accepts a typed generatedFrom block with buzzword / model / promptVersion", () => {
    const e: KnowledgeEntry = entry({
      status: "draft",
      source: "ai_generated",
      generatedFrom: {
        buzzword: "shockwave therapy",
        model: "claude-haiku-4.5",
        promptVersion: "kb-autogen-v1",
      },
    });

    expect(e.generatedFrom?.buzzword).toBe("shockwave therapy");
    expect(e.generatedFrom?.model).toBe("claude-haiku-4.5");
    expect(e.generatedFrom?.promptVersion).toBe("kb-autogen-v1");
  });
});
