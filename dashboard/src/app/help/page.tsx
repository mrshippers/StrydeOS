"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Search,
  ChevronDown,
  Info,
  ArrowLeft,
  BookOpen,
  BarChart3,
  RefreshCw,
  Phone,
  HelpCircle,
  Zap,
  AlertCircle,
  ExternalLink,
  Play,
} from "lucide-react";
import Link from "next/link";
import {
  HELP_ENTRIES,
  CATEGORIES,
  CATEGORY_LABELS,
  type HelpCategory,
  type HelpEntry,
} from "@/data/helpContent";

const NOTION_SETUP_GUIDE_URL = "https://strydeos.notion.site/StrydeOS-Client-Setup-Guide";

const CATEGORY_META: Record<
  HelpCategory,
  { icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; accent: string; description: string }
> = {
  setup: {
    icon: Zap,
    accent: "#059669",
    description: "Step-by-step guides to get StrydeOS configured and running in your clinic.",
  },
  metrics: {
    icon: BarChart3,
    accent: "#1C54F2",
    description: "Definitions, formulas, and context for every KPI tracked in StrydeOS.",
  },
  modules: {
    icon: RefreshCw,
    accent: "#0891B2",
    description: "How each StrydeOS module works and what it measures.",
  },
  general: {
    icon: HelpCircle,
    accent: "#8B5CF6",
    description: "Data sources, sync schedules, integrations, and account management.",
  },
  troubleshooting: {
    icon: AlertCircle,
    accent: "#F59E0B",
    description: "Diagnose and fix common issues with data, connections, and features.",
  },
};

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-blue/20 text-blue rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function VideoEmbed({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false);
  const thumb = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

  return (
    <div className="mt-4 rounded-xl overflow-hidden border border-border" style={{ aspectRatio: "16/9" }}>
      {playing ? (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title="Help video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      ) : (
        <button
          onClick={() => setPlaying(true)}
          className="relative w-full h-full group"
          aria-label="Play video"
        >
          <img src={thumb} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-navy/40 group-hover:bg-navy/30 transition-colors flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Play size={18} className="text-navy ml-0.5" fill="currentColor" />
            </div>
          </div>
        </button>
      )}
    </div>
  );
}

