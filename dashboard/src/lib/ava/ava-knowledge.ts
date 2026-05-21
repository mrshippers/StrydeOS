/**
 * Ava Knowledge Base — types, compilation, and seed data.
 *
 * Knowledge entries are stored in Firestore at clinics/{clinicId}.ava.knowledge[]
 * and synced to ElevenLabs' knowledge base for semantic retrieval during calls.
 *
 * Each category becomes a separate document in ElevenLabs KB for better
 * semantic boundaries during retrieval.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type KnowledgeCategory =
  | "services"   // Services & Treatments
  | "team"       // Team & Clinicians
  | "location"   // Location & Access
  | "pricing"    // Pricing
  | "policies"   // Policies
  | "faqs"       // FAQs
  | "custom";    // Custom Notes

/** Where this entry came from. Defaults to "manual" if absent (backward compat). */
export type KnowledgeSource = "manual" | "auto" | "ai_generated";

/** Synth confidence hint, used only for auto-enriched entries. */
export type KnowledgeConfidence = "high" | "medium" | "low";

/**
 * Review state for an entry.
 *  - approved (or absent / legacy) → live, visible to Ava
 *  - draft → AI-generated suggestion in the review queue, NOT visible to Ava
 *  - archived → soft-deleted, NOT visible to Ava
 */
export type KnowledgeStatus = "draft" | "approved" | "archived";

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  updatedAt: string;
  /** Provenance — auto-enrichment marks entries for UI badging and conflict-free re-runs. */
  source?: KnowledgeSource;
  /** Synth confidence, only meaningful for source === "auto". */
  confidence?: KnowledgeConfidence;
  /** Review state. Absent = legacy entry, treated as approved. */
  status?: KnowledgeStatus;
  /** Provenance for AI-generated drafts. */
  generatedFrom?: {
    buzzword: string;
    model: string;
    promptVersion: string;
  };
}

// ─── Draft / approval helpers ────────────────────────────────────────────────

/**
 * Apply backward-compat defaults when reading an entry from Firestore.
 * Pre-Slice-1 entries have no status / source; they're treated as
 * approved manual entries so they remain live without a migration.
 */
export function normaliseEntryForRead(entry: KnowledgeEntry): KnowledgeEntry {
  return {
    ...entry,
    status: entry.status ?? "approved",
    source: entry.source ?? "manual",
  };
}

/**
 * Defaults applied when creating a new entry.
 * Manual entries (UI path) go straight to live. AI-generated entries land
 * as drafts in the review queue and require explicit approval.
 */
export function newEntryDefaults(
  source: KnowledgeSource,
): { status: KnowledgeStatus; source: KnowledgeSource } {
  return {
    status: source === "ai_generated" ? "draft" : "approved",
    source,
  };
}

/**
 * Filter to entries that are visible to Ava. Drafts and archived entries
 * are gated out. Entries with no status (legacy, pre-Slice-1) are treated
 * as approved so existing clinics don't lose their KB on upgrade.
 */
export function filterLiveEntries(entries: KnowledgeEntry[]): KnowledgeEntry[] {
  return entries.filter((e) => e.status === undefined || e.status === "approved");
}

export interface KnowledgeChunk {
  name: string;
  content: string;
}

export const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  services: "Services & Treatments",
  team: "Team & Clinicians",
  location: "Location & Access",
  pricing: "Pricing",
  policies: "Policies",
  faqs: "FAQs",
  custom: "Custom Notes",
};

export const CATEGORY_DESCRIPTIONS: Record<KnowledgeCategory, string> = {
  services: "What your clinic offers — specialties, conditions treated, service types",
  team: "Clinicians, their schedules, specialties, and availability",
  location: "Address, directions, transport links, parking, accessibility",
  pricing: "Appointment types and their prices",
  policies: "Cancellation, late arrival, insurance, data protection policies",
  faqs: "Common questions patients ask and the answers Ava should give",
  custom: "Seasonal hours, closures, promotions, or anything else Ava should know",
};

