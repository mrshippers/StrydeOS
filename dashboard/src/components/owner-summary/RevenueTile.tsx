"use client";

import { brand } from "@/lib/brand";
import { PoundSterling } from "lucide-react";

interface RevenueTileProps {
  revenueMtdPence: number;
  loading: boolean;
}

export default function RevenueTile({ revenueMtdPence, loading }: RevenueTileProps) {
  return (
    <div
      className="rounded-[var(--radius-card)] p-5 flex flex-col gap-4 border-l-2"
      style={{
        background: "linear-gradient(135deg, #0B2545 0%, #132D5E 100%)",
        borderLeftColor: brand.purple,
      }}
    >
      <div className="flex items-center gap-2">
        <PoundSterling size={16} style={{ color: brand.purple }} />
        <span className="text-[11px] font-semibold tracking-widest uppercase text-white/40">
          This Month
        </span>
      </div>

      {loading ? (
        <div
          className="animate-pulse rounded-lg h-10 w-32"
          style={{ background: `${brand.purple}22` }}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-[32px] font-bold text-white leading-none tabular-nums">
            £{Math.round(revenueMtdPence / 100).toLocaleString("en-GB")}
          </p>
          <p className="text-[13px] text-white/50">Month to date</p>
        </div>
      )}
    </div>
  );
}
