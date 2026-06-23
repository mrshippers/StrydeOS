/**
 * Unit tests for detect-insight-events.ts
 * TDD: written to specify correct behaviour before/during implementation.
 *
 * Coverage:
 *   P0-7  sample-size gate: sub-threshold clinicians never named
 *   P0-8  REVENUE_LEAK_DETECTED: names the rate-outlier, not highest-volume clinician
 *         severity boundaries (0.20 drop / £500 leak / 14 days)
 *         prevRate > 0 divide-by-zero guard
 *         dedup / re-alert-on-worsening
 *         discharged / never-started exclusion
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectInsightEvents } from "../detect-insight-events";
import { MIN_COMPLETED_APPTS, MIN_UNIQUE_PATIENTS } from "../detect-insight-events";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a Firestore-like mock db. All collections keyed by path string. */
function makeMockDb(opts: {
  configData?: Record<string, unknown>;
  metrics?: Record<string, unknown>[];
  clinicians?: { id: string; name: string }[];
  patients?: Record<string, unknown>[];
  appointments?: Record<string, unknown>[];
  reviews?: Record<string, unknown>[];
  existingEvents?: Record<string, unknown>[];
} = {}) {
  const {
    configData,
    metrics = [],
    clinicians = [],
    patients = [],
    appointments = [],
    reviews = [],
    existingEvents = [],
  } = opts;

  // Stored writes so tests can inspect them
  const written: Record<string, unknown>[] = [];

  function makeQueryChain(docs: Record<string, unknown>[]) {
    return {
      get: vi.fn(async () => ({
        docs: docs.map((d) => ({
          id: (d as Record<string, unknown>).id ?? "doc-id",
          data: () => d,
        })),
      })),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };
  }

  const addMock = vi.fn(async (data: Record<string, unknown>) => {
    written.push(data);
    return { id: `auto-${written.length}` };
  });

  const collectionsMap: Record<string, Record<string, unknown>[]> = {
    clinicians: clinicians.map((c) => ({ ...c, active: true })),
    patients,
    appointments,
    reviews,
    insight_events: existingEvents,
    metrics_weekly: metrics,
  };

  return {
    _written: written,
    doc: vi.fn((path: string) => {
      // clinics/{id}/settings/insight_config
      if (path.includes("insight_config")) {
        return {
          get: vi.fn(async () => ({
            exists: !!configData,
            data: () => configData ?? {},
          })),
        };
      }
      return {
        get: vi.fn(async () => ({ exists: false, data: () => ({}) })),
      };
    }),
    collection: vi.fn((path: string) => {
      // path = "clinics/{id}/{collection}" -> take the last segment
      const parts = path.split("/");
      const collName = parts[parts.length - 1] as string;
      const docs = collectionsMap[collName] ?? [];
      const chain = makeQueryChain(docs);
      // add for writing events
      return { ...chain, add: addMock };
    }),
  };
}

/** Minimal valid metric doc. */
function makeMetric(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `metric-${Math.random()}`,
    clinicianId: "c1",
    weekStart: "2026-06-09",
    followUpRate: 3.0,
    utilisationRate: 0.80,
    treatmentCompletionRate: 0.50,
    statisticallyRepresentative: true,
    appointmentsTotal: 12,
    ...overrides,
  };
}

/** Minimal mid-programme dropout patient. */
function makeDropoutPatient(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const lastSession = new Date();
  lastSession.setDate(lastSession.getDate() - 10); // 10 days ago
  return {
    id: `pat-${Math.random()}`,
    clinicianId: "c1",
    discharged: false,
    lastSessionDate: lastSession.toISOString(),
    sessionCount: 3,
    nextSessionDate: null,
    ...overrides,
  };
}

// ── P0-7: sample-size gate ────────────────────────────────────────────────────

