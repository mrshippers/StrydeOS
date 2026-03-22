"use client";

import { useEffect } from "react";
import { brand } from "@/lib/brand";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[StrydeOS] Unhandled error:", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
      style={{ background: brand.navy }}
    >
      <div className="text-center max-w-md">
        <h2
          className="font-display text-[24px] text-white mb-2"
        >
          Something went wrong
        </h2>
        <p className="text-[14px] text-white/40 leading-relaxed mb-6">
          An unexpected error occurred. Your data is safe — try refreshing the page.
        </p>
        {error.digest && (
          <p className="text-[11px] text-white/20 font-mono mb-4">
            Error reference: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="px-6 py-2.5 rounded-xl text-[14px] font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
          style={{
            background: brand.blue,
            boxShadow: `0 4px 20px ${brand.blue}40`,
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
