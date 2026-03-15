/**
 * Firestore helpers for the voiceInteractions sub-collection.
 *
 * Collection path: clinics/{clinicId}/voiceInteractions/{callId}
 *
 * Client-side reads use the Firebase SDK (db from firebase.ts).
 * Server-side writes use firebase-admin via the Retell webhook handler.
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type Firestore,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";

export type VoiceInteractionOutcome =
  | "booked"
  | "escalated"
  | "voicemail"
  | "follow_up_required"
  | "resolved"
  | null;

export type VoiceInteractionUrgency =
  | "low"
  | "medium"
  | "high"
  | "urgent"
  | null;

export interface VoiceInteraction {
  id: string;
  callId: string;
  agentId: string;
  callType: "phone_call" | "web_call";
  callStatus: string;
  callerPhone: string | null;
  toNumber: string | null;
  patientId: string | null;
  reasonForCall: string | null;
  outcome: VoiceInteractionOutcome;
  urgency: VoiceInteractionUrgency;
  callSummary: string | null;
  userSentiment: string | null;
  callSuccessful: boolean | null;
  inVoicemail: boolean;
  transcript: string | null;
  transcriptUrl: string | null;
  recordingUrl: string | null;
  durationSeconds: number | null;
  startTimestamp: number | null;
  endTimestamp: number | null;
  disconnectionReason: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** Firestore collection name for voice interaction documents */
export const VOICE_INTERACTIONS_COLLECTION = "voiceInteractions";

/**
 * Subscribe to today's voice interactions for a clinic (real-time).
 * Returns an unsubscribe function.
 */
export function subscribeToTodaysCalls(
  db: Firestore,
  clinicId: string,
  onData: (calls: VoiceInteraction[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const colRef = collection(
    db,
    "clinics",
    clinicId,
    VOICE_INTERACTIONS_COLLECTION
  );

  const q = query(
    colRef,
    where("startTimestamp", ">=", todayStart.getTime()),
    orderBy("startTimestamp", "desc"),
    limit(100)
  );

  return onSnapshot(
    q,
    (snap) => {
      const calls = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as VoiceInteraction[];
      onData(calls);
    },
    (err) => onError?.(err)
  );
}

/**
 * Subscribe to recent voice interactions (last N days) for a clinic.
 */
export function subscribeToRecentCalls(
  db: Firestore,
  clinicId: string,
  days: number,
  onData: (calls: VoiceInteraction[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cutoff = Date.now() - days * 86_400_000;

  const colRef = collection(
    db,
    "clinics",
    clinicId,
    VOICE_INTERACTIONS_COLLECTION
  );

  const q = query(
    colRef,
    where("startTimestamp", ">=", cutoff),
    orderBy("startTimestamp", "desc"),
    limit(500)
  );

  return onSnapshot(
    q,
    (snap) => {
      const calls = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as VoiceInteraction[];
      onData(calls);
    },
    (err) => onError?.(err)
  );
}

/**
 * Subscribe to today's ElevenLabs call_log entries for a clinic (real-time).
 * Maps call_log format to VoiceInteraction format.
 * Returns an unsubscribe function.
 */
export function subscribeTodaysElevenLabsCalls(
  db: Firestore,
  clinicId: string,
  onData: (calls: VoiceInteraction[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const colRef = collection(
    db,
    "clinics",
    clinicId,
    "call_log"
  );

  const q = query(
    colRef,
    where("startTimestamp", ">=", todayStart.getTime()),
    orderBy("startTimestamp", "desc"),
    limit(100)
  );

  return onSnapshot(
    q,
    (snap) => {
      const calls = snap.docs.map((doc) => {
        const data = doc.data();
        // Map call_log format to VoiceInteraction format
        return {
          id: doc.id,
          callId: doc.id,
          agentId: data.agentId || "",
          callType: "phone_call" as const,
          callStatus: data.event === "conversation.ended" ? "analyzed" : "ongoing",
          callerPhone: data.callerPhone,
          toNumber: null,
          patientId: null,
          reasonForCall: data.reasonForCall,
          outcome: data.outcome || null,
          urgency: null,
          callSummary: data.callSummary,
          userSentiment: null,
          callSuccessful: data.outcome === "booked" || data.outcome === "resolved",
          inVoicemail: data.outcome === "voicemail",
          transcript: data.transcript,
          transcriptUrl: null,
          recordingUrl: null,
          durationSeconds: data.durationSeconds,
          startTimestamp: data.startTimestamp,
          endTimestamp: null,
          disconnectionReason: null,
          createdAt: null,
          updatedAt: null,
        } as VoiceInteraction;
      });
      onData(calls);
    },
    (err) => onError?.(err)
  );
}