describe("P0-7: sample-size gate — sub-threshold clinician never named", () => {
  it("exports MIN_COMPLETED_APPTS and MIN_UNIQUE_PATIENTS constants", () => {
    expect(typeof MIN_COMPLETED_APPTS).toBe("number");
    expect(MIN_COMPLETED_APPTS).toBeGreaterThan(0);
    expect(typeof MIN_UNIQUE_PATIENTS).toBe("number");
    expect(MIN_UNIQUE_PATIENTS).toBeGreaterThan(0);
  });

  it("suppresses CLINICIAN_FOLLOWUP_DROP when appointmentsTotal is below threshold", async () => {
    // Clinician has only 2 appointments this week — far below MIN_COMPLETED_APPTS
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 1.0,
          appointmentsTotal: 2,        // sub-threshold
          statisticallyRepresentative: false,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 3.0,
          appointmentsTotal: 2,        // sub-threshold
          statisticallyRepresentative: false,
        }),
      ],
    });

    const result = await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("CLINICIAN_FOLLOWUP_DROP");
  });

  it("suppresses HIGH_DNA_STREAK when total recent appointments are sub-threshold", async () => {
    // 3 DNAs but only 3 total appointments in last 14 days — below meaningful sample
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [makeMetric({ clinicianId: "c1", appointmentsTotal: 2, statisticallyRepresentative: false })],
      appointments: [
        { id: "a1", clinicianId: "c1", status: "dna", dateTime: new Date().toISOString() },
        { id: "a2", clinicianId: "c1", status: "dna", dateTime: new Date().toISOString() },
        { id: "a3", clinicianId: "c1", status: "dna", dateTime: new Date().toISOString() },
      ],
    });

    const result = await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("HIGH_DNA_STREAK");
  });

  it("suppresses UTILISATION_BELOW_TARGET when appointmentsTotal is sub-threshold", async () => {
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          utilisationRate: 0.50,
          appointmentsTotal: 2,
          statisticallyRepresentative: false,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          utilisationRate: 0.55,
          appointmentsTotal: 2,
          statisticallyRepresentative: false,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("UTILISATION_BELOW_TARGET");
  });

  it("suppresses TREATMENT_COMPLETION_WIN when appointmentsTotal is sub-threshold", async () => {
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          treatmentCompletionRate: 0.95,
          appointmentsTotal: 3,
          statisticallyRepresentative: false,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("TREATMENT_COMPLETION_WIN");
  });

  it("allows CLINICIAN_FOLLOWUP_DROP when threshold is met", async () => {
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 1.0,    // dropped from 3.0
          appointmentsTotal: 12, // above threshold
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 3.0,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).toContain("CLINICIAN_FOLLOWUP_DROP");
  });

  it("honours statisticallyRepresentative=false to suppress even when count above threshold", async () => {
    // Metric says appointmentsTotal=12 but statisticallyRepresentative=false (compute-weekly set it)
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 1.0,
          appointmentsTotal: 12,
          statisticallyRepresentative: false, // explicit flag overrides raw count
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 3.0,
          appointmentsTotal: 12,
          statisticallyRepresentative: false,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("CLINICIAN_FOLLOWUP_DROP");
  });

  it("sets sampleSize on emitted CLINICIAN_FOLLOWUP_DROP events", async () => {
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 1.0,
          appointmentsTotal: 15,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 3.0,
          appointmentsTotal: 15,
          statisticallyRepresentative: true,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "CLINICIAN_FOLLOWUP_DROP");
    expect(event).toBeDefined();
    expect(typeof event!.sampleSize).toBe("number");
    expect(event!.sampleSize).toBeGreaterThan(0);
    expect(typeof event!.timeframe).toBe("string");
  });
});

// ── P0-7: prevRate > 0 divide-by-zero guard ──────────────────────────────────

describe("P0-7: prevRate > 0 divide-by-zero guard", () => {
  it("does not emit CLINICIAN_FOLLOWUP_DROP when prevRate is 0", async () => {
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 0,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 0,   // prevRate = 0 -- no divide
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("CLINICIAN_FOLLOWUP_DROP");
  });
});

// ── P0-7: severity boundaries ─────────────────────────────────────────────────

