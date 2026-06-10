import { SkeletonCard } from "@/components/ui/EmptyState";

/** Instant skeleton shown while the Pulse (continuity) bundle loads.
 *  Mirrors the real page: header → comms stats → tab row → patient cards. */

export default function ContinuityLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="stryde-fade-up" style={{ animationDelay: "0ms" }}>
        <div className="h-8 w-36 skeleton-shimmer rounded-lg mb-2" />
        <div className="h-4 w-72 max-w-full skeleton-shimmer rounded-md" />
      </div>

      {/* Comms summary stats — 4 col */}
      <div
        className="stryde-fade-up grid grid-cols-2 lg:grid-cols-4 gap-4"
        style={{ animationDelay: "80ms" }}
      >
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* View tabs */}
      <div className="stryde-fade-up flex items-center gap-1 w-fit rounded-xl border border-border bg-cloud-light p-1" style={{ animationDelay: "160ms" }}>
        <div className="h-9 w-28 skeleton-shimmer rounded-lg" />
        <div className="h-9 w-32 skeleton-shimmer rounded-lg" />
      </div>

      {/* Patient cards */}
      <div className="stryde-fade-up space-y-3" style={{ animationDelay: "240ms" }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-[var(--radius-card)] border border-border bg-white p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full skeleton-shimmer shrink-0" />
            <div className="flex-1">
              <div className="h-3.5 w-32 skeleton-shimmer rounded mb-1.5" />
              <div className="h-2.5 w-24 skeleton-shimmer rounded" />
            </div>
            <div className="h-7 w-24 skeleton-shimmer rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
