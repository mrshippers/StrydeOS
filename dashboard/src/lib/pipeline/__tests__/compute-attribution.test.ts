import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeAttribution } from "../compute-attribution";

// ── Firestore mock ───────────────────────────────────────────────────────

function createMockDb(opts: {
  appointments?: Record<string, unknown>[];
  commsLogs?: Record<string, unknown>[];
} = {}) {
  const appointments = opts.appointments ?? [];
  const commsLogs = opts.commsLogs ?? [];
  const updates: Array<{ path: string; data: Record<string, unknown> }> = [];

  const clinicRef = {
    collection: vi.fn((name: string) => {
      if (name === "appointments") {
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                docs: appointments.map((a, i) => ({
                  id: a.id ?? `appt-${i}`,
                  data: () => a,
                })),
              })),
            })),
          })),
        };
      }
      if (name === "comms_log") {
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              get: vi.fn(async () => ({
                docs: commsLogs.map((c, i) => ({
                  id: c.id ?? `comms-${i}`,
                  data: () => c,
                })),
              })),
            })),
          })),
          doc: vi.fn((id: string) => ({
            set: vi.fn(async (data: Record<string, unknown>, _opts: unknown) => {
              updates.push({ path: `comms_log/${id}`, data });
            }),
          })),
        };
      }
      return { where: vi.fn(() => ({ get: vi.fn(async () => ({ docs: [] })) })) };
    }),
  };

  const db = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => clinicRef),
    })),
    _updates: updates,
  };

  return db;
}

describe("computeAttribution", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns ok=true and count=0 when no appointments match", async () => {
    const db = createMockDb({ appointments: [], commsLogs: [] });
    const result = await computeAttribution(db as any, "clinic-1");

    expect(result.ok).toBe(true);
    expect(result.count).toBe(0);
    expect(result.stage).toBe("compute-attribution");
  });

  it("attributes booked appointment to most recent qualifying comms_log (last-touch)", async () => {
    const db = createMockDb({
      appointments: [
        {
          id: "appt-1",
          patientId: "patient-1",
          dateTime: "2026-04-08T10:00:00Z",
          status: "scheduled",
          revenueAmountPence: 7500,
          updatedAt: "2026-04-07T10:00:00Z",
        },
      ],
      commsLogs: [
        {
          id: "comms-old",
          patientId: "patient-1",
          outcome: "sent",
          patientLifecycleStateAtSend: "AT_RISK",
          sentAt: "2026-04-01T10:00:00Z",
          attributionWindowDays: 14,
        },
        {
          id: "comms-recent",
          patientId: "patient-1",
          outcome: "sent",
          patientLifecycleStateAtSend: "LAPSED",
          sentAt: "2026-04-05T10:00:00Z",
          attributionWindowDays: 14,
        },
      ],
    });

    const result = await computeAttribution(db as any, "clinic-1");

    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    // Should attribute to the most recent one (comms-recent)
    expect(db._updates).toHaveLength(1);
    expect(db._updates[0].path).toBe("comms_log/comms-recent");
    expect(db._updates[0].data.outcome).toBe("booked");
    expect(db._updates[0].data.attributedRevenuePence).toBe(7500);
  });

  it("only attributes when lifecycle state is AT_RISK, LAPSED, or RE_ENGAGED", async () => {
    const db = createMockDb({
      appointments: [
        {
          id: "appt-1",
          patientId: "patient-1",
          dateTime: "2026-04-08T10:00:00Z",
          status: "completed",
          revenueAmountPence: 7500,
          updatedAt: "2026-04-07T10:00:00Z",
        },
      ],
      commsLogs: [
        {
          id: "comms-active",
          patientId: "patient-1",
          outcome: "sent",
          patientLifecycleStateAtSend: "ACTIVE",
          sentAt: "2026-04-05T10:00:00Z",
          attributionWindowDays: 14,
        },
      ],
    });

    const result = await computeAttribution(db as any, "clinic-1");

    expect(result.count).toBe(0);
    expect(db._updates).toHaveLength(0);
  });

  it("excludes pre_auth_collection entries (attributionWindowDays=null)", async () => {
    const db = createMockDb({
      appointments: [
        {
          id: "appt-1",
          patientId: "patient-1",
          dateTime: "2026-04-08T10:00:00Z",
          status: "scheduled",
          revenueAmountPence: 7500,
          updatedAt: "2026-04-07T10:00:00Z",
        },
      ],
      commsLogs: [
        {
          id: "comms-preauth",
          patientId: "patient-1",
          outcome: "sent",
          patientLifecycleStateAtSend: "AT_RISK",
          sentAt: "2026-04-05T10:00:00Z",
          attributionWindowDays: null,
        },
      ],
    });

    const result = await computeAttribution(db as any, "clinic-1");

    expect(result.count).toBe(0);
    expect(db._updates).toHaveLength(0);
  });

  it("returns ok=false with error when Firestore fails", async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                get: vi.fn(async () => { throw new Error("Firestore unavailable"); }),
              })),
            })),
          })),
        })),
      })),
    };

    const result = await computeAttribution(db as any, "clinic-1");

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Firestore unavailable");
  });
});