describe("P0-7: severity boundaries", () => {
  it("marks CLINICIAN_FOLLOWUP_DROP as critical when drop >= 20%", async () => {
    // drop = (3.0 - 2.1) / 3.0 = 0.30 (30%) -- critical
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 2.1,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 3.0,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "CLINICIAN_FOLLOWUP_DROP");
    expect(event?.severity).toBe("critical");
  });

  it("marks CLINICIAN_FOLLOWUP_DROP as warning when drop is between threshold and 20%", async () => {
    // drop = (3.0 - 2.5) / 3.0 = 0.1667 (16.7%) -- warning (>= threshold 0.10 but < 0.20)
    // Using 2.5 rather than 2.7 to avoid floating-point edge cases at exactly 10%.
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 2.5,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 3.0,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "CLINICIAN_FOLLOWUP_DROP");
    expect(event?.severity).toBe("warning");
  });

  it("marks REVENUE_LEAK_DETECTED as critical when leaked revenue > £500", async () => {
    // 3 patients each with 3 remaining sessions at £65 = £585 -- critical
    const patients = Array.from({ length: 3 }, (_, i) => makeDropoutPatient({ id: `p${i}`, sessionCount: 3 }));
    const db = makeMockDb({ patients });

    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "REVENUE_LEAK_DETECTED");
    expect(event?.severity).toBe("critical");
  });

  it("marks REVENUE_LEAK_DETECTED as warning when leaked revenue <= £500", async () => {
    // 1 patient with 3 remaining sessions at £65 = £195 -- warning
    const patients = [makeDropoutPatient({ sessionCount: 3 })];
    const db = makeMockDb({ patients });

    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "REVENUE_LEAK_DETECTED");
    expect(event?.severity).toBe("warning");
  });

  it("marks PATIENT_DROPOUT_RISK as critical when days since last session > 14", async () => {
    const lastSession = new Date();
    lastSession.setDate(lastSession.getDate() - 20); // 20 days ago
    const patients = [makeDropoutPatient({ lastSessionDate: lastSession.toISOString() })];
    // Patient's clinician must be a seat (active) for the dropout event to fire.
    const db = makeMockDb({ patients, clinicians: [{ id: "c1", name: "Alice" }] });

    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "PATIENT_DROPOUT_RISK");
    expect(event?.severity).toBe("critical");
  });
});

// ── P0-7: dedup / re-alert-on-worsening ──────────────────────────────────────

describe("P0-7: dedup and re-alert-on-worsening", () => {
  it("skips duplicate events within 7 days", async () => {
    const recentCreated = new Date();
    recentCreated.setDate(recentCreated.getDate() - 2); // 2 days ago

    const existingEvents = [
      {
        id: "existing-1",
        type: "CLINICIAN_FOLLOWUP_DROP",
        clinicianId: "c1",
        patientId: "",
        createdAt: recentCreated.toISOString(),
        revenueImpact: 0,
      },
    ];

    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 1.0,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 3.0,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
      ],
      existingEvents,
    });

    const result = await detectInsightEvents(db as any, "clinic-test");

    expect(result.eventsSkipped).toBeGreaterThan(0);
    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("CLINICIAN_FOLLOWUP_DROP");
  });

  it("re-alerts REVENUE_LEAK_DETECTED when revenue impact has worsened", async () => {
    const recentCreated = new Date();
    recentCreated.setDate(recentCreated.getDate() - 2);

    const existingEvents = [
      {
        id: "existing-revenue",
        type: "REVENUE_LEAK_DETECTED",
        clinicianId: "",
        patientId: "",
        createdAt: recentCreated.toISOString(),
        revenueImpact: 100, // previous impact was low
      },
    ];

    // Now 5 patients dropping out = much higher leak than £100
    const patients = Array.from({ length: 5 }, (_, i) => makeDropoutPatient({ id: `p${i}`, sessionCount: 3 }));
    const db = makeMockDb({ patients, existingEvents });

    await detectInsightEvents(db as any, "clinic-test");

    // New event should have been written since revenue worsened
    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).toContain("REVENUE_LEAK_DETECTED");
  });
});

// ── P0-7: discharged / never-started exclusion ───────────────────────────────

