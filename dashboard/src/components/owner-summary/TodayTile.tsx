"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { brand } from "@/lib/brand";
import { DURATION, EASING, useMorphValue } from "@/lib/motion";
import { Calendar } from "lucide-react";

interface TodayTileProps {
  todayTotal: number;
  todayDnas: number;
  periodLabel?: string;
  loading: boolean;
}

export default function TodayTile({
  todayTotal,
  todayDnas,
  periodLabel = "appointments today",
  loading,
}: TodayTileProps) {
  const morph = useMorphValue(todayTotal);
  const morphLabel = useMorphValue(periodLabel);
  const valueOpacity = morph.isAnimating ? 0 : 1;
  const labelOpacity = morphLabel.isAnimating ? 0 : 1;
  const valueDur = morph.isAnimating ? DURATION.morphOut : DURATION.morphIn;
  const labelDur = morphLabel.isAnimating ? DURATION.morphOut : DURATION.morphIn;

  return (
    <GlassCard
      variant="hero"
      tint="pulse"
      className="p-5 flex flex-col gap-4"
      style={{
        background: "var(--surface-tile)",
        minHeight: 148,
      }}
    >
      <div className="flex items-center gap-2">
        <Calendar size={16} style={{ color: brand.teal }} />
        <span className="text-[11px] font-semibold tracking-widest uppercase text-white/40">
          Schedule
        </span>
      </div>

      {loading ? (
        <div className="animate-pulse bg-white/5 rounded-lg h-10 w-32" />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <p
              className="text-[32px] font-bold text-white leading-none tabular-nums"
              style={{
                opacity: valueOpacity,
                transition: `opacity ${valueDur}ms ${EASING}`,
              }}
            >
              {morph.value}
            </p>
            <p
              className="text-[13px] text-white/50"
              style={{
                opacity: labelOpacity,
                transition: `opacity ${labelDur}ms ${EASING} ${DURATION.subtitleDelay}ms`,
              }}
            >
              {morphLabel.value}
            </p>
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
    </GlassCard>
  );
}
