"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { KnowledgeEntry, KnowledgeCategory } from "@/lib/ava/ava-knowledge";
import { CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, CATEGORY_SUGGESTIONS } from "@/lib/ava/ava-knowledge";
import KnowledgeEntryRow from "./KnowledgeEntryRow";

const CATEGORY_ICONS: Record<KnowledgeCategory, string> = {
  services: "S",
  team: "T",
  location: "L",
  pricing: "P",
  policies: "R",
  faqs: "?",
  custom: "+",
};

interface KnowledgeCategoryCardProps {
  category: KnowledgeCategory;
  entries: KnowledgeEntry[];
  onUpdateEntry: (id: string, updates: Partial<Pick<KnowledgeEntry, "title" | "content">>) => void;
  onRemoveEntry: (id: string) => void;
  onAddEntry: (category: KnowledgeCategory, title: string, content: string) => void;
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
  const icon = CATEGORY_ICONS[category];

  return (
    <div
      className={`
        rounded-2xl border overflow-hidden transition-all duration-300
        ${expanded
          ? "bg-white border-border/60 shadow-[0_1px_8px_rgba(11,37,69,0.04)]"
          : "bg-white/60 border-border/30 hover:border-border/50 hover:bg-white/80"
        }
      `}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors group"
      >
        <div className="flex items-center gap-3">
          {/* Category icon pip */}
          <div
            className={`
              w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold tracking-wide
              transition-all duration-300
              ${expanded
                ? "bg-[#0B2545] text-white/80 shadow-sm"
                : "bg-cloud-light text-muted/60 group-hover:bg-[#0B2545]/5 group-hover:text-navy/50"
              }
            `}
          >
            {icon}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-navy">{label}</span>
            {totalCount > 0 && (
              <span className="text-[10px] text-muted/50 tabular-nums">
                {totalCount}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          size={14}
          className={`
            text-muted/40 transition-transform duration-300
            ${expanded ? "rotate-180" : "group-hover:text-muted/60"}
          `}
        />
      </button>

      {/* Expandable content */}
      <div
        className={`
          grid transition-all duration-300 ease-out
          ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}
        `}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-0.5 border-t border-border/30">
            <p className="text-[11px] text-muted/60 mb-3 mt-2">{description}</p>

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

            {/* Suggestions — ghost cards when empty */}
            {entries.length === 0 && (
              <div className="space-y-1.5 mt-1">
                {CATEGORY_SUGGESTIONS[category].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => onAddEntry(category, suggestion.title, suggestion.content)}
                    className="
                      w-full text-left rounded-xl border border-dashed border-border/30
                      px-3.5 py-2.5 transition-all duration-200 group/sg
                      hover:border-[#1C54F2]/20 hover:bg-[#1C54F2]/[0.015]
                      active:scale-[0.995]
                    "
                  >
                    <p className="text-[12px] text-muted/40 italic group-hover/sg:text-muted/60 transition-colors">
                      {suggestion.title}
                    </p>
                    <p className="text-[11px] text-muted/25 italic mt-0.5 line-clamp-1 group-hover/sg:text-muted/40 transition-colors">
                      {suggestion.content}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* Add entry */}
            <button
              onClick={() => onAddEntry(category, "", "")}
              className="
                mt-3 flex items-center gap-1.5 text-[11px] text-[#1C54F2]/60
                hover:text-[#1C54F2] font-medium transition-colors
              "
            >
              <Plus size={12} strokeWidth={2.5} />
              Add entry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