function AccordionCard({
  entry,
  query,
  accent,
}: {
  entry: HelpEntry;
  query: string;
  accent: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden transition-shadow bg-white dark:bg-navy-mid border border-border dark:border-white/[0.06]"
      style={{
        boxShadow: open
          ? "0 4px 20px rgba(11,37,69,0.08)"
          : "0 2px 12px rgba(11,37,69,0.04)",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-4 px-5 py-4 text-left group hover:bg-cloud-light/50 dark:hover:bg-white/[0.02] transition-colors"
      >
        <div
          className="w-1 h-full rounded-full shrink-0 self-stretch opacity-0 group-hover:opacity-60 transition-opacity"
          style={{ background: accent }}
        />
        <span className="flex-1 text-[14px] font-medium text-ink dark:text-white/80 leading-snug">
          {highlight(entry.question, query)}
        </span>
        <ChevronDown
          size={15}
          className={`mt-0.5 shrink-0 text-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-border dark:border-white/[0.06]">
              {entry.formula && (
                <div
                  className="mt-4 mb-3 px-3 py-2 rounded-lg text-[12px] font-mono"
                  style={{
                    background: `${accent}14`,
                    border: `1px solid ${accent}30`,
                    color: accent,
                  }}
                >
                  <span className="text-muted text-[10px] uppercase tracking-wider font-sans font-semibold mr-2">
                    Formula:
                  </span>
                  {entry.formula}
                </div>
              )}

              <p className="mt-4 text-[13.5px] text-muted dark:text-white/50 leading-relaxed whitespace-pre-line">
                {highlight(entry.answer, query)}
              </p>

              {entry.videoId && <VideoEmbed videoId={entry.videoId} />}

              {entry.clinicNote && (
                <div
                  className="mt-4 flex gap-2.5 px-3.5 py-3 rounded-xl"
                  style={{
                    background: "rgba(11,37,69,0.04)",
                    border: "1px solid rgba(11,37,69,0.07)",
                  }}
                >
                  <Info size={13} className="text-muted shrink-0 mt-0.5" />
                  <p className="text-[12px] text-muted leading-relaxed">
                    <span className="font-semibold text-ink/60 dark:text-white/40">
                      Clinic context:{" "}
                    </span>
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

function CategorySection({
  category,
  entries,
  query,
}: {
  category: HelpCategory;
  entries: HelpEntry[];
  query: string;
}) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;

  if (entries.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${meta.accent}18` }}
        >
          <span style={{ color: meta.accent }}><Icon size={15} strokeWidth={1.75} /></span>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-ink dark:text-white/80">
            {CATEGORY_LABELS[category]}
          </h2>
          {!query && (
            <p className="text-[12px] text-muted mt-0.5">{meta.description}</p>
          )}
        </div>
        <span
          className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: `${meta.accent}14`,
            color: meta.accent,
          }}
        >
          {entries.length}
        </span>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => (
          <AccordionCard
            key={entry.id}
            entry={entry}
            query={query}
            accent={meta.accent}
          />
        ))}
      </div>
    </section>
  );
}

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<HelpCategory | "all">("all");

  const filterEntries = useCallback(
    (category: HelpCategory) => {
      return HELP_ENTRIES.filter((entry) => {
        const matchesCategory =
          activeCategory === "all" || entry.category === activeCategory;
        if (!matchesCategory) return false;
        if (!query.trim()) return entry.category === category;
        const q = query.toLowerCase();
        return (
          entry.category === category &&
          (entry.question.toLowerCase().includes(q) ||
            entry.answer.toLowerCase().includes(q) ||
            entry.tags.some((t) => t.includes(q)))
        );
      });
    },
    [query, activeCategory]
  );

  const totalResults = CATEGORIES.reduce(
    (sum, cat) => sum + filterEntries(cat).length,
    0
  );

  return (
    <div className="max-w-[760px] mx-auto">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-[12px] text-muted hover:text-ink dark:hover:text-white/70 transition-colors mb-6 group"
      >
        <ArrowLeft
          size={13}
          className="group-hover:-translate-x-0.5 transition-transform"
        />
        Back to Dashboard
      </Link>

      {/* Hero */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-2">
          <BookOpen size={16} className="text-blue" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Help Centre
          </span>
        </div>
        <h1 className="font-display text-[36px] text-navy dark:text-white leading-tight mb-2">
          Guides &amp; Support
        </h1>
        <p className="text-[14px] text-muted max-w-[520px] leading-relaxed">
          Setup walkthroughs, metric definitions, module guides, and troubleshooting. Use the search or browse by category.
        </p>
      </div>

      {/* Notion setup guide callout */}
      <a
        href={NOTION_SETUP_GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-4 mb-8 px-5 py-4 rounded-xl border border-[#059669]/20 bg-[#059669]/05 hover:bg-[#059669]/10 transition-colors group"
        style={{ background: "rgba(5,150,105,0.04)" }}
      >
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-[#059669]/12 flex items-center justify-center shrink-0">
            <BookOpen size={16} className="text-[#059669]" />
          </div>
          <div>
            <p className="text-[13.5px] font-semibold text-ink dark:text-white/80">
              Full Setup Guide
            </p>
            <p className="text-[11.5px] text-muted mt-0.5">
              Step-by-step Notion doc — PMS connection, clinician mapping, first 30 days
            </p>
          </div>
        </div>
        <ExternalLink
          size={14}
          className="text-[#059669]/60 group-hover:text-[#059669] transition-colors shrink-0"
        />
      </a>

      {/* Search + filters */}
      <div
        className="mb-8 p-4 rounded-2xl border border-border dark:border-white/[0.06] bg-white dark:bg-navy-mid"
        style={{ boxShadow: "0 2px 12px rgba(11,37,69,0.06)" }}
      >
        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search setup guides, metrics, troubleshooting…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[13.5px] text-ink dark:text-white placeholder:text-muted outline-none bg-cloud-light dark:bg-white/[0.04] border border-border dark:border-white/[0.08] focus:border-blue/40 transition-colors"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              activeCategory === "all"
                ? "text-blue bg-blue/10"
                : "text-muted hover:text-ink dark:hover:text-white/60 hover:bg-cloud-light dark:hover:bg-white/[0.04]"
            }`}
          >
            All
          </button>
          {CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  activeCategory === cat
                    ? "text-white"
                    : "text-muted hover:text-ink dark:hover:text-white/60 hover:bg-cloud-light dark:hover:bg-white/[0.04]"
                }`}
                style={
                  activeCategory === cat
                    ? { background: meta.accent }
                    : undefined
                }
              >
                <Icon size={12} strokeWidth={2} />
                {CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>

        {query && (
          <p className="mt-3 text-[11.5px] text-muted">
            {totalResults === 0
              ? `No results for "${query}"`
              : `${totalResults} result${totalResults !== 1 ? "s" : ""} for "${query}"`}
          </p>
        )}
      </div>

      {/* Results */}
      {totalResults === 0 && query ? (
        <div className="text-center py-16">
          <p className="text-[15px] text-muted font-medium">
            No results found for &ldquo;{query}&rdquo;
          </p>
          <p className="text-[13px] text-muted/60 mt-1">
            Try a different term or clear the search to browse all topics.
          </p>
          <button
            onClick={() => setQuery("")}
            className="mt-4 px-4 py-2 rounded-lg text-[12.5px] font-medium text-blue bg-blue/10 hover:bg-blue/15 transition-colors"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {CATEGORIES.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              entries={filterEntries(cat)}
              query={query}
            />
          ))}
        </div>
      )}

      {/* Footer note */}
      <div
        className="mt-12 mb-4 flex items-start gap-3 px-4 py-4 rounded-xl border border-border dark:border-white/[0.06] bg-white dark:bg-navy-mid"
      >
        <Phone size={13} className="text-muted shrink-0 mt-0.5" />
        <p className="text-[12px] text-muted leading-relaxed">
          <span className="font-semibold text-ink dark:text-white/60">
            Don&apos;t see what you&apos;re looking for?
          </span>{" "}
          Reach out via the in-app support channel or email{" "}
          <a
            href="mailto:support@strydeos.com"
            className="text-blue hover:underline"
          >
            support@strydeos.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