describe("P0-7: discharged and never-started patient exclusion", () => {
  it("excludes discharged patients from REVENUE_LEAK_DETECTED", async () => {
    const lastSession = new Date();
    lastSession.setDate(lastSession.getDate() - 10);
    const patients = [
      makeDropoutPatient({ discharged: true, id: "p-discharged" }),
    ];
    const db = makeMockDb({ patients });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("REVENUE_LEAK_DETECTED");
  });

  it("excludes never-started patients (sessionCount < 1) from REVENUE_LEAK_DETECTED", async () => {
    const patients = [makeDropoutPatient({ sessionCount: 0, id: "p-never-started" })];
    const db = makeMockDb({ patients });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("REVENUE_LEAK_DETECTED");
  });

  it("excludes patients with a future booking from REVENUE_LEAK_DETECTED", async () => {
    const patients = [makeDropoutPatient({ nextSessionDate: "2026-07-01T10:00:00Z", id: "p-booked" })];
    const db = makeMockDb({ patients });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("REVENUE_LEAK_DETECTED");
  });
});

// ── P0-8: REVENUE_LEAK_DETECTED rate-normalised naming ───────────────────────

describe("P0-8: REVENUE_LEAK_DETECTED names rate-outlier, not highest-volume clinician", () => {
  it("names the rate-outlier clinician when dropout rate is genuinely higher", async () => {
    // c1 has 4 dropouts out of 8 mid-prog patients = 50% rate
    // c2 has 3 dropouts out of 30 mid-prog patients = 10% rate
    // c1 is the rate outlier despite c2 having more raw dropouts
    // c1 caseload >= MIN_UNIQUE_PATIENTS (5) so qualifies for naming

    const lastSession = new Date();
    lastSession.setDate(lastSession.getDate() - 10);
    const ls = lastSession.toISOString();

    const patients = [
      // c1: 8 mid-programme total, 4 dropouts (50% rate)
      ...Array.from({ length: 4 }, (_, i) =>
        makeDropoutPatient({ clinicianId: "c1", id: `p1-${i}`, lastSessionDate: ls })
      ),
      ...Array.from({ length: 4 }, (_, i) => ({
        ...makeDropoutPatient({ clinicianId: "c1", id: `p1b-${i}` }),
        nextSessionDate: "2026-07-01", // active
      })),
      // c2: 30 mid-programme, 3 dropouts (10% rate) -- high volume but lower rate
      ...Array.from({ length: 3 }, (_, i) =>
        makeDropoutPatient({ clinicianId: "c2", id: `p2-${i}`, lastSessionDate: ls })
      ),
      ...Array.from({ length: 27 }, (_, i) => ({
        ...makeDropoutPatient({ clinicianId: "c2", id: `p2b-${i}` }),
        nextSessionDate: "2026-07-01", // active -- not dropouts
      })),
    ];

    const db = makeMockDb({
      clinicians: [
        { id: "c1", name: "Alice" },
        { id: "c2", name: "Bob" },
      ],
      patients,
    });

    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "REVENUE_LEAK_DETECTED");
    expect(event).toBeDefined();
    // Description should NOT name Bob (highest volume) but should name Alice (highest rate)
    expect(event!.description).toContain("Alice");
    expect(event!.description).not.toContain("Bob");
  });

  it("does NOT name any clinician when no single rate-outlier exists (cohort-level report)", async () => {
    // Both clinicians have the same dropout rate -- no outlier
    const lastSession = new Date();
    lastSession.setDate(lastSession.getDate() - 10);
    const ls = lastSession.toISOString();

    const patients = [
      // c1: 2 dropouts out of 4 mid-prog = 50%
      ...Array.from({ length: 2 }, (_, i) =>
        makeDropoutPatient({ clinicianId: "c1", id: `pa-${i}`, lastSessionDate: ls })
      ),
      ...Array.from({ length: 2 }, (_, i) => ({
        ...makeDropoutPatient({ clinicianId: "c1", id: `pa-b${i}` }),
        nextSessionDate: "2026-07-01",
      })),
      // c2: 2 dropouts out of 4 mid-prog = 50% (same rate)
      ...Array.from({ length: 2 }, (_, i) =>
        makeDropoutPatient({ clinicianId: "c2", id: `pb-${i}`, lastSessionDate: ls })
      ),
      ...Array.from({ length: 2 }, (_, i) => ({
        ...makeDropoutPatient({ clinicianId: "c2", id: `pb-b${i}` }),
        nextSessionDate: "2026-07-01",
      })),
    ];

    const db = makeMockDb({
      clinicians: [
        { id: "c1", name: "Alice" },
        { id: "c2", name: "Bob" },
      ],
      patients,
    });

    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "REVENUE_LEAK_DETECTED");
    // Event may or may not be emitted depending on total leak, but if emitted must not name a clinician
    if (event) {
      expect(event.description).not.toContain("Alice");
      expect(event.description).not.toContain("Bob");
    }
  });

  it("labels leaked revenue as an estimate with assumption stated", async () => {
    const patients = [makeDropoutPatient({ sessionCount: 2, id: "p1" })];
    const db = makeMockDb({ patients });

    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "REVENUE_LEAK_DETECTED");
    expect(event).toBeDefined();
    // Title or description must include 'estimate' or 'estimated' language
    const fullText = `${event!.title} ${event!.description}`.toLowerCase();
    expect(fullText).toMatch(/estimat/);
  });

  it("sets sampleSize and timeframe on REVENUE_LEAK_DETECTED events", async () => {
    const patients = [makeDropoutPatient({ sessionCount: 2, id: "p1" })];
    const db = makeMockDb({ patients });

    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "REVENUE_LEAK_DETECTED");
    expect(event).toBeDefined();
    expect(typeof event!.sampleSize).toBe("number");
    expect(typeof event!.timeframe).toBe("string");
  });
});

