export type CallOutcome = "booked" | "cancelled" | "missed" | "info" | "transferred";

export interface CallLog {
  id: string;
  timestamp: string;
  duration: number;
  outcome: CallOutcome;
  clinicianId?: string;
  patientId?: string;
  callerPhone?: string;
  recordingUrl?: string;
  voiceCallId?: string;
}
