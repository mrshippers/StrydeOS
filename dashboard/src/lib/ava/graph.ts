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
      clinicalAdviceSought: a.clinicalAdviceSought || b.clinicalAdviceSought,
      gdprBlock: a.gdprBlock || b.gdprBlock,
      mentalHealthCrisis: a.mentalHealthCrisis || b.mentalHealthCrisis,
      abusiveCaller: a.abusiveCaller || b.abusiveCaller,
    }),
    default: () => ({
      emergencyDetected: false,
      insuranceQuery: false,
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
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type AvaIntent =
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
  | "unknown";

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
  clinicianNames?: string[];
  callStartTime?: string;
}

export interface GuardrailFlags {
  emergencyDetected: boolean;
  insuranceQuery: boolean;
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
  | "end_call"         // Politely end the call
  | "waitlist_add";    // Add to priority waitlist

export interface AvaResponse {
  action: AvaAction;
  message: string;
  metadata?: Record<string, unknown>;
}

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
    "booking_new", "booking_returning", "cancellation", "reschedule",
    "insurance_query", "clinical_question", "emergency", "mental_health_crisis",
    "message_relay", "complaint", "gp_referral", "third_party_booking",
    "gdpr_request", "solicitor_sales", "faq", "unknown",
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

  // Insurance keywords — hard gate, no discussion allowed
  const insurancePatterns = [
    /pre.?auth/,
    /authoris?ation\s*(code|number|ref)/,
    /excess\s*(fee|payment|amount)/,
    /how\s*much\s*(will|does|is)\s*(my\s*)?(insurance|insurer|bupa|axa|vitality|aviva)/,
    /coverage?\s*(amount|limit|detail)/,
    /claim\s*(code|number|form)/,
    /policy\s*(number|detail)/,
    /what.s\s*(covered|not\s*covered)/,
  ];

  if (insurancePatterns.some((p) => p.test(lower))) {
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

  return { guardrails: flags };
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
        neverDiscuss: ["coverage amounts", "policy numbers", "claim codes", "authorisation codes", "excess amounts"],
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
      action: "callback_request",
      message: "I'm sorry to hear that. I'll make sure the right person gets back to you today. Can I take your name and number?",
      metadata: { callbackType: "manager", reason: "complaint" },
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
  const clinicEmail = state.callMeta.clinicName
    ? `info@${state.callMeta.clinicName.toLowerCase().replace(/\s+/g, "")}.com`
    : "our email address";

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

// ─── Routing Logic ──────────────────────────────────────────────────────────

function routeAfterGuardrails(
  state: typeof AvaState.State
): string {
  const g = state.guardrails;

  // Hard gates — these ALWAYS override intent classification
  if (g.emergencyDetected) return "emergency";
  if (g.mentalHealthCrisis) return "mental_health";
  if (g.insuranceQuery) return "insurance_gate";
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
