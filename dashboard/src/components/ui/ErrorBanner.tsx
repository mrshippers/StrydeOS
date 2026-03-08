"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl mb-6 text-sm"
      style={{
        background: "rgba(239, 68, 68, 0.06)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <AlertTriangle size={14} className="text-red-500 shrink-0" />
        <span className="text-red-600 font-medium">{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-red-500 hover:text-red-700 transition-colors shrink-0"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      )}
    </div>
  );
}
