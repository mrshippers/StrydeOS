"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { brand } from "@/lib/brand";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl mb-4 text-sm"
      style={{
        background: `${brand.warning}08`,
        border: `1px solid ${brand.warning}20`,
      }}
    >
      <span className="text-[13px] font-medium text-muted-strong">{message}</span>

      <div className="flex items-center gap-3 shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 text-[12px] font-semibold transition-colors"
            style={{ color: brand.blue }}
          >
            <RefreshCw size={11} />
            Retry
          </button>
        )}
        <AlertTriangle size={14} style={{ color: brand.warning }} />
      </div>
    </div>
  );
}
