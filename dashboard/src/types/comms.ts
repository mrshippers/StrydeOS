import type { LifecycleState, SequenceType, CommsChannel } from "./index";

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
    description: "Step 1: NPS score request (reply with 0-10). Step 2: Google Review link for promoters.",
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

export type ExitCondition =
  | "appointment_booked"
  | "unsubscribed"
  | "discharged"
  | "re_engaged";

export interface SequenceStep {
  stepNumber: number;        // 1–6
  daysAfterTrigger: number;  // days after the trigger event (not after previous step)
  channel: CommsChannel;
  templateKey: string;
}

export interface SequenceDefinition {
  id: string;
  name: string;
  sequenceType: SequenceType;
  steps: SequenceStep[];
  attributionWindowDays: number | null; // null = attribution not applicable (pre_auth_collection)
  exitConditions: ExitCondition[];
  cooldownDays: number;   // min days before same sequence re-fires to same patient
  active: boolean;
  priority: number;       // lower = higher priority; early_intervention = 1
}

// Seed data — used to populate Firestore on first pipeline run
export const DEFAULT_SEQUENCE_DEFINITIONS: Omit<SequenceDefinition, "id">[] = [
  {
    name: "Early Intervention",
    sequenceType: "early_intervention",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 1, channel: "sms", templateKey: "early_intervention_step1" },
      { stepNumber: 2, daysAfterTrigger: 3, channel: "email", templateKey: "early_intervention_step2" },
    ],
    attributionWindowDays: 5,
    exitConditions: ["appointment_booked", "unsubscribed", "discharged", "re_engaged"],
    cooldownDays: 3,
    active: true,
    priority: 1,
  },
  {
    name: "Re-booking Prompt",
    sequenceType: "rebooking_prompt",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 1,  channel: "sms",   templateKey: "rebooking_step1" },
      { stepNumber: 2, daysAfterTrigger: 3,  channel: "email", templateKey: "rebooking_step2" },
      { stepNumber: 3, daysAfterTrigger: 7,  channel: "sms",   templateKey: "rebooking_step3" },
      { stepNumber: 4, daysAfterTrigger: 14, channel: "sms",   templateKey: "rebooking_step4" },
    ],
    attributionWindowDays: 7,
    exitConditions: ["appointment_booked", "unsubscribed", "discharged", "re_engaged"],
    cooldownDays: 7,
    active: true,
    priority: 2,
  },
  {
    name: "Post-Session HEP Reminder",
    sequenceType: "hep_reminder",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 1, channel: "email", templateKey: "hep_step1" },
      { stepNumber: 2, daysAfterTrigger: 3, channel: "email", templateKey: "hep_step2" },
    ],
    attributionWindowDays: 7,
    exitConditions: ["appointment_booked", "unsubscribed"],
    cooldownDays: 7,
    active: true,
    priority: 3,
  },
  {
    name: "Discharge Review Prompt",
    sequenceType: "review_prompt",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 3, channel: "sms",   templateKey: "review_step1" },
      { stepNumber: 2, daysAfterTrigger: 7, channel: "sms",   templateKey: "review_step2" },
    ],
    attributionWindowDays: 14,
    exitConditions: ["appointment_booked", "unsubscribed"],
    cooldownDays: 30,
    active: true,
    priority: 4,
  },
  {
    name: "90-Day Reactivation",
    sequenceType: "reactivation_90d",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 88,  channel: "sms",   templateKey: "reactivation_step1" },
      { stepNumber: 2, daysAfterTrigger: 91,  channel: "email", templateKey: "reactivation_step2" },
      { stepNumber: 3, daysAfterTrigger: 95,  channel: "sms",   templateKey: "reactivation_step3" },
      { stepNumber: 4, daysAfterTrigger: 102, channel: "sms",   templateKey: "reactivation_step4" },
      { stepNumber: 5, daysAfterTrigger: 118, channel: "sms",   templateKey: "reactivation_step5" },
      { stepNumber: 6, daysAfterTrigger: 148, channel: "sms",   templateKey: "reactivation_step6" },
    ],
    attributionWindowDays: 30,
    exitConditions: ["appointment_booked", "unsubscribed", "re_engaged"],
    cooldownDays: 90,
    active: true,
    priority: 5,
  },
  {
    name: "180-Day Reactivation",
    sequenceType: "reactivation_180d",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 178, channel: "sms",   templateKey: "reactivation_180_step1" },
      { stepNumber: 2, daysAfterTrigger: 181, channel: "email", templateKey: "reactivation_180_step2" },
      { stepNumber: 3, daysAfterTrigger: 185, channel: "sms",   templateKey: "reactivation_180_step3" },
      { stepNumber: 4, daysAfterTrigger: 192, channel: "sms",   templateKey: "reactivation_180_step4" },
      { stepNumber: 5, daysAfterTrigger: 208, channel: "sms",   templateKey: "reactivation_180_step5" },
      { stepNumber: 6, daysAfterTrigger: 238, channel: "sms",   templateKey: "reactivation_180_step6" },
    ],
    attributionWindowDays: 30,
    exitConditions: ["appointment_booked", "unsubscribed", "re_engaged"],
    cooldownDays: 90,
    active: false,
    priority: 6,
  },
  {
    name: "Insurance Pre-Auth Collection",
    sequenceType: "pre_auth_collection",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 0, channel: "email", templateKey: "pre_auth_step1" },
    ],
    attributionWindowDays: null,
    exitConditions: ["unsubscribed"],
    cooldownDays: 3,
    active: true,
    priority: 7,
  },
];

/**
 * SMS template bodies for n8n — templateKey → message text.
 * [Name] and [ClinicName] are substituted by the send route.
 * review_step1 asks for NPS score; review_step2 follows up with Google Review link for promoters.
 */
export const SMS_TEMPLATES: Record<string, string> = {
  review_step1:
    "Hi [Name], thank you for choosing [ClinicName]. On a scale of 0-10, how likely are you to recommend us? Simply reply with a number.",
  review_step2:
    "Hi [Name], we're glad you had a great experience! If you have a moment, a Google Review would mean the world to us: [ReviewLink]",
};

// Extended n8n payload — adds step tracking fields
export type ToneModifier = "standard" | "supportive" | "clinical";

export interface N8nSequencePayload {
  clinicId: string;
  patientId: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  clinicianName: string;
  sequenceType: SequenceType;
  logId: string;
  callbackUrl: string;
  stepNumber: number;
  sequenceDefinitionId: string;
  attributionWindowDays: number | null;
  triggerData: Record<string, unknown>;
  /** Heidi-derived tone hint for n8n template selection. */
  toneModifier?: ToneModifier;
}
