"use client";

import { FlaskConical, X } from "lucide-react";
import { useState } from "react";

export default function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl mb-6 text-sm"
      style={{
        background: "rgba(26, 92, 219, 0.06)",
        border: "1px solid rgba(26, 92, 219, 0.15)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <FlaskConical size={14} className="text-blue shrink-0" />
        <span className="text-blue font-medium">
          Viewing demo data —
          <span className="font-normal text-muted ml-1">
            connect Firebase to see your clinic&apos;s live numbers.
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="/settings"
          className="text-[12px] font-semibold text-blue hover:text-blue-bright transition-colors"
        >
          Connect now →
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted hover:text-navy transition-colors"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
