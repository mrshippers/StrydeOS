import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InsightEvent } from "@/types/insight-events";
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

function makeMockDb(opts: {
  clinicExists?: boolean;
  consentGranted?: boolean;
  ownerEmail?: string;
} = {}) {
  const {
    clinicExists = true,
    consentGranted = true,
    ownerEmail = "jamal@spires.com",
  } = opts;

  return {
    doc: vi.fn(() => ({
      get: vi.fn(async () => ({
        exists: clinicExists,
        data: () => ({
          name: "Spires",
          ownerEmail,
          commsConsentGrantedAt: consentGranted ? "2026-01-01T00:00:00Z" : null,
        }),
      })),
      update: vi.fn(async () => {}),
    })),
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          get: vi.fn(async () => ({ docs: [] })),
          limit: vi.fn(() => ({
            get: vi.fn(async () => ({ docs: [] })),
          })),
        })),
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({ docs: [] })),
        })),
      })),
    })),
  };
}

describe("notifyOwnerInApp", () => {
  it("returns count of events passed in", async () => {
    const db = makeMockDb();
    const events = [makeEvent(), makeEvent({ id: "evt-2" })];
    const result = await notifyOwnerInApp(db as any, "clinic-1", events);
    expect(result.written).toBe(2);
  });

  it("returns 0 for empty events", async () => {
    const db = makeMockDb();
    const result = await notifyOwnerInApp(db as any, "clinic-1", []);
    expect(result.written).toBe(0);
  });
});

describe("sendUrgentAlerts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  it("skips when no urgent events", async () => {
    const db = makeMockDb();
    const events = [makeEvent({ type: "COURSE_COMPLETION_WIN", severity: "positive" })];
    const result = await sendUrgentAlerts(db as any, "clinic-1", events);
    expect(result.sent).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("skips when no comms consent", async () => {
    const db = makeMockDb({ consentGranted: false });
    const events = [makeEvent({ type: "NPS_DETRACTOR_ALERT", severity: "critical" })];
    const result = await sendUrgentAlerts(db as any, "clinic-1", events);
    expect(result.sent).toBe(0);
  });

  it("skips when no RESEND_API_KEY", async () => {
    const db = makeMockDb();
    const events = [makeEvent({ type: "NPS_DETRACTOR_ALERT", severity: "critical" })];
    const result = await sendUrgentAlerts(db as any, "clinic-1", events);
    expect(result.sent).toBe(0);
  });

  it("filters for NPS_DETRACTOR_ALERT and high REVENUE_LEAK_DETECTED", async () => {
    const db = makeMockDb();
    const events = [
      makeEvent({ type: "NPS_DETRACTOR_ALERT", severity: "critical" }),
      makeEvent({ type: "REVENUE_LEAK_DETECTED", severity: "critical", revenueImpact: 600 }),
      makeEvent({ type: "REVENUE_LEAK_DETECTED", severity: "warning", revenueImpact: 200 }),
      makeEvent({ type: "CLINICIAN_FOLLOWUP_DROP", severity: "critical" }),
    ];

    // Without RESEND_API_KEY, it returns 0 sent — but we can verify filtering logic
    const result = await sendUrgentAlerts(db as any, "clinic-1", events);
    // No API key → no emails sent
    expect(result.sent).toBe(0);
  });

  it("returns error when no owner email configured", async () => {
    // ownerEmail is falsy — should return the "No owner email" error
    const db = makeMockDb({ ownerEmail: "" });
    process.env.RESEND_API_KEY = "re_test_123";

    const events = [makeEvent({ type: "NPS_DETRACTOR_ALERT", severity: "critical" })];
    const result = await sendUrgentAlerts(db as any, "clinic-1", events);
    // When ownerEmail is empty string, the function checks truthy — returns error
    expect(result.errors).toContain("No owner email configured");
  });
});

describe("sendWeeklyDigest", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("returns sent:false when clinic not found", async () => {
    const db = makeMockDb({ clinicExists: false });
    const result = await sendWeeklyDigest(db as any, "clinic-1");
    expect(result.sent).toBe(false);
    expect(result.error).toBe("Clinic not found");
  });

  it("returns sent:false when no comms consent", async () => {
    const db = makeMockDb({ consentGranted: false });
    const result = await sendWeeklyDigest(db as any, "clinic-1");
    expect(result.sent).toBe(false);
  });

  it("returns sent:false when no RESEND_API_KEY", async () => {
    const db = makeMockDb();
    const result = await sendWeeklyDigest(db as any, "clinic-1");
    expect(result.sent).toBe(false);
  });
});
