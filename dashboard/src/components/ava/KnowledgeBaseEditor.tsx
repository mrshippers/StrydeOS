"use client";

import { useMemo } from "react";
import { BookOpen, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
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
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-cloud-light rounded w-48" />
          <div className="h-3 bg-cloud-light rounded w-72" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-cloud-light rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple/10 flex items-center justify-center">
              <BookOpen size={15} className="text-purple" />
            </div>
            <div>
              <h3 className="font-display text-base text-navy">
                Clinic Knowledge Base
              </h3>
              <p className="text-[11px] text-muted">
                What Ava knows about your clinic — services, team, pricing,
                policies, and FAQs
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mb-3 flex items-center gap-2 text-[12px] text-error bg-error/5 border border-error/20 rounded-lg px-3 py-2">
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      {/* Category cards */}
      <div className="px-6 pb-4 space-y-2">
        {CATEGORY_ORDER.map((category) => (
          <KnowledgeCategoryCard
            key={category}
            category={category}
            entries={entriesByCategory.get(category) || []}
            onUpdateEntry={updateEntry}
            onRemoveEntry={removeEntry}
            onAddEntry={addEntry}
            autoEntries={category === "location" ? locationAutoEntries : []}
          />
        ))}
      </div>

      {/* Sync footer */}
      <div className="px-6 py-4 border-t border-border bg-cloud-light/20 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          {hasPendingChanges ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Unsaved changes
            </>
          ) : lastSyncedAt ? (
            <>
              <CheckCircle size={12} className="text-success" />
              Last synced {lastSyncedLabel}
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-muted/40" />
              Not yet synced to Ava
            </>
          )}
        </div>

        <button
          onClick={syncToAgent}
          disabled={syncing || entries.length === 0}
          className={`flex items-center gap-1.5 text-[12px] font-medium px-4 py-2 rounded-lg transition-all ${
            syncing
              ? "bg-blue/10 text-blue cursor-wait"
              : entries.length === 0
                ? "bg-cloud-light text-muted cursor-not-allowed"
                : "bg-blue text-white hover:bg-blue-bright shadow-sm"
          }`}
        >
          <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing..." : "Sync to Ava"}
        </button>
      </div>
    </div>
  );
}
