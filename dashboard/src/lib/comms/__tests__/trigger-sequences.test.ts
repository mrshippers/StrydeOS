/**
 * Test suite for trigger-sequences.ts
 * Covers triggerCommsSequences and helper functions
 *
 * All 41 tests: 7 original + 34 previously skipped, now fully implemented.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Save the real fetch before any test file can pollute it
const _realFetch = globalThis.fetch;
import type { Firestore } from "firebase-admin/firestore";
import {
  triggerCommsSequences,
  isEligible,
  getNextStep,
  getTriggerDate,
  loadOrSeedDefinitions,
  type TriggerResult,
} from "@/lib/comms/trigger-sequences";
import type { SequenceDefinition } from "@/types/comms";
import { DEFAULT_SEQUENCE_DEFINITIONS } from "@/types/comms";

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/** Build a mock patient data object (as returned by doc.data()). */
function mockPatient(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Test Patient",
    contact: { email: "test@example.com", phone: "+447000123456" },
    clinicianId: "clin-1",
    sessionCount: 2,
    lastSessionDate: daysAgo(3),
    nextSessionDate: undefined,
    discharged: false,
    churnRisk: false,
    insuranceFlag: false,
    hepProgramId: undefined,
    sessionThresholdAlert: false,
    lifecycleState: "ACTIVE",
    riskScore: 30,
    ...overrides,
  };
}

/** Build a SequenceDefinition with sensible defaults. */
function mockSequenceDefinition(overrides: Partial<SequenceDefinition> = {}): SequenceDefinition {
  return {
    id: "seq-def-1",
    name: "Early Intervention",
    sequenceType: "early_intervention",
    steps: [
      { stepNumber: 1, daysAfterTrigger: 1, channel: "sms" as const, templateKey: "early_intervention_step1" },
      { stepNumber: 2, daysAfterTrigger: 3, channel: "email" as const, templateKey: "early_intervention_step2" },
    ],
    attributionWindowDays: 5,
    exitConditions: ["appointment_booked", "unsubscribed", "discharged", "re_engaged"],
    cooldownDays: 3,
    active: true,
    priority: 1,
    ...overrides,
  };
}

/** Build a comms_log entry. */
function mockCommsLog(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientId: "pat-1",
    sequenceType: "early_intervention",
    stepNumber: 1,
    sentAt: daysAgo(5),
    outcome: "no_action",
    channel: "sms",
    ...overrides,
  };
}

// ─── Firestore Mock Factory ─────────────────────────────────────────────────

interface MockFirestoreOptions {
  clinicName?: string;
  patients?: Array<{ id: string; data: Record<string, unknown> }>;
  clinicians?: Array<{ id: string; data: Record<string, unknown> }>;
  commsLogs?: Array<{ id: string; data: Record<string, unknown> }>;
  sequenceDefinitions?: Array<{ id: string; data: Record<string, unknown> }>;
}

