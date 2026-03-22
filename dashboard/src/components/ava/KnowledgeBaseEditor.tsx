"use client";

import { useMemo, useState } from "react";
import { RefreshCw, CheckCircle, AlertCircle, Zap } from "lucide-react";
import { useAvaKnowledge } from "@/hooks/useAvaKnowledge";
import { useAvaConfig } from "@/hooks/useAvaConfig";
import { CATEGORY_ORDER, type KnowledgeCategory } from "@/lib/ava/ava-knowledge";
import KnowledgeCategoryCard from "./KnowledgeCategoryCard";

interface KnowledgeBaseEditorProps {
  clinicId: string | undefined;
}

export default function KnowledgeBaseEditor({ clinicId }: KnowledgeBaseEditorProps) {
  const {
    entries,
    loading,
    syncing,
    lastSyncedAt,
    hasPendingChanges,
    error,
    addEntry,
    updateEntry,
    removeEntry,
    syncToAgent,
  } = useAvaKnowledge(clinicId);

  const { config } = useAvaConfig(clinicId);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const handleSync = async () => {
    const result = await syncToAgent();
    if (result.success) {
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    }
  };

  // Auto-populated location entries from Clinic Details form
  const locationAutoEntries = useMemo(() => {
    const auto: Array<{ title: string; content: string; note: string }> = [];
    if (config.address) {
      auto.push({
        title: "Clinic Address",
        content: config.address,
        note: "Managed in Clinic Details above",
      });
    }
    if (config.nearest_station) {
      auto.push({
        title: "Nearest Station",
        content: config.nearest_station,
        note: "Managed in Clinic Details above",
      });
    }
    if (config.parking_info) {
      auto.push({
        title: "Parking",
        content: config.parking_info,
        note: "Managed in Clinic Details above",
      });
    }
    return auto;
  }, [config.address, config.nearest_station, config.parking_info]);

  // Format last synced timestamp
  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) return "Never synced";
    const diff = Date.now() - new Date(lastSyncedAt).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, [lastSyncedAt]);

  // Entries grouped by category
  const entriesByCategory = useMemo(() => {
    const map = new Map<KnowledgeCategory, typeof entries>();
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, entries.filter((e) => e.category === cat));
    }
    return map;
  }, [entries]);

  if (loading) {
    return (
      <div className="rounded-[20px] overflow-hidden border border-white/[0.08] shadow-[0_4px_24px_rgba(11,37,69,0.12)]">
        <div className="relative bg-gradient-to-br from-[#0B2545] via-[#0f2f52] to-[#0B2545] p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-5 bg-white/10 rounded w-48" />
            <div className="h-3 bg-white/5 rounded w-72" />
          </div>
        </div>
        <div className="bg-white p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 bg-cloud-light/60 rounded-xl animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] overflow-hidden border border-white/[0.08] shadow-[0_4px_24px_rgba(11,37,69,0.12)]">
      {/* ─── Hero header — ambient wave energy ─── */}
      <div className="relative overflow-hidden">
        {/* Gradient base */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B2545] via-[#0f2f52] to-[#0d2a4d]" />

        {/* Animated wave layers */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute -bottom-8 left-0 right-0 h-32 opacity-[0.07]"
            style={{
              background: "radial-gradient(ellipse 80% 50% at 20% 100%, #4B8BF5 0%, transparent 70%)",
              animation: "kb-wave-drift 8s ease-in-out infinite",
            }}
          />
          <div
            className="absolute -bottom-8 left-0 right-0 h-32 opacity-[0.05]"
            style={{
              background: "radial-gradient(ellipse 60% 40% at 70% 100%, #2E6BFF 0%, transparent 70%)",
              animation: "kb-wave-drift 12s ease-in-out infinite reverse",
            }}
          />
          <div
            className="absolute top-0 right-0 w-48 h-48 opacity-[0.04]"
            style={{
              background: "radial-gradient(circle at center, #4B8BF5 0%, transparent 70%)",
              animation: "kb-breathe 6s ease-in-out infinite",
            }}
          />
        </div>

        {/* Content */}
        <div className="relative px-6 pt-6 pb-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              {/* Alive indicator orb */}
              <div className="relative w-10 h-10 rounded-xl bg-white/[0.08] backdrop-blur-sm flex items-center justify-center border border-white/[0.06]">
                <Zap size={17} className="text-blue-glow" />
                <div
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-glow border-2 border-[#0B2545]"
                  style={{ animation: "kb-breathe 3s ease-in-out infinite" }}
                />
              </div>
              <div>
                <h3 className="font-display text-[17px] text-white tracking-[-0.01em]">
                  Clinic Knowledge Base
                </h3>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {entries.length} {entries.length === 1 ? "entry" : "entries"} teaching Ava about your clinic
                </p>
              </div>
            </div>

            {/* Entry count pulse */}
            {entries.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white/[0.06] rounded-full px-3 py-1 border border-white/[0.06]">
                <div
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                  style={{ animation: "kb-breathe 4s ease-in-out infinite" }}
                />
                <span className="text-[10px] text-white/50 font-medium">
                  {lastSyncedAt ? "Live" : "Draft"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Error banner ─── */}
      {error && (
        <div className="mx-5 mt-4 flex items-center gap-2 text-[12px] text-error bg-error/5 border border-error/20 rounded-xl px-3.5 py-2.5">
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      {/* ─── Category cards ─── */}
      <div className="bg-white px-5 pt-5 pb-4 space-y-2.5">
        {CATEGORY_ORDER.map((category, i) => (
          <div
            key={category}
            className="animate-[kb-slide-up_0.3s_ease-out_both]"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <KnowledgeCategoryCard
              category={category}
              entries={entriesByCategory.get(category) || []}
              onUpdateEntry={updateEntry}
              onRemoveEntry={removeEntry}
              onAddEntry={addEntry}
              autoEntries={category === "location" ? locationAutoEntries : []}
            />
          </div>
        ))}
      </div>

      {/* ─── Sync footer — the big output moment ─── */}
      <div className="relative overflow-hidden border-t border-border/60">
        {/* Subtle gradient on sync success */}
        {syncSuccess && (
          <div
            className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-emerald-500/10 to-emerald-500/5"
            style={{ animation: "kb-flash 3s ease-out forwards" }}
          />
        )}

        <div className="relative px-5 py-4 bg-[#fafbfc] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            {syncSuccess ? (
              <div className="flex items-center gap-1.5 text-emerald-600 animate-[kb-slide-up_0.2s_ease-out]">
                <CheckCircle size={13} />
                <span className="font-medium">Knowledge synced — Ava is updated</span>
              </div>
            ) : hasPendingChanges ? (
              <>
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-400"
                  style={{ animation: "kb-breathe 2s ease-in-out infinite" }}
                />
                Unsaved changes
              </>
            ) : lastSyncedAt ? (
              <>
                <CheckCircle size={12} className="text-emerald-500/70" />
                Last synced {lastSyncedLabel}
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-muted/30" />
                Not yet synced to Ava
              </>
            )}
          </div>

          <button
            onClick={handleSync}
            disabled={syncing || entries.length === 0}
            className={`
              relative flex items-center gap-2 text-[12px] font-medium px-5 py-2.5 rounded-xl
              transition-all duration-300 overflow-hidden
              ${syncing
                ? "bg-[#0B2545] text-blue-glow"
                : entries.length === 0
                  ? "bg-cloud-light text-muted cursor-not-allowed"
                  : "bg-[#0B2545] text-white hover:shadow-[0_0_20px_rgba(30,107,255,0.25)] active:scale-[0.97]"
              }
            `}
          >
            {/* Button glow effect on hover */}
            {!syncing && entries.length > 0 && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent opacity-0 hover:opacity-100 transition-opacity" />
            )}
            <RefreshCw
              size={13}
              className={syncing ? "animate-spin" : "transition-transform group-hover:rotate-45"}
            />
            <span className="relative">
              {syncing ? "Syncing..." : "Sync to Ava"}
            </span>
          </button>
        </div>
      </div>

      {/* Keyframes defined in globals.css: kb-wave-drift, kb-breathe, kb-slide-up, kb-flash */}
    </div>
  );
}
