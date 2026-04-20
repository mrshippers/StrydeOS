"use client";

import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Loud, sticky banner shown on every authenticated screen when the clinic's
 * Firestore was populated by a seed script and has NOT been replaced by a
 * live PMS sync. Gated on `clinicProfile.dataMode === "sample"`.
 *
 * Runs the purge via: `npm run purge:seed -- --apply --nuke-all-patients`
 * (scripts/purge-spires-seed-data.ts).
 */
export default function SampleDataBanner() {
  const { user } = useAuth();
  const mode = user?.clinicProfile?.dataMode;
  if (mode !== "sample") return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <AlertTriangle size={16} className="shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900">
          You&apos;re looking at sample data
        </p>
        <p className="text-xs text-amber-800">
          Every patient, appointment, and metric on these screens was written
          by a seed script — not your live PMS. Revenue, KPIs, and insights
          below are placeholders, not real clinic activity. Purge the seed
          and connect a live PMS to see real numbers.
        </p>
      </div>
      <a
        href="/settings"
        className="shrink-0 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-200"
      >
        Connect PMS →
      </a>
    </div>
  );
}
