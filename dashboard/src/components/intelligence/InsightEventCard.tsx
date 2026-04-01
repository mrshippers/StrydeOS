"use client";

import Link from "next/link";
import {
  AlertTriangle,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { brand } from "@/lib/brand";
import { useAuth } from "@/hooks/useAuth";
import type { InsightEvent, InsightSeverity } from "@/types/insight-events";

const SEVERITY_CONFIG: Record<
  InsightSeverity,
  { color: string; icon: typeof AlertTriangle; label: string }
> = {
  critical: { color: brand.danger, icon: AlertCircle, label: "Critical" },
  warning: { color: brand.warning, icon: AlertTriangle, label: "Warning" },
  positive: { color: brand.success, icon: CheckCircle2, label: "Positive" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

interface InsightEventCardProps {
  event: InsightEvent;
  onMarkRead?: (eventId: string) => void;
  compact?: boolean;
}

export default function InsightEventCard({
  event,
  onMarkRead,
  compact = false,
}: InsightEventCardProps) {
  const { user } = useAuth();
  const sev = SEVERITY_CONFIG[event.severity];
  const SevIcon = sev.icon;
  const isUnread = !event.readAt;
  const isResolved = !!event.resolvedAt;
  const hasPulseAction = !!event.pulseActionId;

  // Role-based narrative: owners see business framing, clinicians see clinical framing
  const isOwnerOrAdmin = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";
  const narrative = isOwnerOrAdmin
    ? event.ownerNarrative
    : event.clinicianNarrative;
  const hasNarrative = !!narrative;

  return (
    <div
      className={`group rounded-xl border transition-all duration-200 ${
        isUnread
          ? "border-border bg-white shadow-[var(--shadow-card)]"
          : "border-border/60 bg-cloud-light/50"
      } ${compact ? "p-3" : "p-4"}`}
      onClick={() => {
        if (isUnread && onMarkRead) void onMarkRead(event.id);
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && isUnread && onMarkRead) {
          e.preventDefault();
          void onMarkRead(event.id);
        }
      }}
      role={isUnread ? "button" : undefined}
      tabIndex={isUnread ? 0 : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Severity icon */}
        <div
          className="shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: `${sev.color}15` }}
        >
          <SevIcon size={13} style={{ color: sev.color }} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Title + timestamp */}
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-[13px] leading-snug ${
                isUnread ? "font-semibold text-navy" : "font-medium text-navy/75"
              }`}
            >
              {event.title}
            </p>
            <span className="text-[11px] text-muted shrink-0 mt-0.5">
              {timeAgo(event.createdAt)}
            </span>
          </div>

          {/* Description — prefer AI narrative over static text */}
          {!compact && (
            <p className="text-[12px] text-muted mt-1 leading-relaxed">
              {hasNarrative ? narrative : event.description}
            </p>
          )}

          {/* Suggested action — only show if no narrative (narrative includes the action) */}
          {!compact && !hasNarrative && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-cloud-light border border-border/50">
              <p className="text-[12px] font-semibold text-navy">
                → {event.suggestedAction}
              </p>
            </div>
          )}

          {/* Meta row: revenue impact + Pulse action link */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {event.revenueImpact != null && event.revenueImpact > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{
                  background: `${brand.danger}12`,
                  color: brand.danger,
                }}
              >
                <TrendingDown size={10} />
                ~£{event.revenueImpact.toLocaleString()} estimated impact
              </span>
            )}

            {hasPulseAction && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: brand.teal }}>
                <CheckCircle2 size={10} />
                Pulse sent a nudge
              </span>
            )}

            {isResolved && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: brand.success }}>
                <CheckCircle2 size={10} />
                Resolved: {event.resolution}
              </span>
            )}

            {event.type === "PATIENT_DROPOUT_RISK" && event.actionTarget === "patient" && (
              <Link
                href="/continuity"
                className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
                style={{ color: brand.teal }}
                onClick={(e) => e.stopPropagation()}
              >
                View in Pulse <ExternalLink size={9} />
              </Link>
            )}

            {isUnread && (
              <div
                className="w-2 h-2 rounded-full shrink-0 ml-auto"
                style={{ background: brand.blueGlow }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
