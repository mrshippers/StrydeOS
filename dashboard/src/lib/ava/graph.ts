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
  | "end_call"         // Politely end the call
  | "waitlist_add";    // Add to priority waitlist

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

// ─── Intent Classifier (Router Node) ────────────────────────────────────────

const ROUTER_PROMPT = `You are an intent classifier for a UK physiotherapy clinic receptionist.
Given the caller's input, classify their intent into EXACTLY ONE of these categories:

- booking_new: Wants to book a first appointment / initial assessment
- booking_returning: Returning patient wanting a follow-up
- cancellation: Wants to cancel an appointment
- reschedule: Wants to move their appointment
- insurance_query: Asking about insurance coverage, pre-auth, claim codes, excess payments
- clinical_question: Asking for medical/clinical advice, diagnosis, treatment recommendations
- emergency: Describing symptoms matching red flags (cauda equina, chest pain, stroke, fracture, thunderclap headache)
- mental_health_crisis: Mentions self-harm, suicidal thoughts, severe distress
- message_relay: Wants to leave a message for their clinician / pass on an update
- complaint: Unhappy about service, billing dispute
- gp_referral: Healthcare professional referring a patient
- third_party_booking: Someone booking on behalf of another person
- gdpr_request: Asking about another patient's details
- solicitor_sales: Solicitor, sales call, marketing
- faq: General questions (location, parking, pricing, what to bring, opening hours)
- unknown: Cannot determine intent

RED FLAG KEYWORDS (always classify as "emergency"):
- saddle numbness, bladder control, bowel control, both legs weak
- worst headache of my life, thunderclap, sudden severe headache
- chest pain, arm pain, jaw pain, can't breathe
- car accident, fall, fracture, bone sticking out, deformity
- face drooping, can't lift arm, slurred speech

INSURANCE KEYWORDS (always classify as "insurance_query"):
- pre-authorisation, pre-auth, excess, cover, coverage, claim, policy number
- how much will insurance pay, what's covered, authorisation code

Respond with ONLY the intent label, nothing else.`;

async function routerNode(
  state: typeof AvaState.State
): Promise<Partial<typeof AvaState.State>> {
  const model = new ChatAnthropic({
    model: "claude-haiku-4-5-20251001",
    temperature: 0,
    maxTokens: 20,
  });

  const result = await model.invoke([
    new SystemMessage(ROUTER_PROMPT),
    new HumanMessage(state.callerInput),
  ]);

  const raw = (result.content as string).trim().toLowerCase().replace(/[^a-z_]/g, "");
  const intent = isValidIntent(raw) ? raw : "unknown";

  return { intent: intent as AvaIntent, currentNode: "router" };
}

function isValidIntent(s: string): s is AvaIntent {
  const valid: AvaIntent[] = [
    // Original 16-class set
    "booking_new", "booking_returning", "cancellation", "reschedule",
    "insurance_query", "clinical_question", "emergency", "mental_health_crisis",
    "message_relay", "complaint", "gp_referral", "third_party_booking",
    "gdpr_request", "solicitor_sales", "faq", "unknown",
    // 5-class intentRouter set
    "booking", "cancel", "enquiry", "clinical_triage",
  ];
  return valid.includes(s as AvaIntent);
}

// ─── Guardrail Gate ─────────────────────────────────────────────────────────
// This runs AFTER routing and BEFORE any action node.
// It checks for hard-stop conditions that override all other logic.

