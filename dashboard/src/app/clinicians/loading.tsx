import { SkeletonTable } from "@/components/ui/EmptyState";

/** Instant skeleton shown while the Clinician Performance bundle loads.
 *  Mirrors the real page: header → full clinician table. */

export default function CliniciansLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="stryde-fade-up" style={{ animationDelay: "0ms" }}>
        <div className="h-8 w-64 skeleton-shimmer rounded-lg mb-2" />
        <div className="h-4 w-80 max-w-full skeleton-shimmer rounded-md" />
      </div>

      {/* Full clinician table */}
      <div className="stryde-fade-up" style={{ animationDelay: "80ms" }}>
        <SkeletonTable />
      </div>
    </div>
  );
}
