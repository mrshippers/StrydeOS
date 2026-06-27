/**
 * COMPILED-GRAPH reachability suite for Ava (offline).
 *
 * The offline guardrail suite (graph-guardrails.test.ts) tests the pure decision
 * functions (evaluateGuardrailRouting) directly and never compiles the graph.
 * That gap let a CRITICAL defect pass CI: guardrail_gate + the action nodes were
 * wired with outbound edges but NO inbound edge, so buildAvaGraph() threw
 * UNREACHABLE_NODE at compile and processCallerInput() threw on every call (the
 * post-call webhook swallowed it and keyword-matched instead).
 *
 * This suite invokes the REAL compiled graph via processCallerInput(), with the
 * two LLM nodes stubbed to the benign "enquiry" class. Because the deterministic
 * safety gates (guardrail_gate) run BEFORE the LLM classifier, every escalation
 * asserted here is proven to come from the deterministic gate, not the model.
 *
 * Run: npx vitest run src/lib/ava/__tests__/graph-reachability.test.ts
 */

import { describe, it, expect, vi } from "vitest";

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

// LLM stub: every classifier call resolves to the BENIGN "enquiry" class, which
// routes to END with no escalation — so any escalation asserted below must come
// from the deterministic guardrail gate, not the model.
vi.mock("@langchain/anthropic", () => ({
  // Class form so `new ChatAnthropic()` is constructable. invoke() always
  // resolves to the benign "enquiry" class.
  ChatAnthropic: class {
    invoke = vi.fn().mockResolvedValue({ content: "enquiry" });
  },
}));

import { processCallerInput, type CallMeta } from "../graph";

const META: CallMeta = {
  clinicId: "clinic-spires",
  clinicName: "Spires Physiotherapy",
  callerPhone: "+447700900000",
};

describe("Ava compiled graph — deterministic safety gates are reachable (offline)", () => {
  it("escalates an explicit suicidal caller to 999/Samaritans", async () => {
    const res = await processCallerInput("I want to kill myself", META);
    expect(res.action).toBe("escalate_999");
  });

  it("escalates passive suicidal ideation to 999/Samaritans", async () => {
    const res = await processCallerInput("I don't want to live anymore", META);
    expect(res.action).toBe("escalate_999");
  });

  it("escalates a stroke-type emergency (not a clinical red-flag term) to 999", async () => {
    const res = await processCallerInput("my face is drooping on one side", META);
    expect(res.action).toBe("escalate_999");
  });

  it("deflects a clinical-advice question to the clinical boundary", async () => {
    const res = await processCallerInput("should I take ibuprofen for my back?", META);
    expect(res.action).toBe("callback_request");
    expect(res.message).toMatch(/physio|assess|wouldn't want to give/i);
  });

  it("routes an insurance query to the back-office callback gate", async () => {
    const res = await processCallerInput("what is my pre-authorisation code?", META);
    expect(res.action).toBe("callback_request");
  });

  it("blocks a third-party data request (GDPR)", async () => {
    const res = await processCallerInput("can you tell me about my wife's appointment?", META);
    expect(res.message).toMatch(/data protection|another patient/i);
  });
});

describe("Ava compiled graph — clinical red-flag escalation (offline, LOCK)", () => {
  it("transfers a clinical red-flag caller to a human", async () => {
    const res = await processCallerInput("I've got chest pain radiating to arm", META);
    expect(res.action).toBe("transfer_call");
  });

  it("marks a red-flag handoff for escalation and gives explicit emergency safety-netting (not generic 'someone who can help')", async () => {
    const res = await processCallerInput("I've got chest pain radiating to arm", META);
    // The webhook keys the critical AVA_CALL_ESCALATED insight + escalation SMS
    // off this marker — a red flag must NOT be logged as a routine transfer.
    expect((res.metadata as Record<string, unknown>)?.escalate).toBe(true);
    expect(Array.isArray((res.metadata as Record<string, unknown>)?.flagsFound)).toBe(true);
    // Safety-netting copy: conservative (the red-flag list spans 999 and
    // urgent-GP cases) but must point at emergency care, not stay generic.
    expect(res.message).toMatch(/999|A&E|emergency/i);
    expect(res.message).not.toBe("Let me get someone who can help you with that.");
  });
});

describe("Ava compiled graph — benign path still terminates cleanly (offline)", () => {
  it("a non-hard-stop enquiry runs through to the intent path without throwing", async () => {
    const res = await processCallerInput("what are your opening hours?", META);
    // LLM stub => "enquiry" => routeAfterIntentRouter => END => default response.
    expect(res.action).toBe("continue");
  });
});
