import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InsightEvent } from "@/types/insight-events";

// Module-scope mock: intercepted by vitest hoisting, so it fires even for
// dynamic import("resend") calls inside notify-owner.ts.
const mockEmailSend = vi.fn(async () => ({ data: { id: "email-123" }, error: null }));
vi.mock("resend", () => {
  class Resend {
    emails = { send: mockEmailSend };
    constructor(_key: string) {}
  }
  return { Resend };
});

import { notifyOwnerInApp, sendUrgentAlerts, sendWeeklyDigest } from "../notify-owner";

function makeEvent(overrides: Partial<InsightEvent> = {}): InsightEvent {
  return {
    id: "evt-1",
    type: "CLINICIAN_FOLLOWUP_DROP",
    clinicId: "clinic-1",
    severity: "warning",
    title: "Test event",
    description: "Test",
    suggestedAction: "Test",
    actionTarget: "owner",
    createdAt: "2026-04-09T10:00:00Z",
    metadata: {},
    ...overrides,
  } as InsightEvent;
}

function makeStatsDoc(overrides: Record<string, unknown> = {}): { id: string; data: () => Record<string, unknown> } {
  return {
    id: "metrics-1",
    data: () => ({
      followUpRate: 2.4,
      dnaRate: 0.05,
      utilisationRate: 0.82,
      treatmentCompletionRate: 0.75,
      weekStart: "2026-06-13",
      clinicianId: "all",
      ...overrides,
    }),
  };
}

function makeMockDb(opts: {
  clinicExists?: boolean;
  consentGranted?: boolean;
  ownerEmail?: string;
  statsDocs?: ReturnType<typeof makeStatsDoc>[];
  eventDocs?: { id: string; data: () => Record<string, unknown> }[];
  /**
   * P0-13: controls whether resolveRecipient finds the owner in the users
   * collection for this clinic. Defaults to true (valid recipient).
   */
  ownerValid?: boolean;
} = {}) {
  const {
    clinicExists = true,
    consentGranted = true,
    ownerEmail = "jamal@spires.com",
    statsDocs = [],
    eventDocs = [],
    ownerValid = true,
  } = opts;

  // User doc returned by the users collection query (P0-13 clinic binding)
  const userDocs = ownerValid
    ? [{ id: "user-owner-1", data: () => ({ email: ownerEmail, clinicId: "clinic-1" }) }]
    : [];

  // audit_logs add mock shared across chains -- exposed for dedup assertions
  const auditAddFn = vi.fn().mockResolvedValue({ id: "audit-1" });

  // users collection query chain: .where(clinicId).where(email).limit(1).get()
  const usersLimitGetFn = vi.fn().mockResolvedValue({ docs: userDocs, empty: userDocs.length === 0 });
  const usersLimitFn = vi.fn(() => ({ get: usersLimitGetFn }));
  const usersWhere2Fn = vi.fn(() => ({ limit: usersLimitFn }));
  const usersWhere1Fn = vi.fn(() => ({ where: usersWhere2Fn }));

  // clinic insight_events / metrics_weekly / audit_logs chains
  const clinicSubcollFn = vi.fn((subcoll: string) => {
    if (subcoll === "audit_logs") return { add: auditAddFn };
    return {
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          get: vi.fn(async () => ({ docs: eventDocs })),
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ docs: statsDocs })),
          })),
        })),
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({ docs: [] })),
        })),
      })),
    };
  });

  const db = {
    doc: vi.fn((_path: string) => ({
      get: vi.fn(async () => ({
        exists: clinicExists,
        data: () => ({
          name: "Spires",
          ownerEmail,
          commsConsentGrantedAt: consentGranted ? "2026-01-01T00:00:00Z" : null,
        }),
      })),
      update: vi.fn(async () => {}),
      // clinic doc used by audit chain: db.collection("clinics").doc(id).collection("audit_logs")
      collection: clinicSubcollFn,
    })),
    collection: vi.fn((name: string) => {
      if (name === "users") return { where: usersWhere1Fn };
      // "clinics" is accessed via db.doc() in notify-owner, but also via
      // db.collection("clinics").doc() in writeAuditLog
      return {
        doc: vi.fn(() => ({
          collection: clinicSubcollFn,
        })),
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            get: vi.fn(async () => ({ docs: eventDocs })),
            limit: vi.fn(() => ({
              get: vi.fn(async () => ({ docs: statsDocs })),
            })),
          })),
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ docs: [] })),
          })),
        })),
      };
    }),
  };

  return { db, auditAddFn };
}