/** Placeholder suggestions shown in grey italic when a category is empty */
export const CATEGORY_SUGGESTIONS: Record<KnowledgeCategory, Array<{ title: string; content: string }>> = {
  services: [
    { title: "Sports Physiotherapy", content: "We specialise in ACL recovery, rotator cuff injuries, and running-related conditions." },
    { title: "Post-Surgical Rehab", content: "Rehabilitation programmes following knee, hip, or shoulder surgery." },
  ],
  team: [
    { title: "Dr Sarah Chen", content: "Senior physio. Mon, Wed, Fri. Morning slots: 9:00, 9:45, 10:30. Afternoon: 14:00, 14:45, 15:30. Specialises in spinal conditions." },
    { title: "James Okafor", content: "Sports physio. Tue, Thu, Sat (1st of month). Evening slots available Thursdays." },
  ],
  location: [
    { title: "Bus Routes", content: "Routes 28 and 139 stop on the high street, 3 minutes' walk from the clinic." },
    { title: "Accessibility", content: "Step-free access via the side entrance on Park Road. Lift to first floor." },
  ],
  pricing: [
    { title: "Initial Assessment", content: "£85 for a 45-minute initial assessment." },
    { title: "Follow-up", content: "£65 for a 45-minute follow-up session." },
    { title: "Block Booking", content: "Book 5 sessions upfront for £280 (save £45)." },
  ],
  policies: [
    { title: "Cancellation Policy", content: "24-hour notice required. Late cancellations may be charged at the full session rate." },
    { title: "Late Arrivals", content: "If you arrive late, your session will still end at the scheduled time." },
  ],
  faqs: [
    { title: "What should I wear?", content: "Comfortable clothing that lets the physio access the area being treated." },
    { title: "Do I need a GP referral?", content: "No referral needed — you can book directly with us." },
  ],
  custom: [
    { title: "Christmas Hours", content: "Closed 25–26 Dec and 1 Jan. Reduced hours 27–31 Dec (10:00–15:00)." },
    { title: "New Service Launch", content: "We now offer shockwave therapy — mention it to patients who ask about tendon issues." },
  ],
};

export const CATEGORY_ORDER: KnowledgeCategory[] = [
  "services",
  "team",
  "location",
  "pricing",
  "policies",
  "faqs",
  "custom",
];

// ─── Sync state types ─────────────────────────────────────────────────────────

export interface SyncLogEntry {
  timestamp: string;
  status: "success" | "error";
  method?: "knowledge_base" | "system_prompt_fallback";
  error?: string;
}

export interface SyncDiff {
  changedCategories: string[];
  entriesAdded: number;
  entriesModified: number;
  entriesRemoved: number;
}

export interface AvaSyncState {
  status: "synced" | "error" | "pending" | null;
  lastSyncedAt: string | null;
  lastAttemptedAt: string | null;
  avaAgentId: string | null;
  lastError: string | null;
  lastSyncDiff: SyncDiff | null;
  syncLog: SyncLogEntry[];
}

// ─── Compilation ─────────────────────────────────────────────────────────────

/**
 * Compile all knowledge entries into a single document string.
 * Used as system prompt fallback when ElevenLabs KB API is unavailable.
 *
 * Filters via filterLiveEntries first — drafts and archived entries never
 * reach the Ava agent, even via the fallback path.
 */
export function compileKnowledgeDocument(entries: KnowledgeEntry[]): string {
  const live = filterLiveEntries(entries);
  if (live.length === 0) return "";

  const sections: string[] = [];

  for (const category of CATEGORY_ORDER) {
    const categoryEntries = live.filter((e) => e.category === category);
    if (categoryEntries.length === 0) continue;

    const label = CATEGORY_LABELS[category];
    const entryLines = categoryEntries
      .map((e) => `### ${e.title}\n${e.content}`)
      .join("\n\n");

    sections.push(`## ${label}\n\n${entryLines}`);
  }

  return sections.join("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n");
}

/**
 * Compile knowledge entries into per-category chunks for ElevenLabs KB.
 * Each chunk becomes a separate document for better semantic search boundaries.
 *
 * Filters via filterLiveEntries first — drafts and archived entries are
 * invisible to the sync layer.
 */
export function compileKnowledgeChunks(entries: KnowledgeEntry[]): KnowledgeChunk[] {
  const live = filterLiveEntries(entries);
  const chunks: KnowledgeChunk[] = [];

  for (const category of CATEGORY_ORDER) {
    const categoryEntries = live.filter((e) => e.category === category);
    if (categoryEntries.length === 0) continue;

    const label = CATEGORY_LABELS[category];
    const content = categoryEntries
      .map((e) => `${e.title}: ${e.content}`)
      .join("\n\n");

    chunks.push({ name: label, content });
  }

  return chunks;
}

// ─── Spires Seed Data ────────────────────────────────────────────────────────
// Moved to scripts/seed-ava-knowledge.ts — this re-export exists for backward
// compatibility with the seed script. No runtime code should call this function.

export { seedSpiresKnowledge } from "./spires-seed-data";
