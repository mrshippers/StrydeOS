"use client";

import { useState } from "react";
import { X } from "lucide-react";

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
    <div className="group relative py-3 first:pt-1 last:pb-0 border-b border-border/20 last:border-0">
      <div className="space-y-1.5">
        {/* Title row */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            disabled={readOnly}
            placeholder="Entry title"
            className="
              flex-1 text-[13px] font-medium text-navy bg-transparent
              border-0 border-b border-transparent
              focus:border-[#1C54F2]/20 focus:outline-none
              px-0 py-0.5 placeholder:text-muted/30
              disabled:opacity-60 disabled:cursor-default
              transition-all
            "
          />

          {/* Delete — fades in on hover */}
          {!readOnly && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {confirmDelete ? (
                <div className="flex items-center gap-1.5 animate-[kb-slide-up_0.15s_ease-out]">
                  <button
                    onClick={() => { onRemove(); setConfirmDelete(false); }}
                    className="text-[10px] text-error/70 hover:text-error font-medium transition-colors"
                  >
                    Remove
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-[10px] text-muted/50 hover:text-muted transition-colors"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-muted/30 hover:text-error/60 transition-colors p-0.5"
                  title="Remove entry"
                >
                  <X size={13} strokeWidth={2} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content textarea */}
        <textarea
          value={content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          disabled={readOnly}
          placeholder="What should Ava know about this?"
          rows={2}
          className="
            w-full text-[12px] text-body/80 leading-relaxed
            bg-[#f7f8fa] rounded-xl border border-border/20
            focus:border-[#1C54F2]/15 focus:bg-white focus:shadow-[0_0_0_3px_rgba(28,84,242,0.04)]
            focus:outline-none px-3 py-2.5
            placeholder:text-muted/25
            disabled:opacity-60 disabled:cursor-default
            resize-y transition-all duration-200
          "
        />

        {readOnlyNote && (
          <p className="text-[10px] text-muted/40 italic pl-0.5">{readOnlyNote}</p>
        )}
      </div>

      <style jsx>{`
        @keyframes kb-slide-up {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
