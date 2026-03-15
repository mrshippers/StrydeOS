"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  X,
  Search,
  ChevronDown,
  ArrowRight,
  Info,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import {
  HELP_ENTRIES,
  CATEGORIES,
  CATEGORY_LABELS,
  type HelpCategory,
  type HelpEntry,
} from "@/data/helpContent";

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-blue/30 text-white rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function AccordionItem({
  entry,
  query,
}: {
  entry: HelpEntry;
  query: string;
}) {
  const [open, setOpen] = useState(false);

  // Auto-open when there's a search query
  useEffect(() => {
    setOpen(!!query.trim());
  }, [query]);

  return (
    <div
      className="border-b last:border-b-0"
      style={{ borderColor: "rgba(255,255,255,0.06)" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors group"
      >
        <ChevronDown
          size={14}
          className={`mt-0.5 shrink-0 text-white/30 transition-transform duration-200 group-hover:text-white/50 ${
            open ? "rotate-180" : ""
          }`}
        />
        <span className="text-[13px] font-medium text-white/80 leading-snug">
          {highlight(entry.question, query)}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 pl-[calc(1.25rem+14px+0.75rem)]">
              {entry.formula && (
                <div
                  className="mb-3 px-3 py-2 rounded-lg text-[11px] font-mono text-blue-glow"
                  style={{ background: "rgba(28,84,242,0.12)", border: "1px solid rgba(28,84,242,0.2)" }}
                >
                  {entry.formula}
                </div>
              )}
              <p className="text-[12.5px] text-white/55 leading-relaxed whitespace-pre-line">
                {highlight(entry.answer, query)}
              </p>
              {entry.clinicNote && (
                <div
                  className="mt-3 flex gap-2 px-3 py-2.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <Info size={12} className="text-white/30 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/35 leading-relaxed">
                    {entry.clinicNote}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PanelContent({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<HelpCategory | "all">("all");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const filtered = HELP_ENTRIES.filter((entry) => {
    const matchesCategory =
      activeCategory === "all" || entry.category === activeCategory;
    if (!matchesCategory) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      entry.question.toLowerCase().includes(q) ||
      entry.answer.toLowerCase().includes(q) ||
      entry.tags.some((t) => t.includes(q))
    );
  });

  const handleViewFullHelp = useCallback(() => {
    onClose();
    router.push("/help");
  }, [onClose, router]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-5 pt-5 pb-4 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <BookOpen size={14} className="text-blue-glow" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
                Help Centre
              </span>
            </div>
            <h2 className="text-[18px] font-display text-white leading-tight">
              Metrics & Guides
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
            aria-label="Close help panel"
          >
            <X size={15} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none"
          />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search metrics, modules…"
            className="w-full pl-8 pr-3 py-2 rounded-lg text-[12.5px] text-white placeholder:text-white/25 outline-none transition-colors"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 mt-3">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              activeCategory === "all"
                ? "text-white"
                : "text-white/35 hover:text-white/60"
            }`}
            style={
              activeCategory === "all"
                ? { background: "rgba(28,84,242,0.25)", color: "#4B8BF5" }
                : undefined
            }
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                activeCategory === cat
                  ? "text-white"
                  : "text-white/35 hover:text-white/60"
              }`}
              style={
                activeCategory === cat
                  ? { background: "rgba(28,84,242,0.25)", color: "#4B8BF5" }
                  : undefined
              }
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] text-white/30">
              No results for &ldquo;{query}&rdquo;
            </p>
            <p className="text-[11px] text-white/20 mt-1">
              Try a different term or browse all categories.
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((entry) => (
              <AccordionItem key={entry.id} entry={entry} query={query} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-4 border-t space-y-2 shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <a
          href="https://strydeos.notion.site/StrydeOS-Client-Setup-Guide"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/50 hover:text-white/80 transition-colors group"
          style={{
            background: "rgba(5,150,105,0.08)",
            border: "1px solid rgba(5,150,105,0.15)",
          }}
        >
          <span className="text-[#34d399]">Setup Guide (Notion)</span>
          <ExternalLink size={11} className="text-[#34d399]/50 group-hover:text-[#34d399] transition-colors" />
        </a>
        <button
          onClick={handleViewFullHelp}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[12.5px] font-medium text-white/60 hover:text-white transition-colors group"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <span>View full Help Centre</span>
          <ArrowRight
            size={13}
            className="text-white/30 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all"
          />
        </button>
      </div>
    </div>
  );
}

export default function HelpPanel({ open, onClose }: HelpPanelProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard dismiss
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60]"
            style={{ background: "rgba(11,37,69,0.5)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ x: 480, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 480, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="fixed top-0 right-0 h-full w-[480px] z-[65] flex flex-col shadow-2xl"
            style={{
              background: "#0B2545",
              borderLeft: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <PanelContent onClose={onClose} />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
