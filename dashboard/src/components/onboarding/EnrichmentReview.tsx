"use client";

/**
 * Review UI for auto-populated Ava knowledge-base entries during onboarding.
 *
 * Behaviour:
 * - Loads entries from Firestore via useAvaKnowledge (same source as the
 *   receptionist-page editor, so edits here sync cleanly everywhere).
 * - Shows only entries with source === "auto" grouped by category.
 * - Edit / remove / add-missing map directly to the existing hook actions,
 *   so every change persists to clinics/{id}.ava.knowledge[] in real time.
 */

import { useMemo, useState } from "react";
import {
  Check,
  Edit2,
  Trash2,
  Plus,
  Loader2,
  Sparkles,
  Globe,
  Building2,
  FileText,
} from "lucide-react";
import { useAvaKnowledge } from "@/hooks/useAvaKnowledge";
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from "@/lib/ava/ava-knowledge";

interface EnrichmentReviewProps {
  clinicId: string | undefined;
  sources: { places: boolean; companiesHouse: boolean; website: boolean } | null;
  running: boolean;
  onRunEnrichment: () => Promise<void>;
  enrichmentError: string | null;
}

export default function EnrichmentReview({
  clinicId,
  sources,
  running,
  onRunEnrichment,
  enrichmentError,
}: EnrichmentReviewProps) {
  const { entries, loading, updateEntry, removeEntry, addEntry, saving } =
    useAvaKnowledge(clinicId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [addingCategory, setAddingCategory] = useState<KnowledgeCategory | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const entriesByCategory = useMemo(() => {
    const map = new Map<KnowledgeCategory, KnowledgeEntry[]>();
    for (const cat of CATEGORY_ORDER) {
      map.set(
        cat,
        entries.filter((e) => e.category === cat),
      );
    }
    return map;
  }, [entries]);

  const totalEntries = entries.length;
  const autoEntries = entries.filter((e) => e.source === "auto").length;

  function beginEdit(entry: KnowledgeEntry) {
    setEditingId(entry.id);
    setDraftTitle(entry.title);
    setDraftContent(entry.content);
  }

  function commitEdit(id: string) {
    updateEntry(id, { title: draftTitle, content: draftContent });
    setEditingId(null);
  }

  async function handleAddNew(category: KnowledgeCategory) {
    if (!newTitle.trim() || !newContent.trim()) return;
    await addEntry(category, newTitle.trim(), newContent.trim());
    setNewTitle("");
    setNewContent("");
    setAddingCategory(null);
  }

  // ── Loading / initial state ────────────────────────────────────────────────
  if (running || loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-blue/5 border border-blue/15">
          <Loader2 size={18} className="text-blue animate-spin" />
          <div>
            <p className="text-sm font-semibold text-navy">
              Looking up your clinic...
            </p>
            <p className="text-[11px] text-muted">
              Cross-referencing Google, Companies House, and your website
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <SourcePill icon={Globe} label="Google" status="loading" />
          <SourcePill icon={Building2} label="Companies House" status="loading" />
          <SourcePill icon={FileText} label="Website" status="loading" />
        </div>
      </div>
    );
  }

  const hasAnything = totalEntries > 0;

  return (
    <div className="space-y-5">
      {/* Source summary */}
      {sources && (
        <div className="grid grid-cols-3 gap-2">
          <SourcePill
            icon={Globe}
            label="Google"
            status={sources.places ? "found" : "missed"}
          />
          <SourcePill
            icon={Building2}
            label="Companies House"
            status={sources.companiesHouse ? "found" : "missed"}
          />
          <SourcePill
            icon={FileText}
            label="Website"
            status={sources.website ? "found" : "missed"}
          />
        </div>
      )}

      {enrichmentError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700">
          {enrichmentError}
        </div>
      )}

      {!hasAnything && !running && (
        <div className="p-5 rounded-xl border border-border bg-cloud-light text-center">
          <p className="text-sm font-semibold text-navy mb-1">
            Nothing public to pull in yet
          </p>
          <p className="text-[12px] text-muted mb-3">
            We couldn&apos;t find enough on Google or Companies House. That&apos;s fine — you
            can add entries now or skip and do it from the Receptionist page later.
          </p>
          <button
            type="button"
            onClick={() => onRunEnrichment()}
            disabled={running}
            className="text-[12px] font-semibold text-blue hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {hasAnything && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-purple" />
              <p className="text-[12px] text-muted">
                <span className="text-navy font-semibold">{autoEntries}</span>{" "}
                auto-filled, <span className="text-navy font-semibold">{totalEntries - autoEntries}</span>{" "}
                manual — edit anything that&apos;s off
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRunEnrichment()}
              disabled={running}
              className="text-[11px] font-semibold text-blue hover:underline disabled:opacity-50"
            >
              Re-run lookup
            </button>
          </div>
        </div>
      )}

      {hasAnything &&
        CATEGORY_ORDER.map((cat) => {
          const catEntries = entriesByCategory.get(cat) ?? [];
          if (catEntries.length === 0 && addingCategory !== cat) return null;

          return (
            <div key={cat} className="rounded-xl border border-border bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-cloud-light border-b border-border">
                <p className="text-[11px] font-semibold text-navy uppercase tracking-wider">
                  {CATEGORY_LABELS[cat]}
                </p>
                <button
                  type="button"
                  onClick={() => setAddingCategory(cat)}
                  className="text-[11px] text-blue font-semibold flex items-center gap-1 hover:underline"
                >
                  <Plus size={11} /> Add
                </button>
              </div>

              <div className="divide-y divide-border">
                {catEntries.map((entry) => (
                  <div key={entry.id} className="p-4">
                    {editingId === entry.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-border text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-blue/30"
                        />
                        <textarea
                          value={draftContent}
                          onChange={(e) => setDraftContent(e.target.value)}
                          rows={3}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-border text-[13px] text-navy focus:outline-none focus:ring-2 focus:ring-blue/30"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => commitEdit(entry.id)}
                            disabled={saving}
                            className="text-[11px] font-semibold text-white bg-blue px-3 py-1 rounded-lg hover:opacity-90 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="text-[11px] text-muted hover:text-navy"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-navy">{entry.title}</p>
                            {entry.source === "auto" && (
                              <span
                                className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                                  entry.confidence === "high"
                                    ? "bg-success/10 text-success"
                                    : entry.confidence === "low"
                                    ? "bg-warn/10 text-warn"
                                    : "bg-blue/10 text-blue"
                                }`}
                              >
                                Auto
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-muted leading-relaxed">{entry.content}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => beginEdit(entry)}
                            className="p-1.5 rounded-lg hover:bg-cloud-light text-muted hover:text-blue transition-colors"
                            aria-label="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeEntry(entry.id)}
                            disabled={saving}
                            className="p-1.5 rounded-lg hover:bg-cloud-light text-muted hover:text-red-600 transition-colors disabled:opacity-40"
                            aria-label="Remove"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {addingCategory === cat && (
                  <div className="p-4 space-y-2 bg-blue/5">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Title (e.g. Cancellation policy)"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-blue/30"
                    />
                    <textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      rows={3}
                      placeholder="What should Ava say to patients?"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border text-[13px] text-navy focus:outline-none focus:ring-2 focus:ring-blue/30"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddNew(cat)}
                        disabled={!newTitle.trim() || !newContent.trim() || saving}
                        className="text-[11px] font-semibold text-white bg-blue px-3 py-1 rounded-lg hover:opacity-90 disabled:opacity-40"
                      >
                        Add entry
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingCategory(null);
                          setNewTitle("");
                          setNewContent("");
                        }}
                        className="text-[11px] text-muted hover:text-navy"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

      <p className="text-[11px] text-muted text-center">
        <Check size={11} className="inline-block mr-1 text-success" />
        Edits save automatically and sync to the Receptionist page — you can keep
        refining anytime.
      </p>
    </div>
  );
}

// ── Source pill ──────────────────────────────────────────────────────────────

function SourcePill({
  icon: Icon,
  label,
  status,
}: {
  icon: React.ElementType;
  label: string;
  status: "loading" | "found" | "missed";
}) {
  const styles =
    status === "loading"
      ? "bg-blue/5 border-blue/15 text-blue"
      : status === "found"
      ? "bg-success/5 border-success/20 text-success"
      : "bg-cloud-light border-border text-muted";

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${styles}`}>
      {status === "loading" ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <Icon size={13} />
      )}
      <span className="text-[11px] font-semibold truncate">{label}</span>
      {status === "found" && <Check size={11} className="ml-auto" />}
    </div>
  );
}
