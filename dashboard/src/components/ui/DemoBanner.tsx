"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const DISMISS_KEY = "strydeos_demo_banner_dismissed";

export default function DemoBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!sessionStorage.getItem(DISMISS_KEY);
    } catch {
      return false;
    }
  });

  if (user?.uid !== "demo" || dismissed) return null;

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl mb-5 text-sm"
      style={{
        background: "rgba(8,145,178,0.06)",
        border: "1px solid rgba(8,145,178,0.15)",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertTriangle size={14} className="shrink-0" style={{ color: "#0891B2" }} />
        <span className="text-[13px]">
          <span className="font-semibold" style={{ color: "#0891B2" }}>
            You&apos;re viewing the demo
          </span>
          <span className="text-navy/70 ml-1">
            — explore the platform with sample data. Sign in to use your own clinic.
          </span>
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/login"
          className="text-[12px] font-semibold whitespace-nowrap transition-opacity hover:opacity-75"
          style={{ color: "#0891B2" }}
        >
          Sign in →
        </Link>
        <button
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch { /* sessionStorage unavailable */ }
            setDismissed(true);
          }}
          aria-label="Dismiss demo banner"
          className="transition-opacity hover:opacity-75"
          style={{ color: "rgba(8,145,178,0.45)" }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
