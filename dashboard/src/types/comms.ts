import type { SequenceType, CommsChannel } from "./index";

export interface CommsSequenceConfig {
  type: SequenceType;
  name: string;
  description: string;
  channel: CommsChannel;
  delayHours: number;
  enabled: boolean;
}

export const DEFAULT_SEQUENCES: CommsSequenceConfig[] = [
  {
    type: "hep_reminder",
    name: "Post-Session HEP Reminder",
    description: "Day 1-2 after session, includes exercise plan link",
    channel: "email",
    delayHours: 24,
    enabled: true,
  },
  {
    type: "rebooking_prompt",
    name: "Re-booking Prompt",
    description: "72h after session 2+ with no next appointment",
    channel: "sms",
    delayHours: 72,
    enabled: true,
  },
  {
    type: "pre_auth_collection",
    name: "Insurance Pre-Auth Collection",
    description: "Triggered at booking if patient selects insurance",
    channel: "email",
    delayHours: 0,
    enabled: true,
  },
  {
    type: "review_prompt",
    name: "Discharge Review Prompt",
    description: "48-72h post-discharge, Google Review link",
    channel: "sms",
    delayHours: 60,
    enabled: true,
  },
  {
    type: "reactivation_90d",
    name: "90-Day Reactivation",
    description: "Check-in 90 days post-discharge",
    channel: "email",
    delayHours: 2160,
    enabled: true,
  },
  {
    type: "reactivation_180d",
    name: "180-Day Reactivation",
    description: "Check-in 180 days post-discharge",
    channel: "email",
    delayHours: 4320,
    enabled: false,
  },
];

export interface N8nWebhookPayload {
  clinicId: string;
  patientId: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  clinicianName: string;
  sequenceType: SequenceType;
  triggerData: Record<string, unknown>;
}

export interface CommsStats {
  totalSent: number;
  openRate: number;
  clickRate: number;
  conversionToRebook: number;
}
