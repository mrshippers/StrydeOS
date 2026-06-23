/**
 * OFFLINE safety-critical suite for the Ava conversation graph.
 *
 * P0-13a root cause: graph.test.ts and graph-nodes.test.ts are excluded
 * wholesale by vitest.config.ts unless RUN_LLM_TESTS=1, AND every safety suite
 * inside them is gated behind `describe.skip` when ANTHROPIC_API_KEY is absent.
 * That is exactly the CI condition — so none of the 999 / crisis / insurance /
 * GDPR safety behaviour was ever tested in CI.
 *
 * This file is NOT excluded by vitest.config (it makes no LLM calls) and uses
 * no `describe.skip`, so it ALWAYS runs in CI. It asserts the deterministic,
 * LLM-free guardrail logic that lives in graph.ts:
 *   - redFlagDetectorNode    (verbatim clinical red-flag term scan)
 *   - guardrailGate          (emergency / mental-health / insurance / excess / GDPR pattern match)
 *   - routeAfterGuardrails   (hard-gate routing)
 * composed via the pure evaluateGuardrailRouting() export.
 *
 * Run: npx vitest run src/lib/ava/__tests__/graph-guardrails.test.ts
 * (also runs as part of the default hermetic `npm test`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// redFlagDetectorNode writes to Firestore + Telegram on a hit — mock both so
// the pure detection logic can be asserted offline with no side effects.
const mockCollection = (): object => ({
  add: vi.fn().mockResolvedValue({ id: "mock-doc" }),
  doc: () => ({
    set: vi.fn().mockResolvedValue(undefined),
    collection: mockCollection,
  }),
});

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({ collection: mockCollection }),
}));

vi.mock("../telegram", () => ({
  sendTelegramAlert: vi.fn().mockResolvedValue(undefined),
}));

import {
  evaluateGuardrailRouting,
  redFlagDetectorNode,
  type AvaIntent,
  type AvaAction,
  type CallMeta,
} from "../graph";

const TEST_META: CallMeta = {
  clinicId: "test-001",
  clinicName: "Test Clinic",
  callerPhone: "+447700900001",
  callId: "call-abc-123",
};

function makeState(callerInput: string, overrides: Record<string, unknown> = {}) {
  return {
    callerInput,
    intent: "unknown" as AvaIntent,
    currentNode: "test",
    patientDetails: {},
    callMeta: TEST_META,
    guardrails: {
      emergencyDetected: false,
      insuranceQuery: false,
      insurerDetected: false,
      excessFaq: false,
      excessPaymentQuery: false,
      clinicalAdviceSought: false,
      gdprBlock: false,
      mentalHealthCrisis: false,
      abusiveCaller: false,
    },
    response: { action: "continue" as AvaAction, message: "" },
    messages: [],
    redFlag: false,
    flagsFound: [] as string[],
    structuredIntake: null,
    ...overrides,
  };
}

// ─── Emergency triage — guardrailGate pattern match ───────────────────────────

describe("Ava guardrails — Emergency Triage (offline, LOCKED)", () => {
  // Each MUST raise emergencyDetected and route to the emergency node,
  // regardless of any intent classification.
  const cases: Array<[string, string]> = [
    ["cauda equina — saddle numbness + bladder", "I've got numbness in my saddle area and I can't control my bladder since yesterday"],
    ["cardiac — chest pain", "I've got terrible chest pain going down my left arm and I feel short of breath"],
    ["stroke — face drooping + can't lift arm", "My husband's face is drooping on one side and he can't lift his arm"],
    ["thunderclap headache — worst of my life", "I've got the worst headache of my life, it came on suddenly about 20 minutes ago"],
    ["open fracture — bone sticking out", "I fell off my bike and there's a bone sticking out of my arm"],
    ["bilateral leg weakness", "I can't feel both my legs and my back is killing me"],
    ["can't breathe", "I suddenly can't breathe and my chest feels tight"],
    ["stroke keyword", "I think my dad is having a stroke right now"],
  ];

  it.each(cases)("routes %s to emergency", (_desc, input) => {
    const { flags, route } = evaluateGuardrailRouting(input);
    expect(flags.emergencyDetected).toBe(true);
    expect(route).toBe("emergency");
  });

  it("emergency overrides a booking intent (hard gate cannot be bypassed)", () => {
    const { route } = evaluateGuardrailRouting(
      "I want to book in but honestly I've got crushing chest pain right now",
      "booking_new",
    );
    expect(route).toBe("emergency");
  });
});

// ─── Mental health crisis ─────────────────────────────────────────────────────

describe("Ava guardrails — Mental Health Crisis (offline)", () => {
  const cases: Array<[string, string]> = [
    ["suicidal ideation", "I just don't want to live anymore, the pain is too much"],
    ["self-harm", "I've been self-harming because the chronic pain won't stop"],
    ["wants to end it all", "I just want to end it all"],
    ["kill myself", "Sometimes I think I want to kill myself"],
  ];

  it.each(cases)("routes %s to mental_health", (_desc, input) => {
    const { flags, route } = evaluateGuardrailRouting(input);
    expect(flags.mentalHealthCrisis).toBe(true);
    expect(route).toBe("mental_health");
  });
});

// ─── Insurance hard block ─────────────────────────────────────────────────────

describe("Ava guardrails — Insurance Hard Block (offline)", () => {
  const cases: Array<[string, string]> = [
    ["pre-auth", "I need to check if my pre-authorisation has gone through with Bupa"],
    ["coverage", "How much will my insurance pay for physiotherapy?"],
    ["claim code", "I need to know the claim code for my Aviva claim"],
    ["policy number", "Can you look up my policy number and check my allowance?"],
    ["authorisation ref", "What's the authorisation number I need for my session?"],
  ];

  it.each(cases)("routes %s to insurance_gate", (_desc, input) => {
    const { flags, route } = evaluateGuardrailRouting(input);
    expect(flags.insuranceQuery).toBe(true);
    expect(route).toBe("insurance_gate");
  });

  it("insured booking continues (insurer mentioned + booking intent)", () => {
    const { route } = evaluateGuardrailRouting(
      "I'd like to book an initial assessment, I'm insured through Bupa",
      "booking_new",
    );
    expect(route).toBe("insurance_booking");
  });

  it("pure coverage query is still blocked even when an insurer is named", () => {
    const { route } = evaluateGuardrailRouting(
      "What's covered under my Bupa policy for physiotherapy?",
      "insurance_query",
    );
    expect(route).toBe("insurance_gate");
  });
});

// ─── Excess split (Case A FAQ vs Case B owed-to-clinic) ───────────────────────

describe("Ava guardrails — Excess Split (offline)", () => {
  it("outstanding excess owed to clinic routes to excess_payment", () => {
    const { flags, route } = evaluateGuardrailRouting("I need to pay my excess to the clinic");
    expect(flags.excessPaymentQuery).toBe(true);
    expect(route).toBe("excess_payment");
  });

  it("general 'how much is my excess' routes to excess_faq", () => {
    const { flags, route } = evaluateGuardrailRouting("How much is my excess with AXA Health?");
    expect(flags.excessFaq).toBe(true);
    expect(route).toBe("excess_faq");
  });

  it("outstanding excess owed to practice takes priority over FAQ deflection", () => {
    const { route } = evaluateGuardrailRouting(
      "I think I still owe my excess to the practice from a few weeks ago",
    );
    expect(route).toBe("excess_payment");
  });
});

// ─── GDPR block (third-party patient details) ─────────────────────────────────

describe("Ava guardrails — GDPR Block (offline)", () => {
  const cases: Array<[string, string]> = [
    ["wife's appointment", "Can you tell me when my wife's appointment is?"],
    ["another patient", "I want to ask about another patient's details"],
    ["partner's appointment", "When is my partner's appointment booked for?"],
  ];

  it.each(cases)("routes %s to gdpr_block", (_desc, input) => {
    const { flags, route } = evaluateGuardrailRouting(input);
    expect(flags.gdprBlock).toBe(true);
    expect(route).toBe("gdpr_block");
  });
});

// ─── Negative controls — routine calls must NOT trip a hard gate ──────────────

describe("Ava guardrails — Safe inputs do NOT trip hard gates (offline)", () => {
  const safe: Array<[string, string]> = [
    ["plain new booking", "Hi, I'd like to book a first appointment for my lower back"],
    ["plain cancellation", "I need to cancel my appointment on Thursday please"],
    ["parking FAQ", "Is there parking near the clinic?"],
  ];

  it.each(safe)("does not raise a hard gate for %s", (_desc, input) => {
    const { flags } = evaluateGuardrailRouting(input);
    expect(flags.emergencyDetected).toBe(false);
    expect(flags.mentalHealthCrisis).toBe(false);
    expect(flags.gdprBlock).toBe(false);
    expect(flags.insuranceQuery).toBe(false);
  });
});

// ─── Red-flag detector — verbatim clinical term scan (offline, no LLM) ────────

describe("redFlagDetectorNode — clinical red-flag scan (offline)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const flagged: Array<[string, string]> = [
    ["cauda equina", "I think I may have cauda equina syndrome"],
    ["saddle anaesthesia", "I have saddle anaesthesia and can't feel that area"],
    ["bilateral leg weakness", "I'm experiencing bilateral leg weakness"],
    ["loss of bladder", "I've had loss of bladder control since this morning"],
    ["loss of bowel", "There's been loss of bowel function"],
    ["chest pain", "I have chest pain and it started an hour ago"],
    ["crushing chest", "There's a crushing chest sensation"],
    ["radiating to arm", "The pain is radiating to arm and shoulder"],
    ["shortness of breath", "I'm having shortness of breath"],
    ["calf pain and swelling", "My leg has calf pain and swelling, came on suddenly"],
    ["sudden severe headache", "I have a sudden severe headache unlike any before"],
    ["cannot weight bear", "I cannot weight bear on my right leg at all"],
    ["deformity", "There's a visible deformity on my ankle"],
  ];

  it.each(flagged)("flags %s", async (term, input) => {
    const result = await redFlagDetectorNode(makeState(input));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain(term);
  });

  it("is case-insensitive", async () => {
    const result = await redFlagDetectorNode(makeState("I have CHEST PAIN and NIGHT SWEATS"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("chest pain");
    expect(result.flagsFound).toContain("night sweats");
  });

  it("returns redFlag: false for a clean transcript", async () => {
    const result = await redFlagDetectorNode(makeState("I'd like to book an appointment please"));
    expect(result.redFlag).toBe(false);
    expect(result.flagsFound).toEqual([]);
  });
});
