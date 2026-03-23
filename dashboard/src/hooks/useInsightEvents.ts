"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeInsightEvents } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import type { InsightEvent } from "@/types/insight-events";
import { rankEvents } from "@/lib/intelligence/rank-events";

interface UseInsightEventsResult {
  /** All events (ranked by severity → revenue → recency) */
  events: InsightEvent[];
  /** Undismissed events only */
  activeEvents: InsightEvent[];
  /** Top unread event for the banner */
  topUnread: InsightEvent | null;
  /** Count of unread events */
  unreadCount: number;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Mark an event as read */
  markAsRead: (eventId: string) => Promise<void>;
  /** Dismiss an event */
  dismiss: (eventId: string) => Promise<void>;
}

// ── Demo data for UI verification ──────────────────────────
const DEMO_INSIGHT_EVENTS: InsightEvent[] = [
  {
    id: "demo-evt-1",
    type: "REVENUE_LEAK_DETECTED",
    clinicId: "demo-clinic",
    clinicianId: "c-alex",
    severity: "critical",
    title: "Alex had 9 mid-programme patients who didn't rebook this week — roughly £1,170 in estimated leaked revenue",
    description: "9 patients are between sessions 2–5 of their programme with no follow-up booked. At £65/session with an average of 2 sessions remaining, this represents approximately £1,170 in revenue that may not materialise.",
    revenueImpact: 1170,
    suggestedAction: "Review Alex's patient board in Pulse — filter for churn-risk patients and check if rebooking prompts have been sent.",
    actionTarget: "owner",
    createdAt: new Date().toISOString(),
    metadata: { clinicianName: "Alex Pemberton", midProgrammeCount: 9, avgSessionsRemaining: 2, revenuePerSession: 65 },
  },
  {
    id: "demo-evt-2",
    type: "CLINICIAN_FOLLOWUP_DROP",
    clinicId: "demo-clinic",
    clinicianId: "c-sam",
    severity: "warning",
    title: "Sam's follow-up rate dropped 14% this week (from 3.1 to 2.7)",
    description: "Sam booked 2.7 follow-ups per initial assessment this week, down from 3.1 the previous week. This is a 14% week-on-week decline.",
    revenueImpact: 520,
    suggestedAction: "Check if Sam had cancellations or schedule gaps this week. Consider a brief 1:1 to discuss rebooking patterns.",
    actionTarget: "owner",
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    metadata: { clinicianName: "Sam Okoro", previousRate: 3.1, currentRate: 2.7, dropPercent: 14 },
  },
  {
    id: "demo-evt-3",
    type: "COURSE_COMPLETION_WIN",
    clinicId: "demo-clinic",
    clinicianId: "c-james",
    severity: "positive",
    title: "James hit 92% course completion this week — highest in 6 weeks",
    description: "11 out of 12 discharged patients completed their full programme this week. This is James's best course completion rate in the last 6 weeks.",
    suggestedAction: "Acknowledge this in your next team meeting — positive reinforcement drives consistency.",
    actionTarget: "owner",
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
    metadata: { clinicianName: "James Chen", completionRate: 0.92, completedCount: 11, totalDischarged: 12 },
  },
  {
    id: "demo-evt-4",
    type: "PATIENT_DROPOUT_RISK",
    clinicId: "demo-clinic",
    clinicianId: "c-alex",
    patientId: "p-demo-1",
    severity: "critical",
    title: "James Whitfield hasn't rebooked in 12 days — mid-programme (session 3 of 6)",
    description: "James is mid-programme with Alex (3/6 sessions completed) but hasn't booked a follow-up in 12 days.",
    revenueImpact: 195,
    suggestedAction: "Pulse will send an automated rebooking prompt if the sequence is enabled.",
    actionTarget: "patient",
    pulseActionId: "comms-log-demo-1",
    createdAt: new Date(Date.now() - 1800_000).toISOString(),
    metadata: { patientName: "James Whitfield", clinicianName: "Alex Pemberton", daysSinceLastVisit: 12, sessionsCompleted: 3, courseLength: 6 },
  },
  {
    id: "demo-evt-5",
    type: "HEP_COMPLIANCE_LOW",
    clinicId: "demo-clinic",
    severity: "warning",
    title: "Clinic-wide HEP compliance is at 43% — below your 50% target",
    description: "Only 43% of patients seen this week were assigned a home exercise programme. This is below the clinic target of 50%.",
    suggestedAction: "Review which clinicians are under-assigning programmes. Consider making HEP assignment part of the discharge checklist.",
    actionTarget: "owner",
    createdAt: new Date(Date.now() - 10800_000).toISOString(),
    metadata: { currentCompliance: 0.43, targetCompliance: 0.50 },
  },
];

export function useInsightEvents(): UseInsightEventsResult {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const isDemo = user?.uid === "demo";
  const [events, setEvents] = useState<InsightEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Demo mode: return demo events immediately
    if (isDemo) {
      setEvents(DEMO_INSIGHT_EVENTS);
      setLoading(false);
      return;
    }

    if (!clinicId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeInsightEvents(
      clinicId,
      (data) => {
        setEvents(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsub;
  }, [clinicId, isDemo]);

  const ranked = useMemo(() => rankEvents(events), [events]);

  const activeEvents = useMemo(
    () => ranked.filter((e) => !e.dismissedAt),
    [ranked]
  );

  const topUnread = useMemo(
    () => activeEvents.find((e) => !e.readAt) ?? null,
    [activeEvents]
  );

  const unreadCount = useMemo(
    () => activeEvents.filter((e) => !e.readAt).length,
    [activeEvents]
  );

  const markAsRead = useCallback(
    async (eventId: string) => {
      if (!db || !clinicId) return;
      try {
        const ref = doc(db, "clinics", clinicId, "insight_events", eventId);
        await updateDoc(ref, { readAt: new Date().toISOString() });
      } catch {
        setError("Unable to mark insight as read — you may not have permission.");
      }
    },
    [clinicId]
  );

  const dismiss = useCallback(
    async (eventId: string) => {
      if (!db || !clinicId) return;
      try {
        const ref = doc(db, "clinics", clinicId, "insight_events", eventId);
        await updateDoc(ref, { dismissedAt: new Date().toISOString() });
      } catch {
        setError("Unable to dismiss insight — you may not have permission.");
      }
    },
    [clinicId]
  );

  return {
    events: ranked,
    activeEvents,
    topUnread,
    unreadCount,
    loading,
    error,
    markAsRead,
    dismiss,
  };
}