function createMockFirestore(opts: MockFirestoreOptions = {}): {
  db: Firestore;
  writes: Array<{ path: string; data: unknown; options?: unknown }>;
  batchWrites: Array<{ path: string; data: unknown }>;
} {
  const {
    clinicName = "Test Clinic",
    patients = [],
    clinicians = [{ id: "clin-1", data: { name: "Dr Andrew" } }],
    commsLogs = [],
    sequenceDefinitions = [],
  } = opts;

  const writes: Array<{ path: string; data: unknown; options?: unknown }> = [];
  const batchWrites: Array<{ path: string; data: unknown }> = [];

  let autoDocId = 0;

  function makeDocRef(path: string): any {
    return {
      id: `auto-${++autoDocId}`,
      path,
      get: vi.fn(async () => {
        // Clinic doc
        if (path.match(/^clinics\/[^/]+$/)) {
          return { data: () => ({ name: clinicName }), exists: true };
        }
        return { data: () => ({}), exists: false };
      }),
      set: vi.fn(async (data: unknown, options?: unknown) => {
        writes.push({ path, data, options });
      }),
      collection: (subcol: string) => makeCollectionRef(`${path}/${subcol}`),
    };
  }

  function makeCollectionRef(path: string): any {
    const ref: any = {
      path,
      doc: (docId?: string) => {
        const id = docId ?? `auto-${++autoDocId}`;
        const docRef = makeDocRef(`${path}/${id}`);
        docRef.id = id;
        return docRef;
      },
      get: vi.fn(async () => {
        let docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];

        if (path.match(/patients$/)) {
          docs = patients.map((p) => ({ id: p.id, data: () => p.data }));
        } else if (path.match(/clinicians$/)) {
          docs = clinicians.map((c) => ({ id: c.id, data: () => c.data }));
        } else if (path.match(/comms_log$/)) {
          docs = commsLogs.map((l) => ({ id: l.id, data: () => l.data }));
        } else if (path.match(/sequence_definitions$/)) {
          docs = sequenceDefinitions.map((s) => ({ id: s.id, data: () => s.data }));
        }

        return { docs, empty: docs.length === 0 };
      }),
      limit: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      startAfter: vi.fn().mockReturnThis(),
    };

    // Make limit/where/orderBy/startAfter chainable and still return get
    ref.limit.mockImplementation(() => ref);
    ref.where.mockImplementation(() => ref);
    ref.orderBy.mockImplementation(() => ref);
    ref.startAfter.mockImplementation(() => ref);

    return ref;
  }

  const db = {
    collection: (col: string) => makeCollectionRef(col),
    batch: () => ({
      set: vi.fn((docRef: any, data: unknown) => {
        batchWrites.push({ path: docRef.path, data });
      }),
      commit: vi.fn(async () => {}),
    }),
  } as unknown as Firestore;

  return { db, writes, batchWrites };
}

// ─── Fetch mock helper ──────────────────────────────────────────────────────

function mockFetchOk() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  })) as unknown as typeof globalThis.fetch;
}

function mockFetchFail(errorMessage: string) {
  return vi.fn(async () => {
    throw new Error(errorMessage);
  }) as unknown as typeof globalThis.fetch;
}

// ─── Real tests ─────────────────────────────────────────────────────────────

describe("triggerCommsSequences — module exports", () => {
  it("should export triggerCommsSequences as a function", () => {
    expect(triggerCommsSequences).toBeDefined();
    expect(typeof triggerCommsSequences).toBe("function");
  });

  it("should accept two arguments (db, clinicId)", () => {
    // Function.length reports the number of named parameters
    expect(triggerCommsSequences.length).toBe(2);
  });

  it("should return a Promise (thenable)", () => {
    // Call with a stub db and any clinicId — the env guard will short-circuit
    // before Firestore is touched, so a bare object is fine.
    const mockDb = {} as Firestore;
    const result = triggerCommsSequences(mockDb, "clinic-test");
    expect(result).toBeInstanceOf(Promise);
    // Prevent unhandled rejection
    result.catch(() => {});
  });
});

