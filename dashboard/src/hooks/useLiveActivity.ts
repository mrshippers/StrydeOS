"use client";

import { useState, useEffect, useMemo } from "react";
import { useInsightEvents } from "@/hooks/useInsightEvents";
import { useCallLogs } from "@/hooks/useCallLogs";
import { useCommsLog } from "@/hooks/useCommsLog";
import { useAuth } from "@/hooks/useAuth";

export type ActivityModule = "ava" | "pulse" | "intelligence";

export interface ActivityItem {
  id: string;
  module: ActivityModule;
  text: string;
  timestamp: Date;
  href?: string;
}

const MODULE_COLORS: Record<ActivityModule, string> = {
  ava: "#1C54F2",
  pulse: "#0891B2",
  intelligence: "#8B5CF6",
};

export { MODULE_COLORS };

export function useLiveActivity(maxItems = 4): { items: ActivityItem[]; loading: boolean } {
  const { user } = useAuth();
  const flags = user?.clinicProfile?.featureFlags;

  const { events: insights, loading: insightsLoading } = useInsightEvents();
  const { calls, isLoading: callsLoading } = useCallLogs();
  const { commsLog, loading: commsLoading } = useCommsLog();

  const items = useMemo(() => {
    const all: ActivityItem[] = [];

    // Intelligence insight events → activity items
    for (const e of insights.slice(0, 6)) {
      // createdAt may be a Firestore Timestamp, ISO string, or number
      const raw = e.createdAt as unknown;
      const ts = raw && typeof raw === "object" && "toDate" in (raw as Record<string, unknown>)
        ? (raw as { toDate: () => Date }).toDate()
        : new Date(e.createdAt);
      all.push({
        id: `insight-${e.id}`,
        module: "intelligence",
        text: e.title.length > 55 ? e.title.slice(0, 52) + "…" : e.title,
        timestamp: isNaN(ts.getTime()) ? new Date() : ts,
        href: "/intelligence",
      });
    }

    // Ava call events → activity items (only if module enabled)
    if (flags?.receptionist) {
      for (const c of calls.slice(0, 6)) {
        const name = c.callerPhone
          ? c.callerPhone.replace(/^\+44/, "0").slice(0, 6) + "…"
          : "Unknown";
        const outcomeText =
          c.outcome === "booked" ? `Booked ${name}`
          : c.outcome === "escalated" ? `Escalated — ${name}`
          : c.outcome === "voicemail" ? `Voicemail — ${name}`
          : c.outcome === "follow_up_required" ? `Follow-up needed — ${name}`
          : `Call handled — ${name}`;
        all.push({
          id: `ava-${c.id}`,
          module: "ava",
          text: outcomeText,
          timestamp: c.createdAt ? new Date(typeof c.createdAt === "object" && "toDate" in c.createdAt ? c.createdAt.toDate() : c.createdAt) : new Date(),
          href: "/receptionist",
        });
      }
    }

    // Pulse comms events → activity items (only if module enabled).
    // Gate on real delivery: a genuine send populates at least one provider
    // tracking ID (Twilio / Resend / n8n). Entries without any of these are
    // seed / test / ghost rows that must never render as "live activity".
    if (flags?.continuity) {
      const realSends = commsLog.filter(
        (l) => !!(l.twilioSid || l.resendId || l.n8nExecutionId),
      );
      for (const l of realSends.slice(0, 6)) {
        const seqLabel =
          l.sequenceType === "hep_reminder" ? "HEP reminder"
          : l.sequenceType === "rebooking_prompt" ? "Rebook prompt"
          : l.sequenceType === "review_prompt" ? "Review request"
          : l.sequenceType === "reactivation_90d" ? "Reactivation"
          : l.sequenceType === "reactivation_180d" ? "Reactivation"
          : l.sequenceType === "pre_auth_collection" ? "Pre-auth"
          : l.sequenceType === "early_intervention" ? "Early intervention"
          : "Message";
        const outcomeText =
          l.outcome === "booked" ? `${seqLabel} → rebooked`
          : l.outcome === "responded" ? `${seqLabel} → responded`
          : l.openedAt ? `${seqLabel} opened`
          : `${seqLabel} sent`;
        all.push({
          id: `pulse-${l.id}`,
          module: "pulse",
          text: outcomeText,
          timestamp: new Date(l.sentAt),
          href: "/continuity",
        });
      }
    }

    // Drop anything older than 14 days. The card is branded "Clinic Pulse"
    // and reads as a live feed — surfacing month-old events as "8m ago"
    // (which happens when timestamp parsing falls back to `new Date()`) or
    // as real items makes the card actively misleading.
    const cutoff = Date.now() - 14 * 86400_000;
    const fresh = all.filter((item) => item.timestamp.getTime() >= cutoff);

    // Sort newest first, take top N
    fresh.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return fresh.slice(0, maxItems);
  }, [insights, calls, commsLog, flags?.receptionist, flags?.continuity, maxItems]);

  const loading = insightsLoading || callsLoading || commsLoading;

  return { items, loading };
}
