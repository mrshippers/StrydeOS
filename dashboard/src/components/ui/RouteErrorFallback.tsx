"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { brand } from "@/lib/brand";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
  moduleName?: string;
  accentColor?: string;
}

export default function RouteErrorFallback({
  error,
  reset,
  moduleName = "This page",
  accentColor = brand.blue,
}: Props) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center py-24 px-6 animate-fade-in">
      <div className="text-center max-w-md">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: `${accentColor}15` }}
        >
          <AlertTriangle size={22} style={{ color: accentColor }} />
        </div>
        <h2 className="font-display text-xl text-navy mb-2">
          {moduleName} hit an error
        </h2>
        <p className="text-sm text-muted leading-relaxed mb-6">
          Something went wrong loading this section. Your data is safe — try
          again or refresh the page.
        </p>
        {error.digest && (
          <p className="text-[11px] text-muted/60 font-mono mb-4">
            Ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
          style={{
            background: accentColor,
            boxShadow: `0 4px 16px ${accentColor}30`,
          }}
        >
          <RotateCcw size={14} />
          Try again
        </button>
      </div>
    </div>
  );
}
