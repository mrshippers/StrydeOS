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
    description: "Step 1: NPS score request (day 3). Step 2: Google Review link for promoters (day 5).",
    channel: "sms",
    delayHours: 72,
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
      { stepNumber: 2, daysAfterTrigger: 5, channel: "sms",   templateKey: "review_step2" },
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
 * SMS template bodies — templateKey → message text.
 * [Name] and [ClinicName] are substituted at send time.
 *
 * Tone variants: each base template has _standard, _supportive, and _clinical
 * variants. The toneModifier from Heidi complexity signals selects the variant.
 * resolveTemplate() below handles the lookup + fallback.
 */
export const SMS_TEMPLATES: Record<string, string> = {
  // ── Review ─────────────────────────────────────────────────────────────────
  review_step1:
    "Hi [Name], thank you for choosing [ClinicName]. On a scale of 0-10, how likely are you to recommend us? Simply reply with a number.",
  review_step2:
    "Hi [Name], we're glad you had a great experience! If you have a moment, a Google Review would mean the world to us: [ReviewLink]",

  // ── Rebooking — standard ───────────────────────────────────────────────────
  rebooking_step1_standard:
    "Hi [Name], we noticed you haven't booked your next appointment at [ClinicName]. Staying on track with your sessions helps you recover faster. Book now: [BookingUrl]",
  rebooking_step2_standard:
    "Hi [Name], just a reminder — your next session at [ClinicName] hasn't been booked yet. We'd love to keep your progress on track: [BookingUrl]",
  rebooking_step3_standard:
    "Hi [Name], it's been a little while since your last session at [ClinicName]. We'd recommend booking in to maintain your progress: [BookingUrl]",
  rebooking_step4_standard:
    "Hi [Name], your clinician at [ClinicName] recommends continuing your sessions. Book when you're ready: [BookingUrl]",

  // ── Rebooking — supportive (psychosocial flags) ────────────────────────────
  rebooking_step1_supportive:
    "Hi [Name], we hope you're doing well. When you feel ready, we'd love to see you for your next session at [ClinicName]. No rush — book when it suits you: [BookingUrl]",
  rebooking_step2_supportive:
    "Hi [Name], just checking in from [ClinicName]. Your wellbeing matters to us. If you'd like to continue your sessions, we're here whenever you're ready: [BookingUrl]",
  rebooking_step3_supportive:
    "Hi [Name], we haven't seen you in a while at [ClinicName] and wanted to make sure everything's OK. Feel free to book in when you're ready, or call us if you'd like to chat first.",
  rebooking_step4_supportive:
    "Hi [Name], thinking of you from [ClinicName]. If there's anything we can do to help, please don't hesitate to reach out. We're here when you need us: [BookingUrl]",

  // ── Rebooking — clinical (high complexity) ─────────────────────────────────
  rebooking_step1_clinical:
    "Hi [Name], given the nature of your treatment at [ClinicName], we'd recommend booking your next session to stay on course with your rehabilitation plan: [BookingUrl]",
  rebooking_step2_clinical:
    "Hi [Name], a reminder from [ClinicName] — continuity is important for your current treatment plan. Please book your next session when you can: [BookingUrl]",
  rebooking_step3_clinical:
    "Hi [Name], your clinician at [ClinicName] has noted that ongoing sessions are important for your recovery. Please book in to continue your programme: [BookingUrl]",
  rebooking_step4_clinical:
    "Hi [Name], we'd like to review your progress at [ClinicName]. Please book a follow-up session at your earliest convenience: [BookingUrl]",

  // ── HEP reminder — standard ────────────────────────────────────────────────
  hep_step1_standard:
    "Hi [Name], your next session at [ClinicName] is coming up. Have you been keeping up with your exercises? Completing them makes a real difference to your recovery.",
  hep_step2_standard:
    "Hi [Name], a quick reminder from [ClinicName] — your home exercises are an important part of your treatment. Keep at it and you'll feel the difference.",

  // ── HEP reminder — supportive ──────────────────────────────────────────────
  hep_step1_supportive:
    "Hi [Name], we know it can be hard to stay on top of exercises. Even a little bit helps. Do what you can and let your clinician at [ClinicName] know how you're getting on.",
  hep_step2_supportive:
    "Hi [Name], just a gentle reminder from [ClinicName] about your exercises. Don't worry if you've missed a few — any movement is good movement. Keep going at your own pace.",

  // ── HEP reminder — clinical ────────────────────────────────────────────────
  hep_step1_clinical:
    "Hi [Name], your prescribed exercise programme from [ClinicName] is a key part of your rehabilitation. Consistent adherence will support your recovery between sessions.",
  hep_step2_clinical:
    "Hi [Name], your clinician at [ClinicName] has designed your exercises specifically for your condition. Completing them as prescribed will help us progress your treatment plan effectively.",

  // ── Early intervention — standard ──────────────────────────────────────────
  early_intervention_step1_standard:
    "Hi [Name], we noticed you're early in your treatment at [ClinicName]. These first few sessions are important — let's keep the momentum going. Book your next: [BookingUrl]",

  // ── Early intervention — supportive ────────────────────────────────────────
  early_intervention_step1_supportive:
    "Hi [Name], we know starting treatment can feel like a lot. We're here to support you every step of the way at [ClinicName]. When you're ready for your next session: [BookingUrl]",

  // ── Early intervention — clinical ──────────────────────────────────────────
  early_intervention_step1_clinical:
    "Hi [Name], the initial phase of your treatment at [ClinicName] is critical for establishing a baseline. We'd recommend booking your next session promptly: [BookingUrl]",

  // ── Reactivation 90d — standard ────────────────────────────────────────────
  reactivation_step1_standard:
    "Hi [Name], it's been a while since your last visit to [ClinicName]. If you've got any new niggles or want a check-up, we're here: [BookingUrl]",

  // ── Reactivation 90d — supportive ──────────────────────────────────────────
  reactivation_step1_supportive:
    "Hi [Name], hope you've been well since your last visit to [ClinicName]. If anything's cropped up or you just want a check-in, we'd love to hear from you: [BookingUrl]",

  // ── Reactivation 90d — clinical ────────────────────────────────────────────
  reactivation_step1_clinical:
    "Hi [Name], given your treatment history at [ClinicName], a follow-up assessment may be beneficial. Please book a review if you've experienced any recurrence: [BookingUrl]",
};

/**
 * Resolve a template key to its tone-specific variant.
 * Falls back: tone variant → base key → generic fallback.
 */
export function resolveTemplate(
  templateKey: string,
  tone: ToneModifier = "standard"
): string {
  // Try tone-specific variant first (e.g. "rebooking_step1_supportive")
  const toneKey = `${templateKey}_${tone}`;
  if (SMS_TEMPLATES[toneKey]) return SMS_TEMPLATES[toneKey];

  // Fall back to standard variant
  const standardKey = `${templateKey}_standard`;
  if (SMS_TEMPLATES[standardKey]) return SMS_TEMPLATES[standardKey];

  // Fall back to base key (review templates don't have tone variants)
  if (SMS_TEMPLATES[templateKey]) return SMS_TEMPLATES[templateKey];

  return `Hi [Name], this is a reminder from [ClinicName].`;
}

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
  /** Pre-resolved SMS body — n8n uses this directly instead of hardcoded templates. */
  resolvedSmsBody?: string;
}