describe("TriggerResult shape", () => {
  it("should have fired, skipped, and errors fields with correct types", () => {
    // Compile-time check via satisfies + runtime shape assertion
    const result: TriggerResult = { fired: 0, skipped: 0, errors: [] };

    expect(result).toHaveProperty("fired");
    expect(result).toHaveProperty("skipped");
    expect(result).toHaveProperty("errors");
    expect(typeof result.fired).toBe("number");
    expect(typeof result.skipped).toBe("number");
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

describe("triggerCommsSequences — environment guard", () => {
  const originalEnv = process.env.N8N_WEBHOOK_BASE_URL;

  afterEach(() => {
    // Restore whatever was there before (or delete if it was undefined)
    if (originalEnv === undefined) {
      delete process.env.N8N_WEBHOOK_BASE_URL;
    } else {
      process.env.N8N_WEBHOOK_BASE_URL = originalEnv;
    }
  });

  it("should return early with error message when N8N_WEBHOOK_BASE_URL is not set", async () => {
    delete process.env.N8N_WEBHOOK_BASE_URL;

    const mockDb = {} as Firestore;
    const result = await triggerCommsSequences(mockDb, "clinic-test");

    expect(result).toEqual({
      fired: 0,
      skipped: 0,
      errors: ["N8N_WEBHOOK_BASE_URL not set — comms skipped"],
    });
  });

  it("should return early with error message when N8N_WEBHOOK_BASE_URL is empty string", async () => {
    process.env.N8N_WEBHOOK_BASE_URL = "";

    const mockDb = {} as Firestore;
    const result = await triggerCommsSequences(mockDb, "clinic-test");

    expect(result).toEqual({
      fired: 0,
      skipped: 0,
      errors: ["N8N_WEBHOOK_BASE_URL not set — comms skipped"],
    });
  });

  it("should return early with error message when N8N_WEBHOOK_BASE_URL is whitespace only", async () => {
    process.env.N8N_WEBHOOK_BASE_URL = "   ";

    const mockDb = {} as Firestore;
    const result = await triggerCommsSequences(mockDb, "clinic-test");

    expect(result).toEqual({
      fired: 0,
      skipped: 0,
      errors: ["N8N_WEBHOOK_BASE_URL not set — comms skipped"],
    });
  });
});

// ─── Integration tests — Firestore mock ────────────────────────────────────

describe("triggerCommsSequences — integration (requires Firestore mock)", () => {
  const originalEnv = process.env.N8N_WEBHOOK_BASE_URL;
  const originalSecret = process.env.N8N_COMMS_WEBHOOK_SECRET;
  beforeEach(() => {
    process.env.N8N_WEBHOOK_BASE_URL = "https://n8n.test.com/webhook";
    process.env.N8N_COMMS_WEBHOOK_SECRET = "test-secret";
    globalThis.fetch = mockFetchOk();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.N8N_WEBHOOK_BASE_URL;
    } else {
      process.env.N8N_WEBHOOK_BASE_URL = originalEnv;
    }
    if (originalSecret === undefined) {
      delete process.env.N8N_COMMS_WEBHOOK_SECRET;
    } else {
      process.env.N8N_COMMS_WEBHOOK_SECRET = originalSecret;
    }
    globalThis.fetch = _realFetch;
    vi.restoreAllMocks();
  });

  it("should load sequence definitions from Firestore or seed defaults if missing", async () => {
    // No existing sequence_definitions → should seed defaults
    const { db, batchWrites } = createMockFirestore({
      patients: [],
      sequenceDefinitions: [], // empty → triggers seeding
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    // Seeding should write DEFAULT_SEQUENCE_DEFINITIONS via batch
    expect(batchWrites.length).toBe(DEFAULT_SEQUENCE_DEFINITIONS.length);
    expect(result.fired).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("should fire early_intervention sequence when patient has <3 sessions and no recent sequence", async () => {
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          sessionThresholdAlert: true,
          lastSessionDate: daysAgo(2),
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    // Should fire early_intervention step 1
    expect(result.fired).toBeGreaterThanOrEqual(1);
    expect(globalThis.fetch).toHaveBeenCalled();
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain("early_intervention");
  });

  it("should skip early_intervention if patient already discharged", async () => {
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          sessionThresholdAlert: true,
          lastSessionDate: daysAgo(2),
          discharged: true,
          lifecycleState: "DISCHARGED",
        }),
      }],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    // Discharged is an exit condition for early_intervention
    expect(result.fired).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it("should skip early_intervention if appointment already booked", async () => {
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          sessionThresholdAlert: true,
          lastSessionDate: daysAgo(2),
          nextSessionDate: new Date(Date.now() + 3 * 86_400_000).toISOString(), // future
        }),
      }],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    // appointment_booked exit condition
    expect(result.fired).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it("should enforce cooldown: skip if lastSequenceSentAt + cooldownDays > now", async () => {
    // Patient eligible for early_intervention, but step 1 was sent 1 day ago (cooldown = 3)
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          sessionThresholdAlert: true,
          lastSessionDate: daysAgo(5),
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
      commsLogs: [{
        id: "log-1",
        data: mockCommsLog({
          patientId: "pat-1",
          sequenceType: "early_intervention",
          stepNumber: 1,
          sentAt: daysAgo(1), // sent 1 day ago, cooldown = 3 days
          outcome: "no_action",
        }),
      }],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    // Step 2 requires daysAfterTrigger=3 from lastSessionDate (5 days ago → OK timing-wise)
    // But cooldown: last send was 1 day ago, cooldownDays=3 → should skip
    expect(result.fired).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it("should progress to next step if previous step was sent >= daysAfterTrigger ago", async () => {
    // Step 1 was sent 5 days ago, step 2 requires daysAfterTrigger=3
    // lastSessionDate was 5 days ago → daysSinceTrigger=5 >= 3 → step 2 fires
    // cooldown: 5 days since last send >= cooldownDays(3) → OK
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          sessionThresholdAlert: true,
          lastSessionDate: daysAgo(5),
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
      commsLogs: [{
        id: "log-1",
        data: mockCommsLog({
          patientId: "pat-1",
          sequenceType: "early_intervention",
          stepNumber: 1,
          sentAt: daysAgo(5),
          outcome: "no_action",
        }),
      }],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    expect(result.fired).toBeGreaterThanOrEqual(1);
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].includes("early_intervention")
    );
    expect(fetchCall).toBeDefined();
    const body = JSON.parse(fetchCall![1].body);
    expect(body.stepNumber).toBe(2);
  });

  it("should not exceed maxStepsAllowed for sequence", async () => {
    // early_intervention has 2 steps — both already sent
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          sessionThresholdAlert: true,
          lastSessionDate: daysAgo(10),
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
      commsLogs: [
        {
          id: "log-1",
          data: mockCommsLog({
            patientId: "pat-1",
            sequenceType: "early_intervention",
            stepNumber: 1,
            sentAt: daysAgo(8),
            outcome: "no_action",
          }),
        },
        {
          id: "log-2",
          data: mockCommsLog({
            patientId: "pat-1",
            sequenceType: "early_intervention",
            stepNumber: 2,
            sentAt: daysAgo(5),
            outcome: "no_action",
          }),
        },
      ],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    // getNextStep returns null since all steps sent → skipped
    // No early_intervention fires (may still process other sequence types)
    const eiFetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0].includes("early_intervention")
    );
    expect(eiFetchCalls.length).toBe(0);
  });

  it("should fire rebooking_prompt when patient has missed recent appointment", async () => {
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 3,
          churnRisk: true,
          lastSessionDate: daysAgo(2),
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    const rebookFetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0].includes("rebooking_prompt")
    );
    expect(rebookFetchCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.fired).toBeGreaterThanOrEqual(1);
  });

  it("should fire hep_reminder when HEP program assigned and within 48h window", async () => {
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 2,
          hepProgramId: "hep-123",
          lastSessionDate: hoursAgo(24), // 24h ago — within 48h window
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    const hepFetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0].includes("hep_reminder")
    );
    expect(hepFetchCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.fired).toBeGreaterThanOrEqual(1);
  });

  it("should fire review_prompt when patient is discharged", async () => {
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 8,
          discharged: true,
          lastSessionDate: daysAgo(5),
          nextSessionDate: undefined,
          lifecycleState: "DISCHARGED",
        }),
      }],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    const reviewFetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0].includes("review_prompt")
    );
    expect(reviewFetchCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.fired).toBeGreaterThanOrEqual(1);
  });

  it("should fire pre_auth_collection when insurance patient with sessionCount=1", async () => {
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          insuranceFlag: true,
          insurerName: "Bupa",
          lastSessionDate: daysAgo(1),
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    const preAuthFetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0].includes("pre_auth_collection")
    );
    expect(preAuthFetchCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.fired).toBeGreaterThanOrEqual(1);
  });

  it("should fire reactivation_90d when patient discharged with lastSessionDate", async () => {
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 8,
          discharged: true,
          lastSessionDate: daysAgo(95),
          nextSessionDate: undefined,
          lifecycleState: "DISCHARGED",
        }),
      }],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    const reactivationCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0].includes("reactivation_90d")
    );
    expect(reactivationCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.fired).toBeGreaterThanOrEqual(1);
  });

  it("should fire reactivation_180d when patient discharged with lastSessionDate", async () => {
    // reactivation_180d is active=false by default, so we need custom definitions
    const seqDefs = DEFAULT_SEQUENCE_DEFINITIONS.map((d, i) => ({
      id: `seq-${i}`,
      data: { ...d, active: true }, // force all active
    }));

    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 8,
          discharged: true,
          lastSessionDate: daysAgo(185),
          nextSessionDate: undefined,
          lifecycleState: "DISCHARGED",
        }),
      }],
      sequenceDefinitions: seqDefs,
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    const reactivation180Calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0].includes("reactivation_180d")
    );
    expect(reactivation180Calls.length).toBeGreaterThanOrEqual(1);
    expect(result.fired).toBeGreaterThanOrEqual(1);
  });

  it("should write to comms_log collection with correct fields", async () => {
    const { db, writes } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          sessionThresholdAlert: true,
          lastSessionDate: daysAgo(2),
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
    });

    await triggerCommsSequences(db, "clinic-1");

    // Find comms_log writes (the path contains comms_log)
    const commsLogWrites = writes.filter((w) => w.path.includes("comms_log"));
    expect(commsLogWrites.length).toBeGreaterThanOrEqual(1);

    const logData = commsLogWrites[0].data as Record<string, unknown>;
    expect(logData).toHaveProperty("patientId", "pat-1");
    expect(logData).toHaveProperty("sequenceType");
    expect(logData).toHaveProperty("channel");
    expect(logData).toHaveProperty("sentAt");
    expect(logData).toHaveProperty("outcome", "no_action");
    expect(logData).toHaveProperty("stepNumber");
    expect(logData).toHaveProperty("createdBy", "trigger-sequences");
  });

  it("should update patient.lastSequenceSentAt when sequence fired", async () => {
    const { db, writes } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          sessionThresholdAlert: true,
          lastSessionDate: daysAgo(2),
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
    });

    await triggerCommsSequences(db, "clinic-1");

    // Find patient doc update (merge: true)
    const patientWrites = writes.filter(
      (w) => w.path.includes("patients/pat-1") && (w.data as any).lastSequenceSentAt
    );
    expect(patientWrites.length).toBeGreaterThanOrEqual(1);
    expect(patientWrites[0].options).toEqual({ merge: true });
    expect((patientWrites[0].data as any).lastSequenceSentAt).toBeDefined();
  });

  it("should call n8n webhook with correct payload structure", async () => {
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          sessionThresholdAlert: true,
          lastSessionDate: daysAgo(2),
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
    });

    await triggerCommsSequences(db, "clinic-1");

    expect(globalThis.fetch).toHaveBeenCalled();
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toMatch(/^https:\/\/n8n\.test\.com\/webhook\//);
    expect(fetchCall[1].method).toBe("POST");
    expect(fetchCall[1].headers["Content-Type"]).toBe("application/json");
    expect(fetchCall[1].headers["x-webhook-secret"]).toBe("test-secret");

    const body = JSON.parse(fetchCall[1].body);
    expect(body).toHaveProperty("clinicId", "clinic-1");
    expect(body).toHaveProperty("patientId", "pat-1");
    expect(body).toHaveProperty("patientName");
    expect(body).toHaveProperty("sequenceType");
    expect(body).toHaveProperty("stepNumber");
    expect(body).toHaveProperty("logId");
    expect(body).toHaveProperty("callbackUrl");
    expect(body).toHaveProperty("triggerData");
    expect(body).toHaveProperty("toneModifier");
    expect(body).toHaveProperty("resolvedSmsBody");
  });

  it("should catch and log n8n webhook errors without failing entire trigger", async () => {
    globalThis.fetch = mockFetchFail("Network timeout");

    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          sessionThresholdAlert: true,
          lastSessionDate: daysAgo(2),
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    // Should not throw — errors captured in result
    expect(result.fired).toBe(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]).toContain("Network timeout");
  });

  it("should be multi-tenant scoped to clinicId in all queries", async () => {
    const collectionCalls: string[] = [];
    const docCalls: string[] = [];

    // Custom mock that tracks collection/doc paths
    const makeTrackingDocRef = (path: string): any => ({
      id: `auto-${Math.random().toString(36).slice(2, 8)}`,
      path,
      get: vi.fn(async () => ({ data: () => ({ name: "Tracked Clinic" }), exists: true })),
      set: vi.fn(async () => {}),
      collection: (subcol: string) => {
        const p = `${path}/${subcol}`;
        collectionCalls.push(p);
        return makeTrackingCollectionRef(p);
      },
    });

    const makeTrackingCollectionRef = (path: string): any => {
      const ref: any = {
        path,
        doc: (docId?: string) => {
          const id = docId ?? `auto-${Math.random().toString(36).slice(2, 8)}`;
          docCalls.push(`${path}/${id}`);
          const docRef = makeTrackingDocRef(`${path}/${id}`);
          docRef.id = id;
          return docRef;
        },
        get: vi.fn(async () => ({ docs: [], empty: true })),
        limit: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        startAfter: vi.fn().mockReturnThis(),
      };
      ref.limit.mockImplementation(() => ref);
      ref.where.mockImplementation(() => ref);
      ref.orderBy.mockImplementation(() => ref);
      ref.startAfter.mockImplementation(() => ref);
      return ref;
    };

    const db = {
      collection: (col: string) => {
        collectionCalls.push(col);
        return makeTrackingCollectionRef(col);
      },
      batch: () => ({
        set: vi.fn(),
        commit: vi.fn(async () => {}),
      }),
    } as unknown as Firestore;

    await triggerCommsSequences(db, "clinic-42");

    // All collection paths should route through clinics/clinic-42
    const allPaths = [...collectionCalls, ...docCalls];
    const firestorePaths = allPaths.filter((p) => p.includes("clinic"));
    for (const path of firestorePaths) {
      if (path !== "clinics") {
        expect(path).toContain("clinic-42");
      }
    }
  });
});

