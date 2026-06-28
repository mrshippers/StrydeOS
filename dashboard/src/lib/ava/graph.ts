/**
 * Ava Conversation Graph — LangGraph state machine for call routing.
 *
 * Replaces the monolithic prompt approach with explicit conversation nodes
 * and hard-gated transitions. Each call type is a node. Guardrails are
 * edges that CANNOT be bypassed by prompt manipulation.
 *
 * Architecture:
 *   ElevenLabs ConvAI (voice layer) → webhook → LangGraph (routing + guardrails)
 *                                                 ↓
 *                                          Action nodes (book, relay, escalate)
 *
 * The graph doesn't replace the ElevenLabs voice layer — it sits alongside it
 * as the decision engine for what Ava should do with each interaction.
 */

import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendTelegramAlert } from "./telegram";

// ─── State Schema ───────────────────────────────────────────────────────────

export const AvaState = Annotation.Root({
  /** Raw caller utterance or call summary */
  callerInput: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),

  /** Classified intent from the router node */
  intent: Annotation<AvaIntent>({ reducer: (_, b) => b, default: () => "unknown" }),

  /** Current conversation node */
  currentNode: Annotation<string>({ reducer: (_, b) => b, default: () => "router" }),

  /** Collected patient details */
  patientDetails: Annotation<PatientDetails>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),

  /** Call metadata */
  callMeta: Annotation<CallMeta>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({ clinicId: "", clinicName: "", callerPhone: "" }),
  }),

  /** Guardrail flags — once set, cannot be unset */
  guardrails: Annotation<GuardrailFlags>({
    reducer: (a, b) => ({
      emergencyDetected: a.emergencyDetected || b.emergencyDetected,
      insuranceQuery: a.insuranceQuery || b.insuranceQuery,
      insurerDetected: a.insurerDetected || b.insurerDetected,
      excessFaq: a.excessFaq || b.excessFaq,
      excessPaymentQuery: a.excessPaymentQuery || b.excessPaymentQuery,
      clinicalAdviceSought: a.clinicalAdviceSought || b.clinicalAdviceSought,
      gdprBlock: a.gdprBlock || b.gdprBlock,
      mentalHealthCrisis: a.mentalHealthCrisis || b.mentalHealthCrisis,
      abusiveCaller: a.abusiveCaller || b.abusiveCaller,
    }),
    default: () => ({
      emergencyDetected: false,
      insuranceQuery: false,
      insurerDetected: false,
      excessFaq: false,
      excessPaymentQuery: false,
      clinicalAdviceSought: false,
      gdprBlock: false,
      mentalHealthCrisis: false,
      abusiveCaller: false,
    }),
  }),

  /** Response to send back / action to take */
  response: Annotation<AvaResponse>({
    reducer: (_, b) => b,
    default: () => ({ action: "continue", message: "" }),
  }),

  /** Message history for context */
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  /** Set to true by redFlagDetectorNode if any red-flag terms are found */
  redFlag: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),

  /** The red-flag terms found in the transcript (populated when redFlag is true) */
  flagsFound: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),

  /** Structured clinical intake captured by structuredIntakeNode (booking/cancel paths only) */
  structuredIntake: Annotation<StructuredIntake | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type AvaIntent =
  // ── Original 16-class set (routerNode) ──────────────────────────────────
  | "booking_new"
  | "booking_returning"
  | "cancellation"
  | "reschedule"
  | "insurance_query"
  | "clinical_question"
  | "emergency"
  | "mental_health_crisis"
  | "message_relay"        // Patient calling with an update for their clinician
  | "complaint"
  | "gp_referral"
  | "faq"
  | "third_party_booking"
  | "gdpr_request"         // Asking about another patient
  | "solicitor_sales"
  | "unknown"
  // ── 5-class set (intentRouterNode only — hard limit, no expansion) ──────
  | "booking"          // Covers new/returning/reschedule/third-party
  | "cancel"           // Covers cancellation
  | "enquiry"          // Covers faq / message_relay / complaint / gp_referral
  | "clinical_triage"; // Covers clinical_question — routes to human_handoff

export interface PatientDetails {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  insurerName?: string;
  preferredClinician?: string;
  preferredDay?: string;
  complaint?: string;
  isNewPatient?: boolean;
}

export interface CallMeta {
  clinicId: string;
  clinicName: string;
  callerPhone: string;
  callId?: string;
  clinicianNames?: string[];
  clinicEmail?: string;
  callStartTime?: string;
}

export interface GuardrailFlags {
  emergencyDetected: boolean;
  insuranceQuery: boolean;
  insurerDetected: boolean;
  excessFaq: boolean;
  excessPaymentQuery: boolean;
  clinicalAdviceSought: boolean;
  gdprBlock: boolean;
  mentalHealthCrisis: boolean;
  abusiveCaller: boolean;
}

export type AvaAction =
  | "continue"         // Keep talking, no system action needed
  | "book_appointment" // Trigger PMS booking
  | "relay_message"    // Forward message to clinician
  | "escalate_999"     // Emergency — direct to 999
  | "callback_request" // Arrange clinician/back-office callback
  | "transfer_call"    // Warm-transfer to reception/Moneypenny
  | "end_call";        // Politely end the call

