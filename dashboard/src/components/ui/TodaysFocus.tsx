"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, AlertCircle, TrendingUp, CheckCircle2 } from "lucide-react";
import { brand } from "@/lib/brand";
import { useTodaysFocus } from "@/hooks/useTodaysFocus";
import type { FocusNudge } from "@/hooks/useTodaysFocus";

const SEVERITY_STYLES: Record<
  FocusNudge["severity"],
  { bg: string; border: string; iconColor: string; icon: typeof AlertCircle }
> = {
  action: {
    bg: `rgba(8,145,178,0.06)`,
    border: `rgba(8,145,178,0.18)`,
    iconColor: brand.teal,
    icon: AlertCircle,
  },
  info: {
    bg: `rgba(139,92,246,0.06)`,
    border: `rgba(139,92,246,0.18)`,
    iconColor: brand.purple,
    icon: TrendingUp,
  },
  win: {
    bg: `rgba(5,150,105,0.06)`,
    border: `rgba(5,150,105,0.18)`,
    iconColor: brand.success,
    icon: CheckCircle2,
  },
};

function NudgeCard({ nudge, index }: { nudge: FocusNudge; index: number }) {
  const style = SEVERITY_STYLES[nudge.severity];
  const Icon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: index * 0.08 }}
      className="rounded-[var(--radius-card)] p-4 flex items-start gap-3"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      <div
        className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${style.iconColor}15` }}
      >
        <Icon size={14} color={style.iconColor} strokeWidth={2} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-navy leading-tight">
          {nudge.title}
        </p>
        <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
          {nudge.description}
        </p>
        {nudge.actionHref && nudge.actionLabel && (
          <Link
            href={nudge.actionHref}
            className="inline-flex items-center gap-1 text-[12px] font-semibold mt-2 transition-colors hover:underline"
            style={{ color: style.iconColor }}
          >
            {nudge.actionLabel}
            <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </motion.div>
  );
}

export default function TodaysFocus() {
  const { nudges, loading, enabled } = useTodaysFocus();

  if (!enabled || loading || nudges.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mb-4"
    >
      <p className="text-[11px] font-semibold text-muted uppercase tracking-[0.1em] mb-2">
        Today&apos;s Focus
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {nudges.map((nudge, i) => (
          <NudgeCard key={nudge.type} nudge={nudge} index={i} />
        ))}
      </div>
    </motion.section>
  );
}
