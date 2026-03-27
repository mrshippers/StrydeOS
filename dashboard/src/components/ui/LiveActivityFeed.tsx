"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useLiveActivity, MODULE_COLORS, type ActivityItem } from "@/hooks/useLiveActivity";
import { brand } from "@/lib/brand";

function relativeTime(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function FeedItem({ item }: { item: ActivityItem }) {
  const color = MODULE_COLORS[item.module];
  const inner = (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors hover:bg-white/[0.06]">
      <div
        className="w-[5px] h-[5px] rounded-full shrink-0"
        style={{ background: color }}
      />
      <span className="flex-1 min-w-0 text-[11px] text-white/70 truncate leading-snug">
        {item.text}
      </span>
      <span className="text-[9px] text-white/30 shrink-0 tabular-nums">
        {relativeTime(item.timestamp)}
      </span>
    </div>
  );

  if (item.href) {
    return <Link href={item.href} className="block">{inner}</Link>;
  }
  return inner;
}

export default function LiveActivityFeed() {
  const { items, loading } = useLiveActivity(4);

  return (
    <div
      className="rounded-[var(--radius-card)] p-5 h-full flex flex-col"
      style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, ${brand.navyMid} 100%)` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-white/35">
          Clinic Pulse
        </span>
        <div className="flex gap-[4px]">
          <div className="w-[5px] h-[5px] rounded-full" style={{ background: brand.blue }} />
          <div className="w-[5px] h-[5px] rounded-full" style={{ background: brand.teal }} />
          <div className="w-[5px] h-[5px] rounded-full" style={{ background: brand.purple }} />
        </div>
      </div>

      {/* Feed items */}
      <div className="flex flex-col gap-1 flex-1">
        {loading ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 rounded-lg bg-white/[0.04] animate-pulse" />
            ))}
          </>
        ) : items.length > 0 ? (
          items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            >
              <FeedItem item={item} />
            </motion.div>
          ))
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[11px] text-white/25 italic text-center">
              All quiet — your clinic is running smoothly
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
