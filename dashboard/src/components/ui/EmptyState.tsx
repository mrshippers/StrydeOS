"use client";

import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  heading: string;
  subtext: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, heading, subtext, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-cloud-dark/60 flex items-center justify-center mb-5 text-muted">
        {icon}
      </div>
      <h3 className="font-display text-xl text-navy mb-2">{heading}</h3>
      <p className="text-sm text-muted max-w-md leading-relaxed mb-6">
        {subtext}
      </p>
      {action}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-white p-5 animate-skeleton">
      <div className="h-3 w-20 bg-cloud-dark rounded mb-4" />
      <div className="h-9 w-28 bg-cloud-dark rounded mb-2" />
      <div className="h-2 w-16 bg-cloud-dark rounded" />
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-white p-6 animate-skeleton space-y-3">
      <div className="h-4 w-40 bg-cloud-dark rounded" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-3 w-32 bg-cloud-dark rounded" />
          <div className="h-3 w-16 bg-cloud-dark rounded" />
          <div className="h-3 w-16 bg-cloud-dark rounded" />
          <div className="h-3 w-16 bg-cloud-dark rounded" />
        </div>
      ))}
    </div>
  );
}