// ─── isEligible (now exported — tested directly) ───────────────────────────

describe("isEligible", () => {
  const now = new Date();

  it("should return true for early_intervention when sessionThresholdAlert=true and no nextSessionDate", () => {
    const patient = mockPatient({
      sessionThresholdAlert: true,
      nextSessionDate: undefined,
    });
    expect(isEligible(patient, "early_intervention", now, false)).toBe(true);
  });

  it("should return false for early_intervention when dischargeLikelihood is high", () => {
    const patient = mockPatient({
      sessionThresholdAlert: true,
      nextSessionDate: undefined,
      complexitySignals: { dischargeLikelihood: "high", treatmentComplexity: "low", psychosocialFlags: false, multipleRegions: false, chronicIndicators: false },
    });
    expect(isEligible(patient, "early_intervention", now, false)).toBe(false);
  });

  it("should return true for rebooking_prompt when churnRisk=true and sessionCount>=2", () => {
    const patient = mockPatient({
      churnRisk: true,
      sessionCount: 3,
    });
    expect(isEligible(patient, "rebooking_prompt", now, false)).toBe(true);
  });

  it("should enforce 48h entry guard for hep_reminder step 1", () => {
    // Within 48h — should pass
    const patientWithin = mockPatient({
      hepProgramId: "hep-1",
      lastSessionDate: hoursAgo(24),
      nextSessionDate: undefined,
    });
    expect(isEligible(patientWithin, "hep_reminder", now, false)).toBe(true);

    // Outside 48h — should fail for step 1 (hasBeenStarted=false)
    const patientOutside = mockPatient({
      hepProgramId: "hep-1",
      lastSessionDate: hoursAgo(72),
      nextSessionDate: undefined,
    });
    expect(isEligible(patientOutside, "hep_reminder", now, false)).toBe(false);

    // Outside 48h but hasBeenStarted=true (subsequent step) — should pass
    expect(isEligible(patientOutside, "hep_reminder", now, true)).toBe(true);
  });

  it("should return true for review_prompt when patient.discharged=true", () => {
    const patient = mockPatient({ discharged: true });
    expect(isEligible(patient, "review_prompt", now, false)).toBe(true);
  });

  it("should return true for pre_auth_collection when insuranceFlag=true and sessionCount=1", () => {
    const patient = mockPatient({ insuranceFlag: true, sessionCount: 1 });
    expect(isEligible(patient, "pre_auth_collection", now, false)).toBe(true);

    // sessionCount != 1 should fail
    const patient2 = mockPatient({ insuranceFlag: true, sessionCount: 2 });
    expect(isEligible(patient2, "pre_auth_collection", now, false)).toBe(false);
  });
});

