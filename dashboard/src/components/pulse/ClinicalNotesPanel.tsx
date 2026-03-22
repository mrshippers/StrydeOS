"use client";

import { useState, type FC } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useClinicalNotes } from "@/hooks/useClinicalNotes";
import { brand } from "@/lib/brand";
import type { ClinicalNote } from "@/types";

interface Props {
  patientId: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Strip HTML tags for safe rendering — no sanitizer dependency needed. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Collapsible clinical notes panel — loads Heidi-synced notes on demand.
 * Renders inside the expanded patient row in PatientBoard.
 */
export const ClinicalNotesPanel: FC<Props> = ({ patientId }) => {
  const { notes, loading } = useClinicalNotes(patientId);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="flex items-center gap-1.5 text-[10px] text-muted">
          <FileText size={10} />
          Loading clinical notes...
        </div>
      </div>
    );
  }

  if (notes.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-navy tracking-wide uppercase flex items-center gap-1">
          <FileText size={10} style={{ color: brand.teal }} />
          Clinical Notes
        </span>
        <span className="text-[9px] text-muted">
          {notes.length} note{notes.length !== 1 ? "s" : ""} via Heidi
        </span>
      </div>

      <div className="space-y-1">
        {notes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            isOpen={openNoteId === note.id}
            onToggle={() =>
              setOpenNoteId(openNoteId === note.id ? null : note.id)
            }
          />
        ))}
      </div>
    </div>
  );
};

const NoteRow: FC<{
  note: ClinicalNote;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ note, isOpen, onToggle }) => {
  const displayContent =
    note.noteContentType === "HTML"
      ? stripHtml(note.noteContent)
      : note.noteContent;

  return (
    <div className="rounded-[8px] border border-border/50 bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50 transition-colors text-left"
      >
        {isOpen ? (
          <ChevronDown size={10} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronRight size={10} className="text-gray-400 shrink-0" />
        )}
        <span className="text-[11px] font-medium text-navy flex-1 truncate">
          {formatDate(note.sessionDate)}
        </span>
        {note.clinicalCodes.length > 0 && (
          <span className="text-[9px] text-muted">
            {note.clinicalCodes.length} code{note.clinicalCodes.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {/* Clinical codes */}
          {note.clinicalCodes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {note.clinicalCodes.map((c, i) => (
                <span
                  key={`${c.code}-${i}`}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono"
                  style={{
                    backgroundColor: `${brand.blue}0A`,
                    color: brand.blue,
                  }}
                  title={`${c.system}: ${c.description}`}
                >
                  {c.code}
                </span>
              ))}
            </div>
          )}

          {/* Note content — rendered as plaintext for safety */}
          <pre className="text-[11px] text-navy/80 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-sans" style={{ wordBreak: "break-word" }}>
            {displayContent}
          </pre>
        </div>
      )}
    </div>
  );
};
