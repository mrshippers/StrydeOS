/**
 * Test suite for insight-event-consumer.ts
 *
 * Covers:
 *   - consumedBy idempotency (skip if 'pulse' already present)
 *   - triggerEventType match precedence over the legacy EVENT_TO_SEQUENCE map
 *   - outcome = 'pending' on enqueue (new lifecycle state)
 *   - templateKey is written to comms_log
 *   - arrayUnion marks event consumed whether or not a sequence matched
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { consumeInsightEvents } from "@/lib/pulse/insight-event-consumer";
import type { InsightEvent } from "@/types/insight-events";
import type { SequenceDefinition } from "@/types/comms";

// Mock firebase-admin's FieldValue.arrayUnion to a sentinel we can detect
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }),
  },
}));

// ─── Mock builders ─────────────────────────────────────────────────────────

function mockEvent(overrides: Partial<InsightEvent> = {}): InsightEvent {
  return {
    id: "evt-1",
    type: "PATIENT_DROPOUT_RISK",
    clinicId: "clinic-1",
    patientId: "pat-1",
    severity: "critical",
    title: "Test",
    description: "Test event",
    suggestedAction: "Nudge",
    actionTarget: "patient",
    createdAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  } as InsightEvent;
}

function mockSeqDef(overrides: Partial<SequenceDefinition> = {}): SequenceDefinition {
  return {
    id: "seq-rebook",
    name: "Re-booking Prompt",
    sequenceType: "rebooking_prompt",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 1, channel: "sms", templateKey: "rebooking_step1" },
    ],
    attributionWindowDays: 7,
    exitConditions: ["appointment_booked"],
    cooldownDays: 7,
    active: true,
    priority: 2,
    ...overrides,
  };
}

interface MockOpts {
  commsConsentGranted?: boolean;
  sequenceDefinitions?: SequenceDefinition[];
  patient?: Record<string, unknown> | null;
  existingUnsubscribe?: boolean;
}

function createMockDb(opts: MockOpts = {}) {
  const {
    commsConsentGranted = true,
    sequenceDefinitions = [mockSeqDef()],
    patient = { contact: { phone: "+447000000001" }, lifecycleState: "AT_RISK" },
    existingUnsubscribe = false,
  } = opts;

  const commsLogAdd = vi.fn().mockImplementation(async (data: unknown) => ({ id: "new-log-1" }));
  const updates: Array<{ path: string; data: unknown }> = [];

  function makeUpdate(path: string) {
    return vi.fn(async (data: unknown) => {
      updates.push({ path, data });
    });
  }

  const unsubSnap = {
    empty: !existingUnsubscribe,
    docs: existingUnsubscribe ? [{ id: "log-unsub" }] : [],
  };

  const dbShape = {
    doc: vi.fn((path: string) => {
      if (path.startsWith("clinics/") && path.split("/").length === 2) {
        // clinic doc
        return {
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({
              commsConsentGrantedAt: commsConsentGranted ? "2026-01-01T00:00:00Z" : null,
            }),
          })),
          update: makeUpdate(path),
        };
      }
      if (path.includes("/patients/")) {
        return {
          get: vi.fn(async () => ({
            exists: patient !== null,
            data: () => patient ?? {},
          })),
          update: makeUpdate(path),
        };
      }
      if (path.includes("/insight_events/")) {
        return {
          update: makeUpdate(path),
        };
      }
      return {
        get: vi.fn(async () => ({ exists: false, data: () => ({}) })),
        update: makeUpdate(path),
      };
    }),
    collection: vi.fn((path: string) => {
      if (path.includes("sequence_definitions")) {
        return {
          get: vi.fn(async () => ({
            docs: sequenceDefinitions.map((d) => ({
              id: d.id,
              data: () => d,
            })),
          })),
        };
      }
      if (path.includes("comms_log")) {
        return {
          add: commsLogAdd,
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: vi.fn(async () => unsubSnap),
        };
      }
      return {
        get: vi.fn(async () => ({ docs: [], empty: true })),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };
    }),
  };

  return { db: dbShape as unknown as Firestore, commsLogAdd, updates };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("consumeInsightEvents — idempotency", () => {
  it("should skip events already consumed by pulse", async () => {
    const { db, commsLogAdd, updates } = createMockDb();
    const event = mockEvent({ consumedBy: ["pulse"] });

    const result = await consumeInsightEvents(db, "clinic-1", [event]);

    expect(result.actioned).toBe(0);
    expect(result.skipped).toBe(1);
    expect(commsLogAdd).not.toHaveBeenCalled();
    // No write to insight_events update because short-circuited
    const eventUpdates = updates.filter((u) => u.path.includes("insight_events"));
    expect(eventUpdates.length).toBe(0);
  });

  it("should mark consumedBy via arrayUnion on successful enqueue", async () => {
    const { db, commsLogAdd, updates } = createMockDb();
    const event = mockEvent();

    const result = await consumeInsightEvents(db, "clinic-1", [event]);

    expect(result.actioned).toBe(1);
    expect(commsLogAdd).toHaveBeenCalledOnce();

    // The insight_event update includes both pulseActionId AND consumedBy
    const eventUpdate = updates.find((u) => u.path.includes("insight_events/evt-1"));
    expect(eventUpdate).toBeDefined();
    const updateData = eventUpdate!.data as Record<string, unknown>;
    expect(updateData).toHaveProperty("pulseActionId", "new-log-1");
    expect(updateData).toHaveProperty("consumedBy");
    expect((updateData.consumedBy as { __arrayUnion: unknown[] }).__arrayUnion).toEqual(["pulse"]);
  });

  it("should still mark consumedBy even when no sequence matches", async () => {
    // No sequence with triggerEventType or matching legacy sequenceType
    const { db, commsLogAdd, updates } = createMockDb({
      sequenceDefinitions: [], // no definitions → no match possible
    });
    const event = mockEvent();

    const result = await consumeInsightEvents(db, "clinic-1", [event]);

    expect(result.actioned).toBe(0);
    expect(result.skipped).toBe(1);
    expect(commsLogAdd).not.toHaveBeenCalled();

    // Event still marked consumed (idempotency guarantee on re-runs)
    const eventUpdate = updates.find((u) => u.path.includes("insight_events/evt-1"));
    expect(eventUpdate).toBeDefined();
    expect(eventUpdate!.data).toHaveProperty("consumedBy");
  });
});

describe("consumeInsightEvents — triggerEventType matching", () => {
  it("should prefer triggerEventType over legacy EVENT_TO_SEQUENCE map", async () => {
    // Two sequences: one matches legacy map, one has explicit triggerEventType
    const legacyMatch = mockSeqDef({
      id: "seq-rebook-legacy",
      sequenceType: "rebooking_prompt", // matches EVENT_TO_SEQUENCE[PATIENT_DROPOUT_RISK]
    });
    const explicitMatch = mockSeqDef({
      id: "seq-early-explicit",
      sequenceType: "early_intervention",
      triggerEventType: "PATIENT_DROPOUT_RISK", // explicit override
      steps: [
        { stepNumber: 1, daysAfterTrigger: 1, channel: "sms", templateKey: "early_intervention_step1_standard" },
      ],
    });

    const { db, commsLogAdd } = createMockDb({
      sequenceDefinitions: [legacyMatch, explicitMatch],
    });

    await consumeInsightEvents(db, "clinic-1", [mockEvent()]);

    expect(commsLogAdd).toHaveBeenCalledOnce();
    const logEntry = commsLogAdd.mock.calls[0][0] as Record<string, unknown>;
    // Should have used the explicit triggerEventType match
    expect(logEntry.sequenceType).toBe("early_intervention");
    expect(logEntry.templateKey).toBe("early_intervention_step1_standard");
  });

  it("should fall back to legacy EVENT_TO_SEQUENCE when no triggerEventType set", async () => {
    const { db, commsLogAdd } = createMockDb({
      sequenceDefinitions: [mockSeqDef()], // no triggerEventType set
    });

    await consumeInsightEvents(db, "clinic-1", [mockEvent()]);

    expect(commsLogAdd).toHaveBeenCalledOnce();
    const logEntry = commsLogAdd.mock.calls[0][0] as Record<string, unknown>;
    // Legacy EVENT_TO_SEQUENCE[PATIENT_DROPOUT_RISK] = 'rebooking_prompt'
    expect(logEntry.sequenceType).toBe("rebooking_prompt");
  });
});

describe("consumeInsightEvents — new lifecycle", () => {
  it("should write outcome='pending' on enqueue (not 'no_action')", async () => {
    const { db, commsLogAdd } = createMockDb();

    await consumeInsightEvents(db, "clinic-1", [mockEvent()]);

    expect(commsLogAdd).toHaveBeenCalledOnce();
    const logEntry = commsLogAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(logEntry.outcome).toBe("pending");
  });

  it("should include templateKey in the comms_log entry", async () => {
    const { db, commsLogAdd } = createMockDb();

    await consumeInsightEvents(db, "clinic-1", [mockEvent()]);

    const logEntry = commsLogAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(logEntry).toHaveProperty("templateKey");
    expect(typeof logEntry.templateKey).toBe("string");
    expect(logEntry.templateKey).toBe("rebooking_step1");
  });

  it("should include Intelligence attribution fields on enqueued messages", async () => {
    const { db, commsLogAdd } = createMockDb();
    const event = mockEvent({ id: "evt-abc", type: "PATIENT_DROPOUT_RISK" });

    await consumeInsightEvents(db, "clinic-1", [event]);

    const logEntry = commsLogAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(logEntry.insightEventId).toBe("evt-abc");
    expect(logEntry.triggeredByIntelligence).toBe(true);
    expect(logEntry.insightEventType).toBe("PATIENT_DROPOUT_RISK");
  });
});