export interface AvaResponse {
  action: AvaAction;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Validated structured intake captured before slot selection */
export interface StructuredIntake {
  body_region: string;
  onset_days: number | null;
  mechanism: string | null;
  appointment_type: string;
}

const StructuredIntakeSchema = z.object({
  body_region: z.string(),
  onset_days: z.number().nullable(),
  mechanism: z.string().nullable(),
  appointment_type: z.string(),
});

// The legacy 16-class router (routerNode/ROUTER_PROMPT/isValidIntent) was removed
// 2026-06-26 when the graph was reconciled onto the 5-class intent_router spine.
// It classified an intent that intent_router immediately overwrote — a redundant
// LLM call per request — and it is no longer wired into buildAvaGraph().

// ─── Guardrail Gate ─────────────────────────────────────────────────────────
// This runs AFTER routing and BEFORE any action node.
// It checks for hard-stop conditions that override all other logic.

export function guardrailGate(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  const flags: Partial<GuardrailFlags> = {};

  // Emergency keywords — pattern match as a second layer behind the LLM classifier
  const lower = state.callerInput.toLowerCase();
  const emergencyPatterns = [
    /saddle\s*(area|numbness|numb)/,
    /bladder\s*(control|loss|can.?t\s*(hold|control))/,
    /bowel\s*(control|loss|can.?t\s*(hold|control))/,
    /both\s*legs?\s*(weak|numb|can.?t\s*(feel|move))/,
    // Reversed phrasing: "I can't feel both my legs", "can't move both legs"
    /can.?t\s*(feel|move)\s*(both|my)\s*(my\s*)?legs?/,
    /worst\s*headache/,
    /thunderclap/,
    /chest\s*pain/,
    /can.?t\s*breathe/,
    /bone\s*(sticking|poking)\s*out/,
    // "face is drooping", "face has dropped", "face drooping on one side"
    /face\s*(is\s*|has\s*)?(droop|drooping|dropped|drooped)/,
    // Allow any possessive/article before arm/hand: "can't lift his arm", "can't raise the arm"
    /can.?t\s*(lift|move|raise)\s*(my|his|her|their|the|your\s*)?\s*(arm|hand)/,
    /slurred?\s*speech/,
    /stroke/,
  ];

  if (emergencyPatterns.some((p) => p.test(lower))) {
    flags.emergencyDetected = true;
  }

  // Insurer name detection — patient mentions their insurer (informational, not a query).
  // This flag is used by the routing logic to allow insured bookings to proceed.
  const insurerNamePattern = /(?:i'm|i am|coming|insured|through|with)\s*(?:bupa|axa|vitality|aviva|cigna|allianz|wpa|healix|nuffield|simply\s*health)/i;
  if (insurerNamePattern.test(lower)) {
    flags.insurerDetected = true;
  }

  // ── Excess handling: split into Case B (outstanding payment to clinic) vs Case A (general FAQ) ──

  // Case B — Outstanding excess owed TO THE CLINIC (billing matter)
  // Patient owes money, wants to pay, or is asking about an outstanding balance.
  // These mention the clinic/practice, owing, paying, settling, invoices for excess.
  const excessPaymentPatterns = [
    /(?:pay|settle|clear)\s*(?:my\s*)?excess/,                      // "pay my excess", "settle my excess"
    /excess\s*(?:payment|invoice|bill)\s*(?:to|from|for|at|with)\s*(?:the\s*)?(?:clinic|practice|spires|you)/,
    /(?:owe|owing)\s*(?:my\s*)?(?:the\s*)?excess/,                  // "I owe my excess"
    /(?:owe|owing)\s*(?:.*?)excess\s*(?:to\s*(?:the\s*)?(?:clinic|practice|you))?/, // "owe excess to the practice"
    /outstanding\s*excess/,                                          // "outstanding excess"
    /excess\s*(?:balance|outstanding|owed|owing|due)/,               // "excess balance", "excess owed"
    /invoice\s*(?:for|about)\s*(?:my\s*)?excess/,                    // "invoice for my excess"
    /excess\s*(?:from|for)\s*(?:my\s*)?(?:last|previous|recent)/,    // "excess from my last appointment"
  ];

  if (excessPaymentPatterns.some((p) => p.test(lower))) {
    flags.excessPaymentQuery = true;
  }

  // Case A — General excess FAQ (patient asking their insurer excess amount)
  // "How much is my excess?", "What's my excess with Bupa?"
  // These do NOT mention owing/paying the clinic — they're asking about the insurer figure.
  // Only match if Case B didn't already match.
  const excessFaqPatterns = [
    /(?:how\s*much|what)\s*(?:is|'s)\s*(?:my\s*)?excess/,           // "how much is my excess", "what's my excess"
    /(?:my|the)\s*excess\s*(?:amount|fee|figure)/,                   // "my excess amount", "the excess fee"
    /excess\s*(?:with|on|for|under)\s*(?:my\s*)?(?:bupa|axa|vitality|aviva|cigna|allianz|wpa|healix|nuffield|simply\s*health)/i,
    /(?:do\s*you\s*)?know\s*(?:what\s*)?(?:my\s*)?excess/,          // "do you know what my excess is"
    /how\s*much\s*excess\s*(?:do\s*)?(?:i|I)\s*(?:have\s*to\s*)?pay/, // "how much excess do I have to pay"
  ];

  if (!flags.excessPaymentQuery && excessFaqPatterns.some((p) => p.test(lower))) {
    flags.excessFaq = true;
  }

  // Insurance keywords — hard gate, no discussion allowed
  // Excess patterns are now handled separately above.
  const insurancePatterns = [
    /pre.?auth/,
    /authoris?ation\s*(code|number|ref)/,
    /how\s*much\s*(will|does|is)\s*(my\s*)?(insurance|insurer|bupa|axa|vitality|aviva)/,
    /coverage?\s*(amount|limit|detail)/,
    /claim\s*(code|number|form)/,
    /policy\s*(number|detail)/,
    /what.s\s*(covered|not\s*covered)/,
  ];

  if (insurancePatterns.some((p) => p.test(lower))) {
    flags.insuranceQuery = true;
  }

  // Billing keywords — routed to back-office callback
  // Note: excess-specific billing is already caught by excessPaymentPatterns above.
  const billingPatterns = [
    /invoic(e|es|ing)/,
    /billing\s*(query|question|issue|dispute|problem)/,
    /discuss\s*(my\s*)?invoic/,
    /payment\s*(query|question|issue|dispute|problem|outstanding)/,
    /outstanding\s*(balance|payment|amount)/,
    /receipt|refund/,
  ];

  if (billingPatterns.some((p) => p.test(lower))) {
    flags.insuranceQuery = true;
  }

  // Mental health crisis
  if (/self.?harm|suicid|kill\s*(my|him|her)?self|end\s*(my|it\s*all)|don.?t\s*want\s*to\s*live/.test(lower)) {
    flags.mentalHealthCrisis = true;
  }

  // GDPR block — asking about another patient
  if (/someone\s*else.s\s*appointment|another\s*patient|my\s*(wife|husband|partner|mum|dad|friend).s\s*appointment/.test(lower)) {
    flags.gdprBlock = true;
  }

  // Clinical advice sought — caller asking Ava for an opinion, diagnosis, or
  // treatment recommendation. Ava must NEVER give medical advice; this is the
  // deterministic backstop so a medical answer can't depend solely on the LLM
  // classifier. Patterns are advice-VERB shaped (ask/should/diagnose), so
  // simply naming a body part to book ("book for my lower back") does NOT trip.
  const clinicalAdvicePatterns = [
    /do\s*you\s*think/,                                                  // "do you think I've torn it"
    /what\s*do\s*you\s*(think|reckon|suggest|recommend)/,                // "what do you think is wrong"
    /should\s*i\s*(take|use|try|do|get|see|rest|ice|stretch|apply|stop)/, // "should I take ibuprofen"
    /\bis\s*(my|this|it|that|the)\b.{0,40}\b(serious|broken|sprained|torn|fractured|dislocated|infected|normal|dangerous)\b/, // "is my shoulder pain serious"
    /do\s*i\s*need\s*(an?\s*|the\s*)?(x.?ray|scan|mri|ultrasound|surgery|operation|injection|referral|antibiotics?|treatment)\b/, // "do I need an x-ray"
    /what(?:'?s|\s*is)\s*causing/,                                        // "what's causing my headaches"
    /what\s*(painkiller|medication|tablets?|exercises?|stretches?|treatment)/, // "what painkiller should I take"
    /\b(diagnose|diagnosis)\b/,
  ];

  if (clinicalAdvicePatterns.some((p) => p.test(lower))) {
    flags.clinicalAdviceSought = true;
  }

  return {
    guardrails: {
      emergencyDetected: flags.emergencyDetected ?? false,
      insuranceQuery: flags.insuranceQuery ?? false,
      insurerDetected: flags.insurerDetected ?? false,
      excessFaq: flags.excessFaq ?? false,
      excessPaymentQuery: flags.excessPaymentQuery ?? false,
      clinicalAdviceSought: flags.clinicalAdviceSought ?? false,
      gdprBlock: flags.gdprBlock ?? false,
      mentalHealthCrisis: flags.mentalHealthCrisis ?? false,
      abusiveCaller: flags.abusiveCaller ?? false,
    },
  };
}

// ─── Action Nodes ───────────────────────────────────────────────────────────

function emergencyNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  return {
    currentNode: "emergency",
    response: {
      action: "escalate_999",
      message: "I want to make sure you get the right help straightaway. What you're describing sounds like something that needs urgent medical attention. Please call 999 or get to A&E as soon as you can. We're a physiotherapy clinic and I wouldn't want to delay the care you need.",
    },
  };
}

function mentalHealthNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  return {
    currentNode: "mental_health",
    response: {
      action: "escalate_999",
      message: "I'm really sorry to hear you're feeling that way. I'd strongly encourage you to reach out to the Samaritans — their number is 116 123, available 24 hours. You can also call 999 if you feel you're in immediate danger. Is there anything else I can do for you today?",
    },
  };
}

function insuranceGateNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  return {
    currentNode: "insurance_gate",
    response: {
      action: "callback_request",
      message: "I'll need to put you through to our back office for insurance queries — can I take your name and a reference number, and I'll have someone call you back today?",
      metadata: {
        callbackType: "back_office",
        reason: "insurance_query",
        neverDiscuss: ["coverage amounts", "policy numbers", "claim codes", "authorisation codes"],
      },
    },
  };
}

/**
 * Case A — General excess FAQ.
 * Patient is asking "how much is my excess?" — this is between them and their insurer.
 * Ava deflects with a helpful answer and continues the conversation.
 */
function excessFaqNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  return {
    currentNode: "excess_faq",
    response: {
      action: "continue",
      message: "Your excess amount is agreed between you and your insurer — they'll be able to confirm the exact figure for you. Is there anything else I can help with?",
      metadata: {
        flow: "excess_faq",
      },
    },
  };
}

