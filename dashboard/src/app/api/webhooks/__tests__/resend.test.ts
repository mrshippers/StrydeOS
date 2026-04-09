/**
 * Tests for POST /api/webhooks/resend
 *
 * Resend sends delivery event webhooks to this endpoint.
 * Events we handle:
 *   email.opened  → set openedAt on comms_log entry
 *   email.clicked → set clickedAt on comms_log entry
 *   email.delivered → set outcome = "delivered"
 *   email.bounced / email.complained → set outcome = "send_failed"
 *
 * Resend sends JSON body with { type, data: { email_id, ... } }
 * We match by correlating the email_id stored in comms_log.twilioSid / resendId.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (fn: unknown) => fn,
}));

function makeDb(commsLogEntry?: Record<string, unknown> | null) {
  const updateImpl = vi.fn().mockResolvedValue(undefined);
  const querySnap = {
    empty: !commsLogEntry,
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

async function makeRequest(body: Record<string, unknown>, clinicId = "clinic-1") {
  return new NextRequest(
    `http://localhost/api/webhooks/resend?clinicId=${clinicId}`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("sets openedAt when event is email.opened", async () => {
    const { db, updateImpl } = makeDb({ outcome: "no_action", resendId: "re_abc123" });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest({
      type: "email.opened",
      data: { email_id: "re_abc123", opened_at: "2026-04-09T10:00:00Z" },
    });

    const { POST } = await import("../resend/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(updateImpl).toHaveBeenCalledWith(
      expect.objectContaining({ openedAt: "2026-04-09T10:00:00Z" }),
    );
  });

  it("sets clickedAt when event is email.clicked", async () => {
    const { db, updateImpl } = makeDb({ outcome: "no_action", resendId: "re_abc123" });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest({
      type: "email.clicked",
      data: { email_id: "re_abc123", clicked_at: "2026-04-09T10:05:00Z" },
    });

    const { POST } = await import("../resend/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(updateImpl).toHaveBeenCalledWith(
      expect.objectContaining({ clickedAt: "2026-04-09T10:05:00Z" }),
    );
  });

  it("sets outcome to 'delivered' when event is email.delivered", async () => {
    const { db, updateImpl } = makeDb({ outcome: "no_action", resendId: "re_abc123" });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest({
      type: "email.delivered",
      data: { email_id: "re_abc123" },
    });

    const { POST } = await import("../resend/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(updateImpl).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "delivered" }),
    );
  });

  it("sets outcome to 'send_failed' when event is email.bounced", async () => {
    const { db, updateImpl } = makeDb({ outcome: "no_action", resendId: "re_abc123" });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest({
      type: "email.bounced",
      data: { email_id: "re_abc123" },
    });

    const { POST } = await import("../resend/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(updateImpl).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "send_failed" }),
    );
  });

  it("returns 200 silently for unrecognised event types", async () => {
    const { db, updateImpl } = makeDb({ outcome: "no_action" });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest({ type: "contact.created", data: {} });
    const { POST } = await import("../resend/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(updateImpl).not.toHaveBeenCalled();
  });

  it("returns 200 when no matching comms_log entry found (idempotent)", async () => {
    const { db, updateImpl } = makeDb(null);
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest({
      type: "email.opened",
      data: { email_id: "re_NOT_FOUND" },
    });

    const { POST } = await import("../resend/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(updateImpl).not.toHaveBeenCalled();
  });

  it("returns 400 when clinicId is missing", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/resend", {
      method: "POST",
      body: JSON.stringify({ type: "email.opened", data: { email_id: "re_abc" } }),
      headers: { "Content-Type": "application/json" },
    });

    const { POST } = await import("../resend/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