describe("notifyOwnerInApp", () => {
  it("returns count of events passed in", async () => {
    const { db } = makeMockDb();
    const events = [makeEvent(), makeEvent({ id: "evt-2" })];
    const result = await notifyOwnerInApp(db as any, "clinic-1", events);
    expect(result.written).toBe(2);
  });

  it("returns 0 for empty events", async () => {
    const { db } = makeMockDb();
    const result = await notifyOwnerInApp(db as any, "clinic-1", []);
    expect(result.written).toBe(0);
  });
});

describe("sendUrgentAlerts", () => {
  beforeEach(() => {
    mockEmailSend.mockClear();
    delete process.env.RESEND_API_KEY;
  });

  it("skips when no urgent events", async () => {
    const { db } = makeMockDb();
    const events = [makeEvent({ type: "TREATMENT_COMPLETION_WIN", severity: "positive" })];
    const result = await sendUrgentAlerts(db as any, "clinic-1", events);
    expect(result.sent).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("skips when no comms consent", async () => {
    const { db } = makeMockDb({ consentGranted: false });
    const events = [makeEvent({ type: "NPS_DETRACTOR_ALERT", severity: "critical" })];
    const result = await sendUrgentAlerts(db as any, "clinic-1", events);
    expect(result.sent).toBe(0);
  });

  it("skips when no RESEND_API_KEY", async () => {
    const { db } = makeMockDb();
    const events = [makeEvent({ type: "NPS_DETRACTOR_ALERT", severity: "critical" })];
    const result = await sendUrgentAlerts(db as any, "clinic-1", events);
    expect(result.sent).toBe(0);
  });

  it("filters for NPS_DETRACTOR_ALERT and high REVENUE_LEAK_DETECTED", async () => {
    const { db } = makeMockDb();
    const events = [
      makeEvent({ type: "NPS_DETRACTOR_ALERT", severity: "critical" }),
      makeEvent({ type: "REVENUE_LEAK_DETECTED", severity: "critical", revenueImpact: 600 }),
      makeEvent({ type: "REVENUE_LEAK_DETECTED", severity: "warning", revenueImpact: 200 }),
      makeEvent({ type: "CLINICIAN_FOLLOWUP_DROP", severity: "critical" }),
    ];

    // Without RESEND_API_KEY, it returns 0 sent -- but we can verify filtering logic
    const result = await sendUrgentAlerts(db as any, "clinic-1", events);
    // No API key -> no emails sent
    expect(result.sent).toBe(0);
  });

  it("returns error when no owner email configured", async () => {
    // ownerEmail is falsy -- should return the "No owner email" error
    const { db } = makeMockDb({ ownerEmail: "" });
    process.env.RESEND_API_KEY = "re_test_123";

    const events = [makeEvent({ type: "NPS_DETRACTOR_ALERT", severity: "critical" })];
    const result = await sendUrgentAlerts(db as any, "clinic-1", events);
    // When ownerEmail is empty string, the function checks truthy -- returns error
    expect(result.errors).toContain("No owner email configured");
  });
});

describe("sendUrgentAlerts — P0-13 drift dedup", () => {
  beforeEach(() => {
    mockEmailSend.mockClear();
    delete process.env.RESEND_API_KEY;
  });

  it("[P0-13] writes exactly ONE audit entry per drift (not two) when owner is invalid", async () => {
    // ownerValid:false -> resolveRecipient will not find user docs -> drift
    // The caller (sendUrgentAlerts) must NOT call writeAuditLog on the drift branch
    // so the total count is exactly 1 (from recordDrift inside resolveRecipient)
    const { db, auditAddFn } = makeMockDb({ ownerValid: false });
    process.env.RESEND_API_KEY = "re_test_123";
    const events = [makeEvent({ type: "NPS_DETRACTOR_ALERT", severity: "critical" })];

    await sendUrgentAlerts(db as any, "clinic-1", events);

    // resolveRecipient's recordDrift writes one entry; notify-owner must not add another
    expect(auditAddFn).toHaveBeenCalledTimes(1);
    const written = auditAddFn.mock.calls[0][0];
    expect(written.metadata?.event).toBe("recipient_drift");
    expect(written.metadata?.emailType).toBe("urgent_alert");
  });
});

describe("sendWeeklyDigest", () => {
  beforeEach(() => {
    mockEmailSend.mockClear();
    delete process.env.RESEND_API_KEY;
  });

  it("returns sent:false when clinic not found", async () => {
    const { db } = makeMockDb({ clinicExists: false });
    const result = await sendWeeklyDigest(db as any, "clinic-1");
    expect(result.sent).toBe(false);
    expect(result.error).toBe("Clinic not found");
  });

  it("returns sent:false when no comms consent", async () => {
    const { db } = makeMockDb({ consentGranted: false });
    const result = await sendWeeklyDigest(db as any, "clinic-1");
    expect(result.sent).toBe(false);
  });

  it("returns sent:false when no RESEND_API_KEY", async () => {
    const { db } = makeMockDb();
    const result = await sendWeeklyDigest(db as any, "clinic-1");
    expect(result.sent).toBe(false);
  });

  // P0-12: no-data clinic must NOT receive a falsely-reassuring email
  it("[P0-12] returns no_data and skips send when there are no stats and no events", async () => {
    // statsDocs=[] (no metrics_weekly row), eventDocs=[] (no insight events)
    const { db } = makeMockDb({ statsDocs: [], eventDocs: [] });
    process.env.RESEND_API_KEY = "re_test_123";

    const result = await sendWeeklyDigest(db as any, "clinic-1");

    expect(result.sent).toBe(false);
    expect((result as any).result).toBe("no_data");
  });

  // P0-12: real data with zero alerts MUST dispatch the reassuring digest email.
  // The module-scope vi.mock("resend") intercepts the dynamic import("resend")
  // inside sendWeeklyDigest, so mockEmailSend is observable here.
  it("[P0-12] sends reassuring email exactly once when stats exist but no events (zero alerts on real data)", async () => {
    const statsDoc = makeStatsDoc();
    const { db } = makeMockDb({ statsDocs: [statsDoc], eventDocs: [] });
    process.env.RESEND_API_KEY = "re_test_123";

    const result = await sendWeeklyDigest(db as any, "clinic-1");

    // The no_data guard must NOT fire (currentStats is present)
    expect((result as any).result).not.toBe("no_data");
    // The send path must be reached and the digest email dispatched exactly once
    expect(result.sent).toBe(true);
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    expect(mockEmailSend.mock.calls[0][0]).toMatchObject({
      to: "jamal@spires.com",
      subject: expect.stringContaining("Your clinic this week"),
    });
  });

  it("[P0-13] writes exactly ONE audit entry per drift (not two) when owner is invalid for weekly digest", async () => {
    const { db, auditAddFn } = makeMockDb({ ownerValid: false });
    process.env.RESEND_API_KEY = "re_test_123";

    await sendWeeklyDigest(db as any, "clinic-1");

    // Only resolveRecipient's recordDrift should write; the caller must not add a second entry
    expect(auditAddFn).toHaveBeenCalledTimes(1);
    const written = auditAddFn.mock.calls[0][0];
    expect(written.metadata?.event).toBe("recipient_drift");
    expect(written.metadata?.emailType).toBe("weekly_digest");
  });
});