/**
 * Case B — Outstanding excess owed to the clinic.
 * Patient owes excess money to the clinic (e.g. Spires). This is a billing matter.
 * Routes to callback_request so back-office can follow up with:
 *   1. An alert/notification to the clinic owner
 *   2. An email to the patient about the outstanding amount
 */
function excessPaymentNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  return {
    currentNode: "excess_payment",
    response: {
      action: "callback_request",
      message: "Let me get our back office to help you with that — can I take your name and number, and someone will be in touch today about the excess payment?",
      metadata: {
        callbackType: "back_office",
        reason: "excess_payment",
        alertType: "billing",
        alertOwner: true,
        emailPatient: true,
      },
    },
  };
}

/**
 * Insured booking — patient is booking AND has mentioned their insurer.
 * Ava continues the booking flow but asks for pre-authorisation details.
 * This avoids the insurance hard-block for legitimate booking enquiries.
 */
// ─── Preserved action nodes (not on the live spine) ─────────────────────────
// These were built for the retired 16-class router. The 5-class intent_router
// does not route to them yet, so they are not wired into buildAvaGraph(). They
// are exported (not deleted) so the response copy survives and they are ready to
// wire when intent routing is extended.
export function insuranceBookingNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  const isNew = state.intent === "booking_new" || state.intent === "third_party_booking";
  return {
    currentNode: "insurance_booking",
    response: {
      action: "continue",
      message: isNew
        ? `Lovely — let's get you booked in. Do you have your pre-authorisation number from your insurer? It'll usually be on your approval letter or email. If you don't have it to hand, no worries — just bring it along to your appointment or email it over to ${state.callMeta.clinicEmail || "us"} beforehand.`
        : `Of course — let me find you a slot. Do you have your pre-authorisation reference to hand? We'll need that for your insurer. If you can't find it right now, that's absolutely fine — just bring it along to the appointment or email it to ${state.callMeta.clinicEmail || "us"} before you come in.`,
      metadata: {
        bookingType: isNew ? "insured_initial" : "insured_follow_up",
        insurerDetected: true,
        requiredFields: ["firstName", "lastName", "phone", "preAuthCode", "address"],
        preAuthRequired: true,
        preAuthFallback: "bring_to_appointment_or_email",
        flow: "insurance_booking_flow",
      },
    },
  };
}

function clinicalBoundaryNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  return {
    currentNode: "clinical_boundary",
    response: {
      action: "callback_request",
      message: "That sounds really uncomfortable. Our physios will assess that properly — I wouldn't want to give you the wrong information. Shall I get you booked in so they can take a proper look? Or I can arrange a callback if you'd prefer to chat it through with one of the team first.",
      metadata: {
        callbackType: "clinician",
        reason: "clinical_advice_sought",
        neverDo: ["diagnose", "suggest conditions", "recommend treatment", "promise outcomes"],
      },
    },
  };
}

function gdprBlockNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  return {
    currentNode: "gdpr_block",
    response: {
      action: "continue",
      message: "I'm not able to share details about another patient's appointment, I'm afraid — data protection. But if you let me know the patient's name, I can pass a message on for them to get in touch with you.",
    },
  };
}

export function messageRelayNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  // Patient is calling with an update for their clinician
  // e.g. Moneypenny forwarding: "Surri Gray called, expecting an email, hasn't received it"
  // e.g. Patient: "Can you let Max know I'll be 5 minutes late?"
  return {
    currentNode: "message_relay",
    response: {
      action: "relay_message",
      message: "Of course — I'll pass that on to the team straightaway. Can I just take your name and the message you'd like me to pass on?",
      metadata: {
        callbackType: "clinician_message",
        reason: "patient_update",
        captureFields: ["patientName", "message", "clinicianName", "urgency"],
      },
    },
  };
}

export function bookingNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  const isNew = state.intent === "booking_new";
  return {
    currentNode: "booking",
    response: {
      action: "continue",
      message: isNew
        ? "Lovely — let's get you booked in. Are you self-funding, or coming through a health insurer?"
        : "Of course — let me find you a slot. Do you have a preference for which physio you see, or is it more about finding a day that works?",
      metadata: {
        bookingType: isNew ? "initial_assessment" : "follow_up",
        requiredFields: ["firstName", "lastName", "phone", "email"],
        flow: "booking_flow",
      },
    },
  };
}

export function cancellationNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  return {
    currentNode: "cancellation",
    response: {
      action: "continue",
      message: "Of course — no problem at all. Shall I find you another slot while we're on the phone?",
      metadata: { flow: "cancellation_recovery" },
    },
  };
}

export function complaintNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  return {
    currentNode: "complaint",
    response: {
      action: "transfer_call",
      message: "I'm sorry to hear that — let me put you through to someone who can help right away. One moment.",
      metadata: { callbackType: "manager", reason: "complaint", transferTo: "reception" },
    },
  };
}

export function gpReferralNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  return {
    currentNode: "gp_referral",
    response: {
      action: "continue",
      message: "Of course — let me take the patient details and I'll make sure one of our physios picks this up. What's the patient's name?",
      metadata: {
        captureFields: ["referrerName", "referrerPractice", "patientName", "patientPhone", "referralReason"],
        flow: "professional_referral",
      },
    },
  };
}

