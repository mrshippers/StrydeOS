import { SkeletonCard, SkeletonTable } from "@/components/ui/EmptyState";

/** Instant skeleton shown while the Intelligence bundle loads.
 *  Mirrors the real page: header → freshness bar → KPI cards → chart → table. */

export default function IntelligenceLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="stryde-fade-up" style={{ animationDelay: "0ms" }}>
        <div className="h-8 w-48 skeleton-shimmer rounded-lg mb-2" />
        <div className="h-4 w-80 max-w-full skeleton-shimmer rounded-md" />
      </div>

      {/* Data freshness bar */}
      <div
        className="stryde-fade-up flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-border bg-cloud-light"
        style={{ animationDelay: "80ms" }}
      >
        <div className="h-3 w-56 skeleton-shimmer rounded-md" />
        <div className="h-7 w-24 skeleton-shimmer rounded-lg" />
      </div>

      {/* KPI cards — 3 col */}
      <div
        className="stryde-fade-up grid grid-cols-1 md:grid-cols-3 gap-4"
        style={{ animationDelay: "160ms" }}
      >
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Chart block */}
      <div
        className="stryde-fade-up rounded-[var(--radius-card)] border border-border bg-white p-6"
        style={{ animationDelay: "240ms" }}
      >
        <div className="h-4 w-40 skeleton-shimmer rounded-md mb-2" />
        <div className="h-3 w-64 skeleton-shimmer rounded-md mb-5" />
        <div className="h-[220px] w-full skeleton-shimmer rounded-lg" />
      </div>

      {/* Detail table */}
      <div className="stryde-fade-up" style={{ animationDelay: "320ms" }}>
        <SkeletonTable />
      </div>
    </div>
  );
}
