/**
 * Tests for POST /api/webhooks/twilio
 *
 * Twilio sends delivery status callbacks to this endpoint.
 * The endpoint finds the matching comms_log entry by SID and updates outcome.
 *
 * Delivery statuses Twilio sends:
 *   delivered  → outcome = "delivered"
 *   undelivered / failed → outcome = "send_failed"
 *   sent / queued / sending → no update (still in-flight)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (fn: unknown) => fn,
}));

// Twilio SDK — default to a passing signature so existing tests don't need to mock it
const mockValidateRequest = vi.fn().mockReturnValue(true);
vi.mock("twilio", () => ({
  default: { validateRequest: mockValidateRequest },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTwilioBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function makeDb(commsLogEntry?: Record<string, unknown> | null) {
  const updateImpl = vi.fn().mockResolvedValue(undefined);
  const querySnap = {
    empty: commsLogEntry === null || commsLogEntry === undefined,
    docs: commsLogEntry
      ? [{ ref: { update: updateImpl }, data: () => commsLogEntry }]
      : [],
  };

  const collectionRef = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(querySnap),
  };

  const clinicDocRef = { collection: vi.fn().mockReturnValue(collectionRef) };
  const clinicsColRef = { doc: vi.fn().mockReturnValue(clinicDocRef) };
  const db = { collection: vi.fn().mockReturnValue(clinicsColRef) };

  return { db, updateImpl };
}

async function makeRequest(body: Record<string, string>, clinicId = "clinic-1") {
  return new NextRequest(
    `http://localhost/api/webhooks/twilio?clinicId=${clinicId}`,
    {
      method: "POST",
      body: makeTwilioBody(body),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );
}

describe("POST /api/webhooks/twilio", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
    mockValidateRequest.mockReturnValue(true);
  });

  it("sets outcome to 'delivered' when MessageStatus is delivered", async () => {
    const { db, updateImpl } = makeDb({ outcome: "no_action" });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest({
      MessageSid: "SM123",
      MessageStatus: "delivered",
      To: "+447700900001",
    });

    const { POST } = await import("../twilio/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(updateImpl).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "delivered" }),
    );
  });

  it("sets outcome to 'send_failed' when MessageStatus is undelivered", async () => {
    const { db, updateImpl } = makeDb({ outcome: "no_action" });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest({ MessageSid: "SM123", MessageStatus: "undelivered" });
    const { POST } = await import("../twilio/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(updateImpl).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "send_failed" }),
    );
  });

  it("sets outcome to 'send_failed' when MessageStatus is failed", async () => {
    const { db, updateImpl } = makeDb({ outcome: "no_action" });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest({ MessageSid: "SM123", MessageStatus: "failed" });
    const { POST } = await import("../twilio/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(updateImpl).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "send_failed" }),
    );
  });

  it("does nothing (no update) for in-flight statuses (sent, queued, sending)", async () => {
    const { db, updateImpl } = makeDb({ outcome: "no_action" });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    for (const status of ["sent", "queued", "sending"]) {
      vi.clearAllMocks();
      vi.mocked(getAdminDb).mockReturnValue(db as never);
      const req = await makeRequest({ MessageSid: "SM123", MessageStatus: status });
      const { POST } = await import("../twilio/route");
      await POST(req);
      expect(updateImpl).not.toHaveBeenCalled();
    }
  });

  it("returns 200 when no matching comms_log entry found (idempotent)", async () => {
    const { db, updateImpl } = makeDb(null); // empty snap
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest({ MessageSid: "SM-UNKNOWN", MessageStatus: "delivered" });
    const { POST } = await import("../twilio/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(updateImpl).not.toHaveBeenCalled();
  });

  it("returns 400 when clinicId is missing from query params", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/twilio", {
      method: "POST",
      body: makeTwilioBody({ MessageSid: "SM123", MessageStatus: "delivered" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const { POST } = await import("../twilio/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when MessageSid is missing", async () => {
    const req = await makeRequest({ MessageStatus: "delivered" });
    const { POST } = await import("../twilio/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 when Twilio signature is invalid", async () => {
    mockValidateRequest.mockReturnValueOnce(false);
    const { db } = makeDb({ outcome: "no_action" });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest({ MessageSid: "SM123", MessageStatus: "delivered" });
    const { POST } = await import("../twilio/route");
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 500 when TWILIO_AUTH_TOKEN is not set", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const req = await makeRequest({ MessageSid: "SM123", MessageStatus: "delivered" });
    const { POST } = await import("../twilio/route");
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