export function faqNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  // FAQ responses are handled by the ElevenLabs knowledge base.
  // This node signals to the system that the KB should be consulted.
  return {
    currentNode: "faq",
    response: {
      action: "continue",
      message: "",  // Empty — ElevenLabs KB handles the actual answer
      metadata: { flow: "knowledge_base_lookup" },
    },
  };
}

export function solicitorSalesNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  const clinicEmail = state.callMeta.clinicEmail || "our email address";

  return {
    currentNode: "solicitor_sales",
    response: {
      action: "end_call",
      message: `I'm afraid this line is for patient enquiries. Could you email ${clinicEmail} and the right person will get back to you?`,
    },
  };
}

export function fallbackNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  return {
    currentNode: "fallback",
    response: {
      action: "callback_request",
      message: "That's a good question — let me have one of the team get back to you on that. Can I take your number?",
      metadata: { callbackType: "general", reason: state.callerInput.slice(0, 100) },
    },
  };
}

// ─── New Nodes: redFlagDetector, intentRouter, structuredIntake, humanHandoff ─
//
// Graph wiring (pending greet node):
//   greet → [redFlagDetector + intentRouter]  ← fan-out added when greet is implemented
//   redFlagDetector: redFlag=true → human_handoff | false → (intentRouter drives routing)
//   intentRouter: booking/cancel → structuredIntake → fetchSlots (pending)
//                 enquiry → greet (pending)
//                 clinical_triage/unknown → human_handoff

/** Red-flag terms scanned verbatim (case-insensitive) in the caller transcript */
const RED_FLAG_TERMS = [
  "cauda equina",
  "saddle anaesthesia",
  "bilateral leg weakness",
  "loss of bladder",
  "loss of bowel",
  "chest pain",
  "crushing chest",
  "radiating to arm",
  "shortness of breath",
  "calf pain and swelling",
  "sudden severe headache",
  "unexplained weight loss",
  "night sweats",
  "constant night pain",
  "cannot weight bear",
  "deformity",
] as const;

/**
 * Scans the caller transcript for clinical red-flag terms.
 * Runs in parallel with intentRouterNode after the greet node.
 *
 * When a red flag is found:
 *   1. Logs to Firestore `red_flag_alerts` (audit trail).
 *   2. Writes to `clinic_notifications` (clinicId-partitioned — surfaced in Pulse/dashboard).
 *   3. Fires sendTelegramAlert (scaffolded — no-ops until TELEGRAM_BOT_TOKEN is set).
 *   4. Returns { redFlag: true, flagsFound } → graph routes to human_handoff.
 *
 * Immediate care is handled by the human_handoff node (redirect to A&E).
 * The notification exists so the clinic owner/admin is aware for professional
 * follow-up after A&E attendance — not as a first-line response.
 */
export async function redFlagDetectorNode(
  state: typeof AvaState.State
): Promise<Partial<typeof AvaState.State>> {
  const lower = state.callerInput.toLowerCase();
  const flagsFound = RED_FLAG_TERMS.filter((term) => lower.includes(term));
  const redFlag = flagsFound.length > 0;

  if (redFlag) {
    const db = getAdminDb();
    const timestamp = new Date();

    // Audit log — full detail
    void db.collection("clinics").doc(state.callMeta.clinicId).collection("red_flag_alerts").add({
      timestamp,
      clinicId: state.callMeta.clinicId,
      callId: state.callMeta.callId ?? null,
      flagsFound,
      transcript: state.callerInput,
    }).catch((err) => {
      console.error("[red_flag_detector] Failed to write audit log:", err instanceof Error ? err.message : err);
    });

    // Owner/admin notification — read by Pulse dashboard (clinicId-partitioned)
    void db
      .collection("clinics").doc(state.callMeta.clinicId)
      .collection("clinic_notifications").add({
        type: "red_flag",
        timestamp,
        callId: state.callMeta.callId ?? null,
        flagsFound,
        callerPhone: state.callMeta.callerPhone,
        message: `Red flag call: patient directed to A&E. Flags: ${flagsFound.join(", ")}. Follow-up at clinician discretion.`,
        read: false,
      }).catch((err) => {
        console.error("[red_flag_detector] Failed to write clinic notification:", err instanceof Error ? err.message : err);
      });

    // Telegram — scaffolded, fires only when TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set
    void sendTelegramAlert({
      context: "ava_red_flag",
      message: `Red flag at ${state.callMeta.clinicName}\nFlags: ${flagsFound.join(", ")}\nTranscript: ${state.callerInput.slice(0, 300)}`,
    });
  }

  return { redFlag, flagsFound: flagsFound as string[] };
}

const INTENT_ROUTER_PROMPT = `You are a call intent classifier for a UK physiotherapy clinic.
Classify the caller's message into EXACTLY ONE of these 5 categories. Reply with a single word only — no punctuation, no explanation.

- booking          : Wants to book, reschedule, or change an appointment
- cancel           : Wants to cancel an appointment
- enquiry          : General question (prices, hours, parking, location, admin)
- clinical_triage  : Describing symptoms, asking about a condition, or seeking clinical advice
- unknown          : Cannot be classified into any of the above

Single word only. One of: booking, cancel, enquiry, clinical_triage, unknown.`;

/** Hard limit: exactly these 5 classes, no expansion */
const INTENT_ROUTER_CLASSES = ["booking", "cancel", "enquiry", "clinical_triage", "unknown"] as const;
type IntentRouterClass = (typeof INTENT_ROUTER_CLASSES)[number];

