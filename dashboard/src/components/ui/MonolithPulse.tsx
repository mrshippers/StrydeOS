"use client";

import { MonolithMark } from "@/components/MonolithLogo";

interface MonolithPulseProps {
  /** Mark size in px. Default: 44 */
  size?: number;
  /** Accessible label announced to screen readers. Default: "Loading" */
  label?: string;
  className?: string;
}

/**
 * MonolithPulse — the StrydeOS page-level loading hero.
 *
 * The brand Monolith mark breathing at 1 → 1.06 over 2.4s (keyframes in
 * globals.css). Replaces generic spinner heroes on full-screen / page-level
 * loading states. Small inline button spinners stay as Loader2.
 */
export default function MonolithPulse({ size = 44, label = "Loading", className = "" }: MonolithPulseProps) {
  return (
    <div role="status" aria-label={label} className={`inline-flex items-center justify-center ${className}`}>
      <div className="monolith-pulse">
        <MonolithMark size={size} />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
