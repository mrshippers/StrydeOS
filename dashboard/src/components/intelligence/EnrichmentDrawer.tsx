"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { brand } from "@/lib/brand";
import { EASING_ARRAY } from "@/lib/motion";
import { useConnections, type ConnectionModule } from "@/hooks/useConnections";

const MODULE_ACCENT: Record<ConnectionModule, string> = {
  intelligence: brand.purple,
  pulse: brand.teal,
  ava: brand.blue,
  shared: brand.blueGlow,
};

/**
 * A quiet, owner-led enrichment surface: the data sources this clinic has NOT
 * connected yet, shown as a tidy, dense cluster of attached connect chips
 * rather than a sprawling bottom drawer. Driven entirely by useConnections
 * (per clinicId) - when everything is connected it renders nothing. Each chip
 * is brand-tokened to its module accent and routes to the matching settings
 * anchor. Mount fade uses the single app-wide PS5 easing.
 */
export default function EnrichmentDrawer() {
  const router = useRouter();
  const { sources, loading } = useConnections();

  const missing = sources.filter((s) => !s.connected);
  if (loading || missing.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASING_ARRAY }}
      aria-label="Sources to connect"
      className="rounded-[16px] overflow-hidden"
      style={{
        background: "linear-gradient(180deg,#0B2545 0%,#06182e 100%)",
        border: "1px solid rgba(75,139,245,0.16)",
        boxShadow: "0 10px 30px rgba(6,24,46,0.30), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <header className="flex items-center justify-between px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles size={13} style={{ color: brand.blueGlow }} />
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: brand.blueGlow }}
          >
            Get more from Stryde
          </span>
        </div>
        <span className="text-[11px] font-medium text-white/45 tabular-nums">
          {missing.length} to connect
        </span>
      </header>

      {/* Dense, attached cluster — cells share 1px hairlines via the container
          tint showing through the gap-px grid. */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-px"
        style={{ background: "rgba(75,139,245,0.10)" }}
      >
        {missing.map((s) => {
          const accent = MODULE_ACCENT[s.module];
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => router.push(s.settingsHref)}
              title={s.blurb}
              className="group flex items-center gap-2.5 px-3.5 py-3 text-left transition-colors"
              style={{ background: "#0B2545" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#0e2b54")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#0B2545")}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-white truncate">
                  {s.label}
                </span>
                <span
                  className="block text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: accent }}
                >
                  {s.module}
                </span>
              </span>
              <ArrowRight
                size={13}
                className="shrink-0 text-white/30 transition-all group-hover:text-white/80 group-hover:translate-x-0.5"
              />
            </button>
          );
        })}
      </div>
    </motion.section>
  );
}