/**
 * Classifies caller intent into one of 5 classes using claude-sonnet-4-20250514.
 * Drop-in replacement for detectIntent; same input/output interface.
 *
 * Routing downstream:
 *   booking | cancel → structuredIntake → fetchSlots
 *   enquiry          → greet (loop)
 *   clinical_triage  → human_handoff
 *   unknown          → human_handoff
 */
export async function intentRouterNode(
  state: typeof AvaState.State
): Promise<Partial<typeof AvaState.State>> {
  const model = new ChatAnthropic({
    model: "claude-sonnet-4-6",
    temperature: 0,
    maxTokens: 50,
  });

  const result = await model.invoke([
    new SystemMessage(INTENT_ROUTER_PROMPT),
    new HumanMessage(state.callerInput),
  ]);

  const raw = (result.content as string).trim().toLowerCase().replace(/[^a-z_]/g, "") as IntentRouterClass;
  const intent: AvaIntent = INTENT_ROUTER_CLASSES.includes(raw) ? raw : "unknown";

  return { intent };
}

const STRUCTURED_INTAKE_PROMPT = `You are a clinical intake assistant for a UK physiotherapy clinic.
Extract structured information from the patient's description and return ONLY a valid JSON object.
Use this exact schema — no extra fields, no markdown, no explanation:

{
  "body_region": "string — the body part affected (e.g. lower back, right shoulder, left knee)",
  "onset_days": number or null — how many days ago the problem started (null if unclear),
  "mechanism": "string or null — what caused it (e.g. fall, sport, lifting, gradual onset), null if unclear",
  "appointment_type": "string — one of: initial_assessment, follow_up, sports_massage"
}`;

/**
 * Collects structured clinical intake before slot selection.
 * Runs after intentRouterNode on booking and cancel paths only.
 *
 * - Validates output with Zod (returns null on parse failure, never throws).
 * - Writes to Firestore session document (non-blocking).
 * - Passes appointment_type downstream via structuredIntake state field.
 */
export async function structuredIntakeNode(
  state: typeof AvaState.State
): Promise<Partial<typeof AvaState.State>> {
  const model = new ChatAnthropic({
    model: "claude-sonnet-4-6",
    temperature: 0,
    maxTokens: 200,
  });

  const result = await model.invoke([
    new SystemMessage(STRUCTURED_INTAKE_PROMPT),
    new HumanMessage(state.callerInput),
  ]);

  let intake: StructuredIntake | null = null;
  try {
    // Strip optional markdown fences (```json ... ```) before parsing
    const raw = (result.content as string).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(raw);
    intake = StructuredIntakeSchema.parse(parsed);
  } catch {
    // Schema violation or malformed JSON — proceed without structured data
    intake = null;
  }

  if (intake) {
    const sessionId = `${state.callMeta.clinicId}_${state.callMeta.callId ?? Date.now()}`;
    void getAdminDb()
      .collection("clinics").doc(state.callMeta.clinicId)
      .collection("sessions")
      .doc(sessionId)
      .set({ structuredIntake: intake }, { merge: true })
      .catch((err) => {
        console.error("[structuredIntakeNode] Failed to persist intake:", err instanceof Error ? err.message : err);
      });
  }

  return { structuredIntake: intake };
}

/**
 * Terminal escalation node — reached when redFlag is true or intent is
 * clinical_triage / unknown. Warm-transfers to reception.
 *
 * Message: "Let me get someone who can help you with that."
 */
export function humanHandoffNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  // Clinical red flag: this is NOT a routine transfer. Surface explicit
  // emergency safety-netting in the spoken copy AND carry an `escalate` marker
  // so the post-call webhook raises the critical AVA_CALL_ESCALATED insight and
  // fires the real-time escalation SMS (a red flag must never be logged as a
  // plain "transferred" call). Wording is deliberately conservative: the
  // red-flag list spans true 999 emergencies and urgent-GP presentations, so it
  // signposts emergency care without telling every caller to dial 999.
  if (state.redFlag) {
    return {
      currentNode: "human_handoff",
      response: {
        action: "transfer_call",
        message:
          "Some of what you've described needs to be looked at urgently. If you feel this is an emergency, please hang up and call 999 or go straight to A&E. Otherwise stay on the line and I'll get someone from the clinic to help you right away.",
        // callbackType/reason classify this as a clinician escalation so the
        // post-call webhook raises a SPECIFIC AVA_CALL_ESCALATED insight rather
        // than the generic default; flagsFound carries the detected red-flag
        // terms through to Pulse/Intelligence.
        metadata: {
          escalate: true,
          callbackType: "clinician",
          reason: "red_flag",
          flagsFound: state.flagsFound ?? [],
        },
      },
    };
  }
  return {
    currentNode: "human_handoff",
    response: {
      action: "transfer_call",
      message: "Let me get someone who can help you with that.",
    },
  };
}

/** Routing after redFlagDetectorNode: true → human_handoff, false → guardrail_gate */
function routeAfterRedFlag(state: typeof AvaState.State): string {
  return state.redFlag ? "human_handoff" : "guardrail_gate";
}

/**
 * Live-graph routing after the deterministic guardrail gate. Diverts ONLY on a
 * hard-stop safety flag (emergency / mental-health crisis / excess / insurance /
 * GDPR / clinical-advice) to the matching action node; every other call
 * continues to the LLM intent router. This is the reconciliation that makes the
 * safety gates reachable at runtime without the intent path short-circuiting.
 *
 * Distinct from routeAfterGuardrails (which ALSO does intent-based routing and
 * is retained for the offline evaluateGuardrailRouting seam + its test suite):
 * this one runs BEFORE intent classification, so it must only act on the
 * pattern-matched safety flags and otherwise hand off to intent_router.
 */