// ─── getNextStep (now exported — tested directly) ──────────────────────────

describe("getNextStep", () => {
  const def = mockSequenceDefinition();
  const triggerDate = new Date(Date.now() - 5 * 86_400_000); // 5 days ago
  const now = new Date();

  it("should return step 1 when no prior logs exist and daysSinceTrigger >= step1.daysAfterTrigger", () => {
    const result = getNextStep(def, [], triggerDate, now);
    expect(result).not.toBeNull();
    expect(result!.stepNumber).toBe(1);
  });

  it("should return next step after last sent step when timing threshold met", () => {
    const priorLogs = [
      { stepNumber: 1, sentAt: daysAgo(4), outcome: "no_action" },
    ];
    const result = getNextStep(def, priorLogs, triggerDate, now);
    // Step 2 requires daysAfterTrigger=3, we're at 5 days → should return step 2
    expect(result).not.toBeNull();
    expect(result!.stepNumber).toBe(2);
  });

  it("should return null when all steps completed (sequence finished)", () => {
    const priorLogs = [
      { stepNumber: 1, sentAt: daysAgo(4), outcome: "no_action" },
      { stepNumber: 2, sentAt: daysAgo(2), outcome: "no_action" },
    ];
    const result = getNextStep(def, priorLogs, triggerDate, now);
    // No step 3 in def → null
    expect(result).toBeNull();
  });
});

