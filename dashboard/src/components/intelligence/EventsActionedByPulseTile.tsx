"use client";

/**
 * Small read-only tile on the Intelligence dashboard showing how many
 * Intelligence-emitted events Pulse has actioned in the last 7 days.
 *
 * Wire: `/clinics/{clinicId}/events` filtered by `consumedBy` contains
 * `'pulse'`. This is the cross-module coupling surface — Intelligence owns
 * event emission, Pulse owns action, this tile is the handshake.
 *
 * Renders nothing until the subscription is ready to avoid flashing a
 * zero-state on first paint.
 */

import { useEventsActionedByPulse } from "@/hooks/useEventsActionedByPulse";
import { brand } from "@/lib/brand";
import { Activity } from "lucide-react";

export default function EventsActionedByPulseTile() {
  const { count, loading } = useEventsActionedByPulse();

  if (loading) return null;

  return (
    <section
      className="rounded-[var(--radius-card)] border p-4 flex items-center gap-4"
      style={{
        borderColor: `${brand.teal}33`,
        background: `${brand.teal}0F`,
      }}
      aria-label="Events actioned by Pulse in the last seven days"
    >
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full"
        style={{ background: `${brand.teal}1F`, color: brand.teal }}
      >
        <Activity size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="font-display text-2xl leading-none tabular-nums"
          style={{ color: brand.navy }}
        >
          {count}
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mt-1">
          Events actioned by Pulse (7d)
        </p>
      </div>
      <span
        className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={{ background: `${brand.teal}1A`, color: brand.teal }}
      >
        Pulse
      </span>
    </section>
  );
}