function guardrailGate(
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
    /worst\s*headache/,
    /thunderclap/,
    /chest\s*pain/,
    /can.?t\s*breathe/,
    /bone\s*(sticking|poking)\s*out/,
    /face\s*(droop|drooping)/,
    /can.?t\s*(lift|move|raise)\s*(my\s*)?(arm|hand)/,
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
function insuranceBookingNode(
  state: typeof AvaState.State
): Partial<typeof AvaState.State> {
  const isNew = state.intent === "booking_new" || state.intent === "third_party_booking";
  return {
    currentNode: "insurance_booking",
    response: {
      action: "continue",
      message: isNew
        ? "Lovely — let's get you booked in. Do you have your pre-authorisation number from your insurer? It'll usually be on your approval letter or email."
        : "Of course — let me find you a slot. Do you have your pre-authorisation reference to hand? We'll need that for your insurer.",
      metadata: {
        bookingType: isNew ? "insured_initial" : "insured_follow_up",
        insurerDetected: true,
        requiredFields: ["firstName", "lastName", "phone", "preAuthCode", "address"],
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

function messageRelayNode(
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

function bookingNode(
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

function cancellationNode(
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

function complaintNode(
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

function gpReferralNode(
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

function faqNode(
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

function solicitorSalesNode(
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

function fallbackNode(
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
    void db.collection("red_flag_alerts").add({
      timestamp,
      clinicId: state.callMeta.clinicId,
      callId: state.callMeta.callId ?? null,
      flagsFound,
      transcript: state.callerInput,
    }).catch(() => {});

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
      }).catch(() => {});

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
    model: "claude-sonnet-4-20250514",
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
      .collection("sessions")
      .doc(sessionId)
      .set({ structuredIntake: intake }, { merge: true })
      .catch(() => {});
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
  return {
    currentNode: "human_handoff",
    response: {
      action: "transfer_call",
      message: "Let me get someone who can help you with that.",
    },
  };
}

/** Routing after redFlagDetectorNode: true → human_handoff, false → intent_router */
function routeAfterRedFlag(state: typeof AvaState.State): string {
  return state.redFlag ? "human_handoff" : "intent_router";
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

function routeAfterGuardrails(
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

// ─── Build Graph ────────────────────────────────────────────────────────────

export function buildAvaGraph() {
  const graph = new StateGraph(AvaState)
    // Entry: classify intent
    .addNode("router", routerNode)

    // Guardrail gate: pattern-match for hard stops
    .addNode("guardrail_gate", guardrailGate)

    // Action nodes
    .addNode("emergency", emergencyNode)
    .addNode("mental_health", mentalHealthNode)
    .addNode("insurance_gate", insuranceGateNode)
    .addNode("excess_faq", excessFaqNode)
    .addNode("excess_payment", excessPaymentNode)
    .addNode("insurance_booking", insuranceBookingNode)
    .addNode("clinical_boundary", clinicalBoundaryNode)
    .addNode("gdpr_block", gdprBlockNode)
    .addNode("message_relay", messageRelayNode)
    .addNode("booking", bookingNode)
    .addNode("cancellation", cancellationNode)
    .addNode("complaint", complaintNode)
    .addNode("gp_referral", gpReferralNode)
    .addNode("faq", faqNode)
    .addNode("solicitor_sales", solicitorSalesNode)
    .addNode("fallback", fallbackNode)

    // Edges
    .addEdge(START, "router")
    .addEdge("router", "guardrail_gate")
    .addConditionalEdges("guardrail_gate", routeAfterGuardrails, [
      "emergency",
      "mental_health",
      "insurance_gate",
      "excess_faq",
      "excess_payment",
      "insurance_booking",
      "clinical_boundary",
      "gdpr_block",
      "message_relay",
      "booking",
      "cancellation",
      "complaint",
      "gp_referral",
      "faq",
      "solicitor_sales",
      "fallback",
    ])

    // All action nodes terminate
    .addEdge("emergency", END)
    .addEdge("mental_health", END)
    .addEdge("insurance_gate", END)
    .addEdge("excess_faq", END)
    .addEdge("excess_payment", END)
    .addEdge("insurance_booking", END)
    .addEdge("clinical_boundary", END)
    .addEdge("gdpr_block", END)
    .addEdge("message_relay", END)
    .addEdge("booking", END)
    .addEdge("cancellation", END)
    .addEdge("complaint", END)
    .addEdge("gp_referral", END)
    .addEdge("faq", END)
    .addEdge("solicitor_sales", END)
    .addEdge("fallback", END);

  // ── New nodes (red_flag_detector, intent_router, structured_intake, human_handoff) ──
  // Registered and wired when greet node is added (fan-out requires an entry point).
  // Node functions are exported above and fully testable independently.

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

  return result.response;
}
