import { describe, it, expect, vi } from "vitest";
import { run as runList } from "../tools/appointments/list";
import { run as runDropOff } from "../tools/appointments/follow-up-drop-off";
import type { ToolContext } from "../types";

/**
 * Regression tests for the canonical appointment field shape.
 *
 * The bug: the MCP appointment tools queried `startTime`, but the pipeline,
 * dashboard and seeds all write `dateTime`. The query matched zero docs for
 * clinic-spires despite 1,522 real appointments. These tests pin the tools to
 * the canonical `dateTime` field and assert they read canonical-shaped docs.
 */

interface FakeDoc {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Minimal Firestore query fake that records the field used in where()/orderBy()
 * and returns the seeded docs (already filtered by the test data).
 */
function createApptDb(docs: FakeDoc[]) {
  const calls = { whereFields: [] as string[], orderByFields: [] as string[] };

  const makeQuery = (): any => ({
    where: vi.fn((field: string) => {
      calls.whereFields.push(field);
      return makeQuery();
    }),
    orderBy: vi.fn((field: string) => {
      calls.orderByFields.push(field);
      return makeQuery();
    }),
    limit: vi.fn(() => makeQuery()),
    startAfter: vi.fn(() => makeQuery()),
    get: vi.fn(async () => ({
      empty: docs.length === 0,
      docs: docs.map((d) => ({
        id: d.id,
        ref: { path: `clinics/clinic-spires/appointments/${d.id}` },
        data: () => d.data,
      })),
    })),
  });

  const db = {
    collection: vi.fn(() => makeQuery()),
    doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })),
    _calls: calls,
  };
  return db;
}

function ctx(db: unknown): ToolContext {
  return {
    clinicId: "clinic-spires",
    role: "superadmin",
    db: db as ToolContext["db"],
    env: {},
  };
}

const nowIso = new Date().toISOString();
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("appointments_list reads the canonical dateTime field", () => {
  it("queries on `dateTime`, not `startTime`", async () => {
    const db = createApptDb([
      {
        id: "appt-1",
        data: {
          dateTime: nowIso,
          clinicianId: "c-andrew",
          patientId: "p-1",
          appointmentType: "initial_assessment",
          status: "completed",
          durationMinutes: 45,
        },
      },
    ]);

    const result = await runList(ctx(db), { days_back: 7, limit: 25, cursor: null });

    expect(db._calls.whereFields).toContain("dateTime");
    expect(db._calls.orderByFields).toContain("dateTime");
    expect(db._calls.whereFields).not.toContain("startTime");
    expect(result.data.count).toBe(1);
    expect(result.data.appointments[0].dateTime).toBe(nowIso);
    expect(result.data.breakdown.initial).toBe(1);
  });

  it("returns null dateTime when the field is absent (no throw)", async () => {
    const db = createApptDb([
      { id: "appt-2", data: { clinicianId: "c-max", patientId: "p-2" } },
    ]);
    const result = await runList(ctx(db), { days_back: 7, limit: 25, cursor: null });
    expect(result.data.appointments[0].dateTime).toBeNull();
  });
});

describe("appointments_follow_up_drop_off reads the canonical dateTime field", () => {
  it("queries on `dateTime` and links an initial to a follow-up within the window", async () => {
    const initialIso = daysAgoIso(20);
    const followUpIso = daysAgoIso(6);

    const db = createApptDb([
      {
        id: "init-1",
        data: {
          dateTime: initialIso,
          clinicianId: "c-andrew",
          patientId: "p-1",
          appointmentType: "initial_assessment",
        },
      },
      {
        id: "fu-1",
        data: {
          dateTime: followUpIso,
          clinicianId: "c-andrew",
          patientId: "p-1",
          appointmentType: "follow_up",
        },
      },
    ]);

    const result = await runDropOff(ctx(db), {
      weeks_back: 8,
      follow_up_window_weeks: 6,
    });

    expect(db._calls.whereFields).toContain("dateTime");
    expect(db._calls.whereFields).not.toContain("startTime");
    expect(result.data.totals.initials).toBe(1);
    expect(result.data.totals.withFollowUp).toBe(1);
    expect(result.data.totals.dropOffRate).toBe(0);
  });

  it("counts an initial with no follow-up as a drop-off", async () => {
    const db = createApptDb([
      {
        id: "init-2",
        data: {
          dateTime: daysAgoIso(10),
          clinicianId: "c-max",
          patientId: "p-9",
          appointmentType: "initial_assessment",
        },
      },
    ]);

    const result = await runDropOff(ctx(db), {
      weeks_back: 8,
      follow_up_window_weeks: 6,
    });

    expect(result.data.totals.initials).toBe(1);
    expect(result.data.totals.withFollowUp).toBe(0);
    expect(result.data.totals.dropOffRate).toBe(1);
  });
});
