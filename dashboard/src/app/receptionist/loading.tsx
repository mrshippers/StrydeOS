/** Instant skeleton shown while the Ava (receptionist) bundle loads.
 *  Mirrors the real page: header → view toggle → stats row → volume chart. */

export default function ReceptionistLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="stryde-fade-up" style={{ animationDelay: "0ms" }}>
        <div className="h-8 w-28 skeleton-shimmer rounded-lg mb-2" />
        <div className="h-4 w-80 max-w-full skeleton-shimmer rounded-md" />
      </div>

      {/* View toggle */}
      <div
        className="stryde-fade-up flex items-center gap-1 w-fit rounded-xl border border-border bg-cloud-light p-1"
        style={{ animationDelay: "80ms" }}
      >
        <div className="h-9 w-36 skeleton-shimmer rounded-lg" />
        <div className="h-9 w-32 skeleton-shimmer rounded-lg" />
      </div>

      {/* Stats row — 6 col */}
      <div
        className="stryde-fade-up grid grid-cols-2 lg:grid-cols-6 gap-4"
        style={{ animationDelay: "160ms" }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] border border-border bg-white h-24 skeleton-shimmer"
          />
        ))}
      </div>

      {/* 7-day call volume chart */}
      <div
        className="stryde-fade-up rounded-[var(--radius-card)] border border-border bg-white p-6"
        style={{ animationDelay: "240ms" }}
      >
        <div className="h-4 w-44 skeleton-shimmer rounded-md mb-2" />
        <div className="h-3 w-56 skeleton-shimmer rounded-md mb-5" />
        <div className="h-[220px] w-full skeleton-shimmer rounded-lg" />
      </div>
    </div>
  );
}
