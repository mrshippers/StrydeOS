"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import type { KnowledgeEntry, KnowledgeCategory } from "@/lib/ava/ava-knowledge";
import { CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, CATEGORY_SUGGESTIONS } from "@/lib/ava/ava-knowledge";
import KnowledgeEntryRow from "./KnowledgeEntryRow";

interface KnowledgeCategoryCardProps {
  category: KnowledgeCategory;
  entries: KnowledgeEntry[];
  onUpdateEntry: (id: string, updates: Partial<Pick<KnowledgeEntry, "title" | "content">>) => void;
  onRemoveEntry: (id: string) => void;
  onAddEntry: (category: KnowledgeCategory, title: string, content: string) => void;
  /** Entries auto-populated from the Clinic Details form (read-only) */
  autoEntries?: Array<{ title: string; content: string; note: string }>;
}

export default function KnowledgeCategoryCard({
  category,
  entries,
  onUpdateEntry,
  onRemoveEntry,
  onAddEntry,
  autoEntries = [],
}: KnowledgeCategoryCardProps) {
  const [expanded, setExpanded] = useState(entries.length > 0 || autoEntries.length > 0);

  const label = CATEGORY_LABELS[category];
  const description = CATEGORY_DESCRIPTIONS[category];
  const totalCount = entries.length + autoEntries.length;

  return (
    <div className="rounded-xl bg-cloud-light/30 border border-border/50 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-cloud-light/60 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-navy">{label}</span>
          {totalCount > 0 && (
            <span className="text-[10px] text-muted bg-cloud-light rounded-full px-2 py-0.5">
              {totalCount} {totalCount === 1 ? "entry" : "entries"}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp size={14} className="text-muted" />
        ) : (
          <ChevronDown size={14} className="text-muted" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-4 pt-1 border-t border-border/40">
          <p className="text-[11px] text-muted mb-3">{description}</p>

          {/* Auto-populated entries (read-only, from Clinic Details) */}
          {autoEntries.map((entry, i) => (
            <KnowledgeEntryRow
              key={`auto-${i}`}
              title={entry.title}
              content={entry.content}
              readOnly
              readOnlyNote={entry.note}
              onUpdate={() => {}}
              onRemove={() => {}}
            />
          ))}

          {/* User-editable entries */}
          {entries.map((entry) => (
            <KnowledgeEntryRow
              key={entry.id}
              title={entry.title}
              content={entry.content}
              onUpdate={(updates) => onUpdateEntry(entry.id, updates)}
              onRemove={() => onRemoveEntry(entry.id)}
            />
          ))}

          {/* Suggestions — shown when no user entries exist */}
          {entries.length === 0 && (
            <div className="space-y-2 mt-1">
              {CATEGORY_SUGGESTIONS[category].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => onAddEntry(category, suggestion.title, suggestion.content)}
                  className="w-full text-left rounded-lg border border-dashed border-border/40 px-3.5 py-2.5 hover:border-blue/30 hover:bg-blue/[0.02] transition-all group"
                >
                  <p className="text-[12px] text-muted/50 italic group-hover:text-muted/70 transition-colors">
                    {suggestion.title}
                  </p>
                  <p className="text-[11px] text-muted/35 italic mt-0.5 line-clamp-1 group-hover:text-muted/50 transition-colors">
                    {suggestion.content}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Add entry button */}
          <button
            onClick={() => onAddEntry(category, "", "")}
            className="mt-3 flex items-center gap-1.5 text-[12px] text-blue hover:text-blue-bright font-medium transition-colors"
          >
            <Plus size={13} />
            Add entry
          </button>
        </div>
      )}
    </div>
  );
}
