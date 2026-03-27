"use client";

import type { ReactNode } from "react";
import { MonolithMark } from "@/components/MonolithLogo";
import { moduleColors } from "@/lib/brand";

interface EmptyStateProps {
  icon?: ReactNode;
  heading: string;
  subtext: string;
  action?: ReactNode;
  module?: "ava" | "pulse" | "intelligence";
}

export default function EmptyState({ heading, subtext, action, module }: EmptyStateProps) {
  const accentColor = moduleColors[module ?? "default"];

  return (
    <div className="relative flex flex-col items-center justify-center py-16 px-8 text-center overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(400px circle at 50% 40%, ${accentColor}0F, transparent 70%)`,
        }}
      />

      <div className="relative mb-6">
        <MonolithMark size={64} />
      </div>

      <h3 className="relative font-display text-2xl text-navy mb-2">{heading}</h3>
      <p className="relative text-[15px] text-muted-strong max-w-md leading-relaxed mb-6">
        {subtext}
      </p>
      {action && <div className="relative">{action}</div>}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-white overflow-hidden">
      {/* label bar */}
      <div className="p-6">
        <div className="h-2.5 w-20 skeleton-shimmer rounded-md mb-4" />
        {/* primary value */}
        <div className="h-12 w-24 skeleton-shimmer rounded-lg mb-3" />
        {/* target text */}
        <div className="h-2 w-16 skeleton-shimmer rounded-md mb-4" />
        {/* trend area */}
        <div className="h-5 w-32 skeleton-shimmer rounded-md" />
      </div>
      {/* progress bar at bottom */}
      <div className="h-[3px] w-full skeleton-shimmer" />
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-white overflow-hidden">
      {/* table header */}
      <div className="px-5 py-3 border-b border-border flex gap-8">
        {[40, 28, 28, 28, 20, 20, 24].map((w, i) => (
          <div key={i} className="h-2 skeleton-shimmer rounded-md" style={{ width: `${w * 3}px` }} />
        ))}
      </div>
      {/* rows */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="px-5 py-3.5 border-b border-border/50 flex items-center gap-8">
          {/* avatar + name */}
          <div className="flex items-center gap-3 shrink-0" style={{ width: 120 }}>
            <div className="w-8 h-8 rounded-full skeleton-shimmer shrink-0" />
            <div className="h-3 w-20 skeleton-shimmer rounded-md" />
          </div>
          {/* metric badges */}
          {[48, 52, 44, 44].map((w, j) => (
            <div key={j} className="h-5 skeleton-shimmer rounded-md" style={{ width: w }} />
          ))}
          {/* sessions + revenue */}
          <div className="h-3 skeleton-shimmer rounded-md" style={{ width: 28 }} />
          <div className="h-3 skeleton-shimmer rounded-md" style={{ width: 48 }} />
          {/* status dot */}
          <div className="w-2 h-2 rounded-full skeleton-shimmer ml-auto" />
        </div>
      ))}
    </div>
  );
}
