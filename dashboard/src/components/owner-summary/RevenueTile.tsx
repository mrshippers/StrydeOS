"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { brand } from "@/lib/brand";
import { DURATION, EASING, useMorphValue } from "@/lib/motion";
import { PoundSterling } from "lucide-react";

interface RevenueTileProps {
  revenueMtdPence: number;
  periodLabel?: string;
  loading: boolean;
}

export default function RevenueTile({
  revenueMtdPence,
  periodLabel = "Month to date",
  loading,
}: RevenueTileProps) {
  const displayPounds = Math.round(revenueMtdPence / 100);
  const morph = useMorphValue(displayPounds);
  const morphLabel = useMorphValue(periodLabel);
  const valueOpacity = morph.isAnimating ? 0 : 1;
  const labelOpacity = morphLabel.isAnimating ? 0 : 1;
  const valueDur = morph.isAnimating ? DURATION.morphOut : DURATION.morphIn;
  const labelDur = morphLabel.isAnimating ? DURATION.morphOut : DURATION.morphIn;

  return (
    <GlassCard
      variant="hero"
      tint="intelligence"
      className="p-5 flex flex-col gap-4"
      style={{
        background: "var(--surface-tile)",
        minHeight: 148,
      }}
    >
      <div className="flex items-center gap-2">
        <PoundSterling size={16} style={{ color: brand.purple }} />
        <span className="text-[11px] font-semibold tracking-widest uppercase text-navy/55 dark:text-white/40">
          Revenue
        </span>
      </div>

      {loading ? (
        <div
          className="animate-pulse rounded-lg h-10 w-32"
          style={{ background: `${brand.purple}22` }}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <p
            className="text-[32px] font-bold text-navy dark:text-white leading-none tabular-nums"
            style={{
              opacity: valueOpacity,
              transition: `opacity ${valueDur}ms ${EASING}`,
            }}
          >
            £{morph.value.toLocaleString("en-GB")}
          </p>
          <p
            className="text-[13px] text-navy/65 dark:text-white/50"
            style={{
              opacity: labelOpacity,
              transition: `opacity ${labelDur}ms ${EASING} ${DURATION.subtitleDelay}ms`,
            }}
          >
            {morphLabel.value}
          </p>
        </div>
      )}
    </GlassCard>
  );
}
