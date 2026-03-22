"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

interface KnowledgeEntryRowProps {
  title: string;
  content: string;
  readOnly?: boolean;
  readOnlyNote?: string;
  onUpdate: (updates: { title?: string; content?: string }) => void;
  onRemove: () => void;
}

export default function KnowledgeEntryRow({
  title,
  content,
  readOnly = false,
  readOnlyNote,
  onUpdate,
  onRemove,
}: KnowledgeEntryRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="group flex gap-3 items-start py-3 first:pt-0 last:pb-0 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0 space-y-2">
        <input
          type="text"
          value={title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          disabled={readOnly}
          placeholder="Entry title"
          className="w-full text-sm font-medium text-navy bg-transparent border-0 border-b border-transparent focus:border-blue/30 focus:outline-none px-0 py-0.5 placeholder:text-muted/50 disabled:opacity-70 disabled:cursor-default transition-colors"
        />
        <textarea
          value={content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          disabled={readOnly}
          placeholder="What should Ava know about this?"
          rows={2}
          className="w-full text-[13px] text-body bg-cloud-light/50 rounded-lg border border-border/40 focus:border-blue/30 focus:outline-none px-3 py-2 placeholder:text-muted/40 disabled:opacity-70 disabled:cursor-default resize-y transition-colors"
        />
        {readOnlyNote && (
          <p className="text-[10px] text-muted italic">{readOnlyNote}</p>
        )}
      </div>

      {!readOnly && (
        <div className="pt-1">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onRemove();
                  setConfirmDelete(false);
                }}
                className="text-[10px] text-error hover:text-error/80 font-medium transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-muted hover:text-body transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="opacity-0 group-hover:opacity-100 text-muted hover:text-error transition-all"
              title="Remove entry"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
