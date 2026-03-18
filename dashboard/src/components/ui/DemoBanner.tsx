"use client";

import { FlaskConical, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const DISMISS_KEY = "strydeos_demo_banner_dismissed";

export default function DemoBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try { return !!sessionStorage.getItem(DISMISS_KEY); }
    catch { return false; }
  });
  const isDemoUser = user?.uid === "demo";

  function handleDismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl text-sm"
      style={{
        background: "rgba(28, 84, 242, 0.06)",
        border: "1px solid rgba(28, 84, 242, 0.15)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <FlaskConical size={14} className="text-blue shrink-0" />
        <span className="text-blue font-medium">
          {isDemoUser ? "You're viewing the demo — " : "Viewing demo data — "}
          <span className="font-normal text-navy/50 ml-1">
            {isDemoUser
              ? "explore the platform with sample data. Sign in to use your own clinic."
              : "connect Firebase to see your clinic's live numbers."}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <a
          href={isDemoUser ? "/login" : "/settings"}
          className="text-[12px] font-semibold text-blue hover:text-blue-bright transition-colors"
        >
          {isDemoUser ? "Sign in →" : "Connect now →"}
        </a>
        <button
          onClick={handleDismiss}
          className="text-muted hover:text-navy transition-colors"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
