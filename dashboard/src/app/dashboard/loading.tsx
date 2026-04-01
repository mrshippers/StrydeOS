/** Instant skeleton shown while the dashboard JS bundle loads.
 *  Matches the real layout: greeting → 3 hero cards → 4 metric cards → table.
 *  Pure server component — zero JS shipped. */

const pulse = "animate-pulse bg-cloud-light dark:bg-white/5 rounded-lg";

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5 ${className}`}>
      <div className={`${pulse} h-3 w-20 mb-4`} />
      <div className={`${pulse} h-10 w-24 mb-2`} />
      <div className={`${pulse} h-2.5 w-16`} />
    </div>
  );
}

function SkeletonMetric() {
  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-4">
      <div className={`${pulse} h-3 w-24 mb-3`} />
      <div className={`${pulse} h-8 w-16 mb-2`} />
      <div className={`${pulse} h-[140px] w-full mt-2`} />
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      {/* Greeting header */}
      <div className="mb-1 py-2">
        <div className={`${pulse} h-8 w-64 mb-2`} />
        <div className={`${pulse} h-4 w-48`} />
      </div>

      {/* Week nav + filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`${pulse} h-8 w-8`} />
          <div className={`${pulse} h-8 w-40`} />
          <div className={`${pulse} h-8 w-8`} />
        </div>
        <div className="flex gap-1.5">
          <div className={`${pulse} h-8 w-12 rounded-full`} />
          <div className={`${pulse} h-8 w-16 rounded-full`} />
          <div className={`${pulse} h-8 w-16 rounded-full`} />
        </div>
      </div>

      {/* Hero cards — 3 col */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Metric cards — 4 col */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonMetric />
        <SkeletonMetric />
        <SkeletonMetric />
        <SkeletonMetric />
      </div>

      {/* Clinician table */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
        <div className={`${pulse} h-4 w-40 mb-4`} />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className={`${pulse} h-9 w-9 rounded-full`} />
              <div className={`${pulse} h-4 w-28`} />
              <div className="flex-1" />
              <div className={`${pulse} h-4 w-16`} />
              <div className={`${pulse} h-4 w-16`} />
              <div className={`${pulse} h-4 w-16`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
