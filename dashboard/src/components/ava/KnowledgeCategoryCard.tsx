"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import type { KnowledgeEntry, KnowledgeCategory } from "@/lib/ava/ava-knowledge";
import { CATEGORY_LABELS, CATEGORY_DESCRIPTIONS } from "@/lib/ava/ava-knowledge";
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

          {/* Empty state */}
          {entries.length === 0 && autoEntries.length === 0 && (
            <p className="text-[11px] text-muted/60 italic py-2">
              No entries yet. Add one below.
            </p>
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