// ── P0-7/P0-8 fairness: per-week sample gate on two-week detectors ────────────

describe("P0-7/P0-8 fairness: two-week detectors require EACH week to be sample-sound", () => {
  it("suppresses UTILISATION_BELOW_TARGET when previous week is sub-threshold (low count)", async () => {
    // Current week is sound (12 appts, statRep=true).
    // Previous week is unsound (3 appts, statRep=false).
    // Two-week assertion requires BOTH weeks to be evidentially sound.
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          utilisationRate: 0.50,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          utilisationRate: 0.50,
          appointmentsTotal: 3,          // sub-threshold
          statisticallyRepresentative: false,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("UTILISATION_BELOW_TARGET");
  });

  it("suppresses UTILISATION_BELOW_TARGET when previous week has statisticallyRepresentative=false despite sufficient count", async () => {
    // Current week: sound. Previous week: count above threshold but statRep explicitly false.
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          utilisationRate: 0.50,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          utilisationRate: 0.50,
          appointmentsTotal: 10,         // above MIN_COMPLETED_APPTS
          statisticallyRepresentative: false, // but flag says not representative
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("UTILISATION_BELOW_TARGET");
  });

  it("emits UTILISATION_BELOW_TARGET when BOTH weeks are sample-sound", async () => {
    // Both weeks: count above threshold and statRep=true.
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          utilisationRate: 0.50,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          utilisationRate: 0.50,
          appointmentsTotal: 10,
          statisticallyRepresentative: true,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).toContain("UTILISATION_BELOW_TARGET");
  });
});

// ── P0-7/P0-8 fix pass 2: CLINICIAN_FOLLOWUP_DROP previous-week gate ─────────
//
// CLINICIAN_FOLLOWUP_DROP uses prevRate (the previous week's followUpRate) in
// the emitted event title. If the previous week's sample is unsound the
// prevRate baseline is noise, so naming the clinician on it is unfair.
// Gate: previous week must also independently satisfy MIN_COMPLETED_APPTS AND
// statisticallyRepresentative !== false before the event is emitted.