// ─── getTriggerDate (now exported — tested directly) ────────────────────────

describe("getTriggerDate", () => {
  it("should use lastSessionDate for most sequence types", () => {
    const patient = mockPatient({ lastSessionDate: "2026-01-15T10:00:00.000Z" });
    const types: Array<"early_intervention" | "rebooking_prompt" | "hep_reminder" | "review_prompt" | "reactivation_90d" | "reactivation_180d"> = [
      "early_intervention",
      "rebooking_prompt",
      "hep_reminder",
      "review_prompt",
      "reactivation_90d",
      "reactivation_180d",
    ];
    for (const t of types) {
      const date = getTriggerDate(patient, t);
      expect(date).not.toBeNull();
      expect(date!.toISOString()).toBe("2026-01-15T10:00:00.000Z");
    }
  });

  it("should use current date for pre_auth_collection (fires immediately)", () => {
    const patient = mockPatient({ lastSessionDate: "2026-01-15T10:00:00.000Z" });
    const before = Date.now();
    const date = getTriggerDate(patient, "pre_auth_collection");
    const after = Date.now();

    expect(date).not.toBeNull();
    // Should be approximately now, not lastSessionDate
    const ts = date!.getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ─── loadOrSeedDefinitions (now exported — tested directly) ─────────────────

describe("loadOrSeedDefinitions", () => {
  it("should load existing definitions from Firestore", async () => {
    const existingDefs = [
      {
        id: "existing-1",
        data: {
          name: "Custom Sequence",
          sequenceType: "early_intervention",
          steps: [{ stepNumber: 1, daysAfterTrigger: 1, channel: "sms", templateKey: "custom_step1" }],
          attributionWindowDays: 5,
          exitConditions: ["appointment_booked"],
          cooldownDays: 7,
          active: true,
          priority: 1,
        },
      },
    ];

    const { db, batchWrites } = createMockFirestore({
      sequenceDefinitions: existingDefs,
    });

    const result = await loadOrSeedDefinitions(db, "clinic-1");

    // Should return existing definitions, no seeding
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("existing-1");
    expect(result[0].name).toBe("Custom Sequence");
    expect(batchWrites.length).toBe(0); // no seeding
  });

  it("should seed default definitions if none exist", async () => {
    const { db, batchWrites } = createMockFirestore({
      sequenceDefinitions: [], // empty
    });

    const result = await loadOrSeedDefinitions(db, "clinic-1");

    // Should seed all defaults
    expect(result.length).toBe(DEFAULT_SEQUENCE_DEFINITIONS.length);
    expect(batchWrites.length).toBe(DEFAULT_SEQUENCE_DEFINITIONS.length);
    // Check that each default was written
    for (const bw of batchWrites) {
      expect(bw.data).toHaveProperty("sequenceType");
      expect(bw.data).toHaveProperty("steps");
    }
  });
});

// ─── Edge cases and error handling ──────────────────────────────────────────

describe("edge cases and error handling", () => {
  const originalEnv = process.env.N8N_WEBHOOK_BASE_URL;
  const originalSecret = process.env.N8N_COMMS_WEBHOOK_SECRET;
  beforeEach(() => {
    process.env.N8N_WEBHOOK_BASE_URL = "https://n8n.test.com/webhook";
    process.env.N8N_COMMS_WEBHOOK_SECRET = "test-secret";
    globalThis.fetch = mockFetchOk();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.N8N_WEBHOOK_BASE_URL;
    } else {
      process.env.N8N_WEBHOOK_BASE_URL = originalEnv;
    }
    if (originalSecret === undefined) {
      delete process.env.N8N_COMMS_WEBHOOK_SECRET;
    } else {
      process.env.N8N_COMMS_WEBHOOK_SECRET = originalSecret;
    }
    globalThis.fetch = _realFetch;
    vi.restoreAllMocks();
  });

  it("should handle concurrent triggers without race conditions", async () => {
    // Two concurrent calls for the same clinic — both should succeed independently
    const { db } = createMockFirestore({
      patients: [{
        id: "pat-1",
        data: mockPatient({
          sessionCount: 1,
          sessionThresholdAlert: true,
          lastSessionDate: daysAgo(2),
          nextSessionDate: undefined,
          discharged: false,
        }),
      }],
    });

    const [result1, result2] = await Promise.all([
      triggerCommsSequences(db, "clinic-1"),
      triggerCommsSequences(db, "clinic-1"),
    ]);

    // Both should complete without errors (no unhandled rejections)
    expect(result1.errors.length).toBe(0);
    expect(result2.errors.length).toBe(0);
    // Each call independently evaluates — both should fire
    expect(result1.fired).toBeGreaterThanOrEqual(1);
    expect(result2.fired).toBeGreaterThanOrEqual(1);
  });

  it("should return empty result when clinic has no patients", async () => {
    const { db } = createMockFirestore({
      patients: [],
    });

    const result = await triggerCommsSequences(db, "clinic-1");

    expect(result).toEqual({ fired: 0, skipped: 0, errors: [] });
  });

  it("should return empty result when all patients excluded by eligibility", async () => {
    // 5 patients, all discharged — early_intervention skips discharged patients
    const patients = Array.from({ length: 5 }, (_, i) => ({
      id: `pat-${i}`,
      data: mockPatient({
        discharged: true,
        lifecycleState: "DISCHARGED",
        sessionThresholdAlert: false,
        churnRisk: false,
        hepProgramId: undefined,
        insuranceFlag: false,
        // No lastSessionDate so reactivation sequences can't get a trigger date
        lastSessionDate: undefined,
      }),
    }));

    const { db } = createMockFirestore({ patients });

    const result = await triggerCommsSequences(db, "clinic-1");

    expect(result.fired).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });
});
