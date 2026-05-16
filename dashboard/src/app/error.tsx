"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { brand } from "@/lib/brand";
import { MonolithMark } from "@/components/MonolithLogo";
import { RotateCcw } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[StrydeOS] Unhandled error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
      style={{ background: `linear-gradient(180deg, ${brand.navy} 0%, #091C38 100%)` }}
    >
      <GlassCard variant="primary" tint="neutral" className="max-w-md w-full">
      <div className="text-center px-8 py-10">
        {/* Monolith mark */}
        <div className="mx-auto mb-8">
          <MonolithMark size={48} />
        </div>

        <h2 className="font-display text-[22px] text-white mb-2">
          Well, that wasn&apos;t supposed to happen
        </h2>
        <p className="text-[14px] text-white/40 leading-relaxed mb-2">
          StrydeOS hit an unexpected error. Your data is completely safe — this
          is a display issue on our end.
        </p>
        <p className="text-[13px] text-white/25 leading-relaxed mb-8">
          Try again, or refresh the page. If it keeps happening, we&apos;re
          already on it.
        </p>

        {error.digest && (
          <p className="text-[10px] text-white/15 font-mono mb-6 select-all">
            ref: {error.digest}
          </p>
        )}

        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
          style={{
            background: brand.blue,
            boxShadow: `0 4px 20px ${brand.blue}40`,
          }}
        >
          <RotateCcw size={14} />
          Try again
        </button>
      </div>
      </GlassCard>
    </div>
  );
}
