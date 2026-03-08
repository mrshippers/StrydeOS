/**
 * useCallLogs
 *
 * Real-time Firestore subscription to today's voiceInteractions for the
 * authenticated clinic. Falls back to DEMO_CALLS if Retell is not configured
 * (i.e. when NEXT_PUBLIC_RETELL_CONFIGURED !== "true") or when no live data
 * exists yet.
 *
 * Returns:
 *   calls       — array of today's calls (live or demo)
 *   isDemo      — true when showing demo data
 *   isLoading   — initial load in progress
 *   activeCall  — the currently ongoing call if any
 */

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import {
  subscribeToTodaysCalls,
  type VoiceInteraction,
} from "@/lib/firebase/voiceInteractions";

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_CALLS: VoiceInteraction[] = [
  {
    id: "demo-1",
    callId: "demo-call-1",
    agentId: "demo",
    callType: "phone_call",
    callStatus: "analyzed",
    callerPhone: "07912 *** 482",
    toNumber: null,
    patientId: null,
    reasonForCall: "New patient booking — back pain",
    outcome: "booked",
    urgency: "low",
    callSummary: "Sarah Mitchell booked initial assessment with Andrew. Insurance: Bupa.",
    userSentiment: "Positive",
    callSuccessful: true,
    inVoicemail: false,
    transcript: null,
    transcriptUrl: null,
    recordingUrl: null,
    durationSeconds: 185,
    startTimestamp: Date.now() - 6 * 3600_000 + 15 * 60_000,
    endTimestamp: Date.now() - 6 * 3600_000 + 15 * 60_000 + 185_000,
    disconnectionReason: null,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "demo-2",
    callId: "demo-call-2",
    agentId: "demo",
    callType: "phone_call",
    callStatus: "analyzed",
    callerPhone: "07834 *** 119",
    toNumber: null,
    patientId: null,
    reasonForCall: "Enquiry — pricing and availability",
    outcome: "resolved",
    urgency: "low",
    callSummary: "New enquiry about pricing. Caller asked about initial assessment cost. Directed to website.",
    userSentiment: "Neutral",
    callSuccessful: true,
    inVoicemail: false,
    transcript: null,
    transcriptUrl: null,
    recordingUrl: null,
    durationSeconds: 95,
    startTimestamp: Date.now() - 5 * 3600_000,
    endTimestamp: Date.now() - 5 * 3600_000 + 95_000,
    disconnectionReason: null,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "demo-3",
    callId: "demo-call-3",
    agentId: "demo",
    callType: "phone_call",
    callStatus: "analyzed",
    callerPhone: "07701 *** 655",
    toNumber: null,
    patientId: null,
    reasonForCall: "Return patient — knee pain follow-up",
    outcome: "booked",
    urgency: "low",
    callSummary: "Tom Edwards booked follow-up with Max. Self-pay.",
    userSentiment: "Positive",
    callSuccessful: true,
    inVoicemail: false,
    transcript: null,
    transcriptUrl: null,
    recordingUrl: null,
    durationSeconds: 220,
    startTimestamp: Date.now() - 4 * 3600_000,
    endTimestamp: Date.now() - 4 * 3600_000 + 220_000,
    disconnectionReason: null,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "demo-4",
    callId: "demo-call-4",
    agentId: "demo",
    callType: "phone_call",
    callStatus: "analyzed",
    callerPhone: "07456 *** 823",
    toNumber: null,
    patientId: null,
    reasonForCall: "Cancellation — existing appointment",
    outcome: "follow_up_required",
    urgency: "low",
    callSummary: "Lisa Wang cancelled appointment. Insurance: AXA Health. Could not rebook — preferred times unavailable.",
    userSentiment: "Neutral",
    callSuccessful: false,
    inVoicemail: false,
    transcript: null,
    transcriptUrl: null,
    recordingUrl: null,
    durationSeconds: 140,
    startTimestamp: Date.now() - 3 * 3600_000,
    endTimestamp: Date.now() - 3 * 3600_000 + 140_000,
    disconnectionReason: null,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "demo-5",
    callId: "demo-call-5",
    agentId: "demo",
    callType: "phone_call",
    callStatus: "analyzed",
    callerPhone: "07923 *** 091",
    toNumber: null,
    patientId: null,
    reasonForCall: "Lower back pain enquiry",
    outcome: "voicemail",
    urgency: "low",
    callSummary: "James called re: lower back pain (3 weeks). Left voicemail requesting callback.",
    userSentiment: "Neutral",
    callSuccessful: false,
    inVoicemail: true,
    transcript: "Hi, it's James calling. I wanted to book an appointment for my lower back — I've been having issues for about three weeks. Please give me a call back when you get a chance. Thanks.",
    transcriptUrl: null,
    recordingUrl: null,
    durationSeconds: 45,
    startTimestamp: Date.now() - 2 * 3600_000,
    endTimestamp: Date.now() - 2 * 3600_000 + 45_000,
    disconnectionReason: null,
    createdAt: null,
    updatedAt: null,
  },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseCallLogsResult {
  calls: VoiceInteraction[];
  isDemo: boolean;
  isLoading: boolean;
  activeCall: VoiceInteraction | null;
}

export function useCallLogs(): UseCallLogsResult {
  const { user } = useAuth();
  const [calls, setCalls] = useState<VoiceInteraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLiveData, setHasLiveData] = useState(false);

  const retellConfigured = process.env.NEXT_PUBLIC_RETELL_CONFIGURED === "true";

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !user?.clinicId || !retellConfigured) {
      setCalls(DEMO_CALLS);
      setIsLoading(false);
      return;
    }

    const unsub = subscribeToTodaysCalls(
      db,
      user.clinicId,
      (liveCalls) => {
        if (liveCalls.length > 0) {
          setCalls(liveCalls);
          setHasLiveData(true);
        } else {
          // No calls today yet — show demo until first real call arrives
          setCalls(DEMO_CALLS);
          setHasLiveData(false);
        }
        setIsLoading(false);
      },
      () => {
        // On error fall back to demo
        setCalls(DEMO_CALLS);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [user?.clinicId, retellConfigured]);

  const activeCall = calls.find((c) => c.callStatus === "ongoing") ?? null;

  return {
    calls,
    isDemo: !retellConfigured || !hasLiveData,
    isLoading,
    activeCall,
  };
}
