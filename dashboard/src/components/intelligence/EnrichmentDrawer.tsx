"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ChevronUp, X, ArrowRight, Sparkles } from "lucide-react";
import { brand } from "@/lib/brand";
import { useConnections, type ConnectionModule } from "@/hooks/useConnections";

const MODULE_ACCENT: Record<ConnectionModule, string> = {
  intelligence: brand.purple,
  pulse: brand.teal,
  ava: brand.blue,
  shared: brand.blueGlow,
};

/**
 * A quiet, owner-led enrichment surface pinned to the bottom of a module page.
 * Shows only the data sources this clinic has NOT connected yet, as soft CTAs in
 * a horizontal scroll. Driven entirely by useConnections (per clinicId) — when
 * everything is connected it renders nothing. Not a nag: collapsed by default,
 * a single pulsing dot signals there's more to unlock.
 */
export default function EnrichmentDrawer() {
  const router = useRouter();
  const { sources, loading } = useConnections();
  const [open, setOpen] = useState(false);

  const missing = sources.filter((s) => !s.connected);
  if (loading || missing.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto w-full max-w-5xl mx-4 mb-2 rounded-[20px] overflow-hidden"
            style={{
              background: "linear-gradient(180deg,#0B2545 0%,#06182e 100%)",
              boxShadow: "0 20px 60px rgba(6,24,46,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
              border: "1px solid rgba(75,139,245,0.16)",
            }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles size={14} style={{ color: brand.blueGlow }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: brand.blueGlow }}>
                  Get more from Stryde
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white/80 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <p className="px-5 pb-3 text-[13px] leading-relaxed text-white/55 max-w-xl">
              Connect a source to light up more of your dashboard. Nothing is sent or shared until you switch it on.
            </p>

            <div className="flex gap-3 overflow-x-auto px-5 pb-5 snap-x" style={{ scrollbarWidth: "thin" }}>
              {missing.map((s) => {
                const accent = MODULE_ACCENT[s.module];
                return (
                  <div
                    key={s.key}
                    className="snap-start shrink-0 w-[230px] rounded-[14px] p-4 flex flex-col"
                    style={{
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
                        {s.module}
                      </span>
                    </div>
                    <h4 className="text-[15px] font-semibold text-white mb-1">{s.label}</h4>
                    <p className="text-[12px] leading-relaxed text-white/50 flex-1 mb-3">{s.blurb}</p>
                    <button
                      type="button"
                      onClick={() => router.push(s.settingsHref)}
                      className="inline-flex items-center justify-center gap-1.5 self-start rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white transition-transform hover:-translate-y-0.5"
                      style={{
                        background: "linear-gradient(135deg,#2E6BFF,#1C54F2)",
                        boxShadow: "0 2px 8px rgba(28,84,242,0.35)",
                      }}
                    >
                      Connect <ArrowRight size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed handle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto mb-4 inline-flex items-center gap-2.5 rounded-full pl-3 pr-4 py-2 text-[12.5px] font-semibold text-white transition-transform hover:-translate-y-0.5"
        style={{
          background: "linear-gradient(180deg,#0B2545,#06182e)",
          border: "1px solid rgba(75,139,245,0.22)",
          boxShadow: "0 10px 30px rgba(6,24,46,0.4)",
        }}
        aria-expanded={open}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping" style={{ background: brand.blueGlow }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: brand.blueGlow }} />
        </span>
        {missing.length} {missing.length === 1 ? "source" : "sources"} to connect
        <ChevronUp size={14} className="transition-transform" style={{ transform: open ? "rotate(180deg)" : "none", color: brand.blueGlow }} />
      </button>
    </div>
  );
}