export function routeAfterGuardrailGate(state: typeof AvaState.State): string {
  const g = state.guardrails;
  if (g.emergencyDetected) return "emergency";
  if (g.mentalHealthCrisis) return "mental_health";
  if (g.excessPaymentQuery) return "excess_payment";
  if (g.excessFaq) return "excess_faq";
  if (g.insuranceQuery) return "insurance_gate";
  if (g.gdprBlock) return "gdpr_block";
  if (g.clinicalAdviceSought) return "clinical_boundary";
  return "intent_router";
}

/** Routing after intentRouterNode */
function routeAfterIntentRouter(state: typeof AvaState.State): string {
  switch (state.intent) {
    case "booking":
    case "cancel":
      return "structured_intake";
    case "enquiry":
      // Routes back to greet (loop) — edge added when greet node is implemented
      return END;
    case "clinical_triage":
    case "unknown":
    default:
      return "human_handoff";
  }
}

// ─── Routing Logic ──────────────────────────────────────────────────────────

export function routeAfterGuardrails(
  state: typeof AvaState.State
): string {
  const g = state.guardrails;

  // Hard gates — these ALWAYS override intent classification
  if (g.emergencyDetected) return "emergency";
  if (g.mentalHealthCrisis) return "mental_health";

  // Excess handling — checked BEFORE general insurance gate.
  // Case B (outstanding payment to clinic) takes priority over Case A (FAQ).
  if (g.excessPaymentQuery) return "excess_payment";
  if (g.excessFaq) return "excess_faq";

  if (g.insuranceQuery) {
    // If the caller is booking AND mentions an insurer, it's an insured booking — not a query.
    // Let the booking flow handle it with insurance metadata.
    const bookingIntents: AvaIntent[] = ["booking_new", "booking_returning", "third_party_booking"];
    if (g.insurerDetected && bookingIntents.includes(state.intent)) return "insurance_booking";
    return "insurance_gate";
  }

  // If no insurance query fired but an insurer was mentioned during a booking, route to insured booking
  if (g.insurerDetected) {
    const bookingIntents: AvaIntent[] = ["booking_new", "booking_returning", "third_party_booking"];
    if (bookingIntents.includes(state.intent)) return "insurance_booking";
  }

  if (g.gdprBlock) return "gdpr_block";

  // Clinical advice — deterministic deflection to the clinical boundary node.
  // Checked after the emergency / mental-health / insurance / GDPR hard gates
  // (those take priority) but before LLM-intent routing, so Ava never answers a
  // medical question even if the classifier mislabels it.
  if (g.clinicalAdviceSought) return "clinical_boundary";

  // Intent-based routing
  switch (state.intent) {
    case "booking_new":
    case "booking_returning":
    case "third_party_booking":
      return "booking";
    case "cancellation":
    case "reschedule":
      return "cancellation";
    case "emergency":
      return "emergency";
    case "mental_health_crisis":
      return "mental_health";
    case "insurance_query":
      return "insurance_gate";
    case "clinical_question":
      return "clinical_boundary";
    case "message_relay":
      return "message_relay";
    case "complaint":
      return "complaint";
    case "gp_referral":
      return "gp_referral";
    case "gdpr_request":
      return "gdpr_block";
    case "solicitor_sales":
      return "solicitor_sales";
    case "faq":
      return "faq";
    default:
      return "fallback";
  }
}

// ─── Offline guardrail evaluation (no LLM) ──────────────────────────────────
//
// guardrailGate + routeAfterGuardrails are deterministic, LLM-free decision
// logic. This convenience composes them so the safety-critical routing for a
// given utterance can be unit-tested offline (no ANTHROPIC_API_KEY needed),
// which is exactly the CI condition. The full graph still runs the LLM router
// at runtime; this exposes only the hard-gate decision for testing/assertions.

export interface GuardrailEvaluation {
  /** Guardrail flags raised by pattern matching on the utterance */
  flags: GuardrailFlags;
  /** The node the guardrail router would send this call to */
  route: string;
}

/**
 * Runs the deterministic guardrail gate + routing for a single utterance.
 * Pass the (optional) pre-classified intent — defaults to "unknown" so the
 * hard gates (emergency / mental health / insurance / GDPR / excess) are
 * exercised independently of any LLM classification.
 *
 * No LLM call. Safe to run in CI without an API key.
 */
export function evaluateGuardrailRouting(
  callerInput: string,
  intent: AvaIntent = "unknown",
): GuardrailEvaluation {
  // guardrailGate only reads callerInput; it always returns a fully-populated
  // guardrails object, so an empty seed is sufficient here.
  const gated = guardrailGate({ callerInput } as typeof AvaState.State);
  const flags = gated.guardrails as GuardrailFlags;

  const route = routeAfterGuardrails({
    callerInput,
    intent,
    guardrails: flags,
  } as typeof AvaState.State);

  return { flags, route };
}

