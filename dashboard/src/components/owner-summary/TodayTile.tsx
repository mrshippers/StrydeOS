"use client";

import { brand } from "@/lib/brand";
import { Calendar } from "lucide-react";

interface TodayTileProps {
  todayTotal: number;
  todayDnas: number;
  loading: boolean;
}

export default function TodayTile({ todayTotal, todayDnas, loading }: TodayTileProps) {
  return (
    <div
      className="rounded-[var(--radius-card)] p-5 flex flex-col gap-4 border-l-2"
      style={{
        background: "linear-gradient(135deg, #0B2545 0%, #132D5E 100%)",
        borderLeftColor: brand.teal,
      }}
    >
      <div className="flex items-center gap-2">
        <Calendar size={16} style={{ color: brand.teal }} />
        <span className="text-[11px] font-semibold tracking-widest uppercase text-white/40">
          Today
        </span>
      </div>

      {loading ? (
        <div className="animate-pulse bg-white/5 rounded-lg h-10 w-32" />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-[32px] font-bold text-white leading-none tabular-nums">
              {todayTotal}
            </p>
            <p className="text-[13px] text-white/50">appointments</p>
          </div>

          <div>
            {todayDnas > 0 ? (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ background: `${brand.warning}22`, color: brand.warning }}
              >
                {todayDnas} DNA
              </span>
            ) : (
              <span className="text-[13px]" style={{ color: brand.teal }}>
                All attended
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
