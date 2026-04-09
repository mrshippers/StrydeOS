/**
 * TDD tests for the three new Ava LangGraph nodes:
 *   1. redFlagDetectorNode  — pure pattern match, no LLM
 *   2. intentRouterNode     — LLM (claude-sonnet-4-20250514), 5-class
 *   3. structuredIntakeNode — LLM with Zod-validated JSON output
 *   4. humanHandoffNode     — pure, no LLM
 *
 * Unit tests (RED: 1, 4) run without ANTHROPIC_API_KEY.
 * Integration tests (2, 3) are skipped when key is absent.
 *
 * Run: npx vitest run src/lib/ava/__tests__/graph-nodes.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks must be declared before any imports ────────────────────────────────

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

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  redFlagDetectorNode,
  intentRouterNode,
  structuredIntakeNode,
  humanHandoffNode,
  type AvaIntent,
  type AvaAction,
  type CallMeta,
  type StructuredIntake,
} from "../graph";
import { sendTelegramAlert } from "../telegram";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const HAS_API_KEY = !!process.env.ANTHROPIC_API_KEY;
const describeIntegration = HAS_API_KEY ? describe : describe.skip;

// ── 1. redFlagDetectorNode ────────────────────────────────────────────────────

describe("redFlagDetectorNode — keyword detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns redFlag: false and empty flagsFound for clean transcript", async () => {
    const result = await redFlagDetectorNode(makeState("I'd like to book an appointment please"));
    expect(result.redFlag).toBe(false);
    expect(result.flagsFound).toEqual([]);
  });

  it("detects 'cauda equina'", async () => {
    const result = await redFlagDetectorNode(makeState("I think I may have cauda equina syndrome"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("cauda equina");
  });

  it("detects 'saddle anaesthesia'", async () => {
    const result = await redFlagDetectorNode(makeState("I have saddle anaesthesia and can't feel that area"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("saddle anaesthesia");
  });

  it("detects 'bilateral leg weakness'", async () => {
    const result = await redFlagDetectorNode(makeState("I'm experiencing bilateral leg weakness"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("bilateral leg weakness");
  });

  it("detects 'loss of bladder'", async () => {
    const result = await redFlagDetectorNode(makeState("I've had loss of bladder control since this morning"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("loss of bladder");
  });

  it("detects 'loss of bowel'", async () => {
    const result = await redFlagDetectorNode(makeState("There's been loss of bowel function"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("loss of bowel");
  });

  it("detects 'chest pain'", async () => {
    const result = await redFlagDetectorNode(makeState("I have chest pain and it started an hour ago"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("chest pain");
  });

  it("detects 'crushing chest'", async () => {
    const result = await redFlagDetectorNode(makeState("There's a crushing chest sensation"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("crushing chest");
  });

  it("detects 'radiating to arm'", async () => {
    const result = await redFlagDetectorNode(makeState("The pain is radiating to arm and shoulder"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("radiating to arm");
  });

  it("detects 'shortness of breath'", async () => {
    const result = await redFlagDetectorNode(makeState("I'm having shortness of breath"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("shortness of breath");
  });

  it("detects 'calf pain and swelling'", async () => {
    const result = await redFlagDetectorNode(makeState("My leg has calf pain and swelling, came on suddenly"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("calf pain and swelling");
  });

  it("detects 'sudden severe headache'", async () => {
    const result = await redFlagDetectorNode(makeState("I have a sudden severe headache unlike any I've had before"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("sudden severe headache");
  });

  it("detects 'unexplained weight loss'", async () => {
    const result = await redFlagDetectorNode(makeState("I've had unexplained weight loss alongside the pain"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("unexplained weight loss");
  });

  it("detects 'night sweats'", async () => {
    const result = await redFlagDetectorNode(makeState("I'm waking up with night sweats every night"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("night sweats");
  });

  it("detects 'constant night pain'", async () => {
    const result = await redFlagDetectorNode(makeState("I have constant night pain that wakes me up"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("constant night pain");
  });

  it("detects 'cannot weight bear'", async () => {
    const result = await redFlagDetectorNode(makeState("I cannot weight bear on my right leg at all"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("cannot weight bear");
  });

  it("detects 'deformity'", async () => {
    const result = await redFlagDetectorNode(makeState("There's a visible deformity on my ankle"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("deformity");
  });

  it("is case-insensitive", async () => {
    const result = await redFlagDetectorNode(makeState("I have CHEST PAIN and NIGHT SWEATS"));
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("chest pain");
    expect(result.flagsFound).toContain("night sweats");
  });

  it("returns all flags found when multiple red flags present", async () => {
    const result = await redFlagDetectorNode(
      makeState("I have cauda equina symptoms and chest pain")
    );
    expect(result.redFlag).toBe(true);
    expect(result.flagsFound).toContain("cauda equina");
    expect(result.flagsFound).toContain("chest pain");
    expect(result.flagsFound).toHaveLength(2);
  });

  it("fires Telegram alert when red flag detected", async () => {
    await redFlagDetectorNode(makeState("I have cauda equina symptoms"));
    expect(sendTelegramAlert).toHaveBeenCalledWith(
      expect.objectContaining({ context: "ava_red_flag" })
    );
  });

  it("does NOT fire Telegram alert when no red flag", async () => {
    await redFlagDetectorNode(makeState("I'd like to book a physio appointment"));
    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });
});

// ── 2. intentRouterNode ───────────────────────────────────────────────────────

describeIntegration("intentRouterNode — 5-class LLM classification", () => {
  it("classifies booking intent", async () => {
    const result = await intentRouterNode(makeState("I'd like to book an appointment please"));
    expect(result.intent).toBe("booking");
  });

  it("classifies cancel intent", async () => {
    const result = await intentRouterNode(makeState("I need to cancel my appointment on Thursday"));
    expect(result.intent).toBe("cancel");
  });

  it("classifies enquiry intent", async () => {
    const result = await intentRouterNode(makeState("What are your opening hours?"));
    expect(result.intent).toBe("enquiry");
  });

  it("classifies clinical_triage intent for symptom descriptions", async () => {
    const result = await intentRouterNode(makeState("I've had bad back pain for two weeks, what could it be?"));
    expect(result.intent).toBe("clinical_triage");
  });

  it("defaults to unknown for unrecognisable input", async () => {
    const result = await intentRouterNode(makeState("xjkqzwmpl"));
    expect(result.intent).toBe("unknown");
  });

  it("only returns one of the 5 valid classes", async () => {
    const valid = ["booking", "cancel", "enquiry", "clinical_triage", "unknown"];
    const result = await intentRouterNode(makeState("I need some help"));
    expect(valid).toContain(result.intent);
  });
});

// ── 3. structuredIntakeNode ───────────────────────────────────────────────────

describeIntegration("structuredIntakeNode — Zod-validated structured output", () => {
  it("extracts body_region, onset_days, mechanism, appointment_type", async () => {
    const result = await structuredIntakeNode(
      makeState("I hurt my shoulder 3 days ago — I fell off my bike", {
        intent: "booking" as AvaIntent,
      })
    );
    const intake = result.structuredIntake as StructuredIntake;
    expect(intake).not.toBeNull();
    expect(typeof intake.body_region).toBe("string");
    expect(intake.body_region.toLowerCase()).toContain("shoulder");
    expect(intake.onset_days).toBe(3);
    expect(typeof intake.mechanism).toBe("string");
    expect(typeof intake.appointment_type).toBe("string");
  });

  it("allows onset_days to be null when onset is unclear", async () => {
    const result = await structuredIntakeNode(
      makeState("I've had knee pain for a while, not sure how long", {
        intent: "booking" as AvaIntent,
      })
    );
    const intake = result.structuredIntake as StructuredIntake;
    expect(intake).not.toBeNull();
    // onset_days should be null or a number
    expect(
      intake.onset_days === null || typeof intake.onset_days === "number"
    ).toBe(true);
  });

  it("allows mechanism to be null when no clear mechanism", async () => {
    const result = await structuredIntakeNode(
      makeState("My lower back has just been hurting, no injury", {
        intent: "booking" as AvaIntent,
      })
    );
    const intake = result.structuredIntake as StructuredIntake;
    expect(intake).not.toBeNull();
    expect(
      intake.mechanism === null || typeof intake.mechanism === "string"
    ).toBe(true);
  });

  it("populates appointment_type for new booking", async () => {
    const result = await structuredIntakeNode(
      makeState("First time coming in — I have ankle pain from running", {
        intent: "booking" as AvaIntent,
      })
    );
    const intake = result.structuredIntake as StructuredIntake;
    expect(typeof intake.appointment_type).toBe("string");
    expect(intake.appointment_type.length).toBeGreaterThan(0);
  });
});

// ── 4. humanHandoffNode ───────────────────────────────────────────────────────

describe("humanHandoffNode — human escalation", () => {
  it("returns transfer_call action", () => {
    const result = humanHandoffNode(makeState("anything"));
    expect(result.response?.action).toBe("transfer_call");
  });

  it("returns the handoff message", () => {
    const result = humanHandoffNode(makeState("anything"));
    expect(result.response?.message).toContain("someone");
  });

  it("sets currentNode to human_handoff", () => {
    const result = humanHandoffNode(makeState("anything"));
    expect(result.currentNode).toBe("human_handoff");
  });
});