// ─── No hallucinated availability (output-side backstop) ────────────────────
//
// The guardrail gate protects Ava's INPUT side. This protects the OUTPUT side:
// Ava must never state a specific appointment time as bookable or booked unless
// it was verified against the PMS. assertsAppointmentAvailability() is the
// deterministic detector for fabricated-availability copy so any node message,
// or a future LLM-backed message, can be checked before it reaches the caller.
//
// An assertion = a concrete clock time (e.g. "3pm", "2:30pm", "10 o'clock")
// presented in an appointment offer/confirmation context (booked / slot / free /
// available / offer / pencil you in / we have). Asking the caller about their
// preference ("what day works for you?") names no time and must NOT trip, or Ava
// could never run a booking conversation.

const CLOCK_TIME_RE = /(\b\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?\b)|(\b\d{1,2}\s*o'?clock\b)/i;
const APPOINTMENT_OFFER_RE = /\b(book(?:ed|ing)?|slot|free|available|offer(?:ed|ing)?|pencil(?:ed|led)?|got\s*(?:you|a)|come\s*in|see\s*you|we\s*have)\b/i;

/**
 * Returns true when a message asserts a specific appointment slot as
 * bookable/booked — a concrete clock time in an offer/confirmation context.
 * Pure, LLM-free; safe to run in CI and inline before any response is sent.
 */
export function assertsAppointmentAvailability(message: string): boolean {
  if (!message) return false;
  return CLOCK_TIME_RE.test(message) && APPOINTMENT_OFFER_RE.test(message);
}

/**
 * Output-boundary backstop. The graph has no PMS slot verification yet, so any
 * stated time is unverified by definition. If a response asserts availability,
 * replace it with a safe, no-time holding response that hands the caller to a
 * confirmed follow-up; the original message is preserved in metadata for
 * observability. Safe responses pass through unchanged. Idempotent — the
 * replacement message itself never asserts availability.
 */
export function guardResponseAvailability(response: AvaResponse): AvaResponse {
  if (!assertsAppointmentAvailability(response.message)) return response;
  return {
    action: "callback_request",
    message:
      "I'd rather not give you a time I can't confirm. Let me have the team check the diary and lock it in properly. Can I take your name and number so we can confirm your slot?",
    metadata: {
      ...(response.metadata ?? {}),
      availabilityGuardTriggered: true,
      suppressedMessage: response.message,
      callbackType: (response.metadata?.callbackType as string) ?? "booking_confirmation",
      reason: "unverified_availability",
    },
  };
}

// ─── Build Graph ────────────────────────────────────────────────────────────

export function buildAvaGraph() {
  // Live routing spine (reconciled 2026-06-26):
  //   START -> red_flag_detector
  //     red flag      -> human_handoff (immediate human transfer)
  //     otherwise     -> guardrail_gate (deterministic hard-stop pre-filter)
  //   guardrail_gate
  //     safety flag   -> matching action node (emergency / mental_health /
  //                      insurance_gate / excess_* / clinical_boundary / gdpr_block)
  //     otherwise     -> intent_router (LLM 5-class) -> structured_intake | human_handoff | END
  //
  // The guardrail gate now runs INSIDE the compiled graph (previously it was
  // added but had no inbound edge, so it + every action node were unreachable
  // and graph.compile() threw UNREACHABLE_NODE). The deterministic safety gates
  // run BEFORE the LLM classifier, so a 999/crisis/GDPR/insurance call can never
  // depend on the model. The legacy 16-class router is dropped (intent_router
  // supersedes it; this also removes a redundant LLM call per request).
  const graph = new StateGraph(AvaState)
    .addNode("red_flag_detector", redFlagDetectorNode)
    .addNode("guardrail_gate", guardrailGate)
    .addNode("intent_router", intentRouterNode)
    .addNode("structured_intake", structuredIntakeNode)
    .addNode("human_handoff", humanHandoffNode)
    // Hard-stop safety action nodes (reachable via guardrail_gate)
    .addNode("emergency", emergencyNode)
    .addNode("mental_health", mentalHealthNode)
    .addNode("insurance_gate", insuranceGateNode)
    .addNode("excess_faq", excessFaqNode)
    .addNode("excess_payment", excessPaymentNode)
    .addNode("clinical_boundary", clinicalBoundaryNode)
    .addNode("gdpr_block", gdprBlockNode)

    .addEdge(START, "red_flag_detector")
    .addConditionalEdges("red_flag_detector", routeAfterRedFlag, [
      "human_handoff",
      "guardrail_gate",
    ])
    .addConditionalEdges("guardrail_gate", routeAfterGuardrailGate, [
      "emergency",
      "mental_health",
      "insurance_gate",
      "excess_faq",
      "excess_payment",
      "clinical_boundary",
      "gdpr_block",
      "intent_router",
    ])
    .addConditionalEdges("intent_router", routeAfterIntentRouter, [
      "structured_intake",
      "human_handoff",
      END,
    ])
    .addEdge("structured_intake", END)
    .addEdge("human_handoff", END)
    .addEdge("emergency", END)
    .addEdge("mental_health", END)
    .addEdge("insurance_gate", END)
    .addEdge("excess_faq", END)
    .addEdge("excess_payment", END)
    .addEdge("clinical_boundary", END)
    .addEdge("gdpr_block", END);

  return graph.compile();
}

// ─── Convenience: process a single caller input ─────────────────────────────

export async function processCallerInput(
  input: string,
  callMeta: CallMeta,
): Promise<AvaResponse> {
  const graph = buildAvaGraph();

  const result = await graph.invoke({
    callerInput: input,
    callMeta,
  });

  // Output-boundary backstop: never let a response assert an unverified slot.
  return guardResponseAvailability(result.response);
}