describe("P0-7/P0-8 fix pass 2: CLINICIAN_FOLLOWUP_DROP suppressed when previous week is unsound", () => {
  it("suppresses CLINICIAN_FOLLOWUP_DROP when previous week is sub-threshold (low count)", async () => {
    // Current week: 12 appts, statRep=true -- sound.
    // Previous week: 3 appts, statRep=false -- unsound baseline.
    // followUpRate drops enough to otherwise fire (3.0 -> 1.0 = 66% drop).
    // Expected: event NOT emitted because prevRate baseline is unsound.
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 1.0,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 3.0,
          appointmentsTotal: 3,           // sub-threshold previous week
          statisticallyRepresentative: false,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("CLINICIAN_FOLLOWUP_DROP");
  });

  it("suppresses CLINICIAN_FOLLOWUP_DROP when previous week has statisticallyRepresentative=false despite sufficient count", async () => {
    // Current week sound; previous week has count above threshold but statRep=false.
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 1.0,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 3.0,
          appointmentsTotal: 10,          // above MIN_COMPLETED_APPTS
          statisticallyRepresentative: false, // but flag says not representative
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).not.toContain("CLINICIAN_FOLLOWUP_DROP");
  });

  it("emits CLINICIAN_FOLLOWUP_DROP when BOTH current and previous weeks are sample-sound", async () => {
    // Both weeks sound; drop 66% (3.0 -> 1.0) exceeds default 10% threshold.
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 1.0,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 3.0,
          appointmentsTotal: 10,
          statisticallyRepresentative: true,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const writtenTypes = (db._written as Record<string, unknown>[]).map((e) => e.type);
    expect(writtenTypes).toContain("CLINICIAN_FOLLOWUP_DROP");
  });

  it("sampleSize on CLINICIAN_FOLLOWUP_DROP reflects the smaller of the two weeks when both are sound", async () => {
    // Current: 12 appts. Previous: 10 appts. Smaller = 10.
    const db = makeMockDb({
      clinicians: [{ id: "c1", name: "Alice" }],
      metrics: [
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-09",
          followUpRate: 1.0,
          appointmentsTotal: 12,
          statisticallyRepresentative: true,
        }),
        makeMetric({
          clinicianId: "c1",
          weekStart: "2026-06-02",
          followUpRate: 3.0,
          appointmentsTotal: 10,
          statisticallyRepresentative: true,
        }),
      ],
    });

    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "CLINICIAN_FOLLOWUP_DROP");
    expect(event).toBeDefined();
    // sampleSize must be the smaller of the two weeks (10), not the current week only (12)
    expect(event!.sampleSize).toBe(10);
  });
});

// ── P0-8: phantom "undefined" clinician bucket in REVENUE_LEAK ───────────────

describe("P0-8: phantom undefined clinicianId guard in REVENUE_LEAK_DETECTED", () => {
  it("does not create a phantom clinician bucket when clinicianId is undefined", async () => {
    // Patient whose clinicianId is JS undefined (will arrive as null/undefined from Firestore)
    const lastSession = new Date();
    lastSession.setDate(lastSession.getDate() - 10);
    const patients = [
      {
        id: "p-no-clinician",
        clinicianId: undefined,
        discharged: false,
        lastSessionDate: lastSession.toISOString(),
        sessionCount: 3,
        nextSessionDate: null,
      },
    ];

    const db = makeMockDb({ patients });
    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "REVENUE_LEAK_DETECTED");
    if (event) {
      const meta = event.metadata as Record<string, unknown>;
      const caseloadMap = meta.caseloadByClinician as Record<string, unknown> ?? {};
      const dropoutMap = meta.byClinician as Record<string, unknown> ?? {};
      // "undefined" and "null" must not be keys
      expect(Object.keys(caseloadMap)).not.toContain("undefined");
      expect(Object.keys(caseloadMap)).not.toContain("null");
      expect(Object.keys(dropoutMap)).not.toContain("undefined");
      expect(Object.keys(dropoutMap)).not.toContain("null");
    }
  });

  it("does not create a phantom clinician bucket when clinicianId is the string 'undefined'", async () => {
    const lastSession = new Date();
    lastSession.setDate(lastSession.getDate() - 10);
    const patients = [
      {
        id: "p-string-undefined",
        clinicianId: "undefined",  // literal string "undefined" from bad coercion
        discharged: false,
        lastSessionDate: lastSession.toISOString(),
        sessionCount: 3,
        nextSessionDate: null,
      },
    ];

    const db = makeMockDb({ patients });
    await detectInsightEvents(db as any, "clinic-test");

    const event = (db._written as Record<string, unknown>[]).find((e) => e.type === "REVENUE_LEAK_DETECTED");
    if (event) {
      const meta = event.metadata as Record<string, unknown>;
      const caseloadMap = meta.caseloadByClinician as Record<string, unknown> ?? {};
      const dropoutMap = meta.byClinician as Record<string, unknown> ?? {};
      expect(Object.keys(caseloadMap)).not.toContain("undefined");
      expect(Object.keys(dropoutMap)).not.toContain("undefined");
    }
  });
});
