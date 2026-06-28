/**
 * Ava SMS senders must be observable and must propagate failures.
 *
 * Bug (harness #5 + #9): sendBookingAcknowledgement and sendCallbackNotification
 * discarded the Twilio MessageSid, wrote NO comms_log, registered NO
 * statusCallback, and swallowed every error in a bare `catch {}`. A failed
 * patient-promised confirmation vanished with zero trace — and because the
 * senders never threw, the webhook's exactly-once release-and-retry guard
 * (elevenlabs/route.ts) was dead code. These tests pin the observable-send
 * contract: a comms_log row on BOTH outcomes, a registered statusCallback, and
 * a re-throw on a Twilio failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: vi.fn() }));
vi.mock("@/lib/twilio", () => ({
  getTwilio: vi.fn(),
  getSmsSender: vi.fn(() => "StrydeOS"),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const CLINIC_ID = "clinic-spires";

function makeDb(opts: { exists?: boolean; data?: Record<string, unknown> } = {}) {
  const commsLogAdds: Record<string, unknown>[] = [];
  const commsLogCol = {
    add: vi.fn(async (d: Record<string, unknown>) => {
      commsLogAdds.push(d);
      return { id: "log_1" };
    }),
  };
  const clinicDocRef = {
    get: vi.fn(async () => ({
      exists: opts.exists ?? true,
      data: () =>
        opts.data ?? { name: "Spires", receptionPhone: "+442079460000", phone: "+442079460000" },
    })),
    collection: vi.fn((name: string) => {
      if (name === "comms_log") return commsLogCol;
      return { doc: vi.fn(), add: vi.fn() };
    }),
  };
  const clinicsCol = { doc: vi.fn(() => clinicDocRef) };
  const db = { collection: vi.fn((name: string) => (name === "clinics" ? clinicsCol : {})) };
  return { db, commsLogAdds };
}

function makeTwilio(impl: () => Promise<{ sid: string }>) {
  return { messages: { create: vi.fn(impl) } };
}

describe("Ava notify-callback senders — observable + error-propagating (harness #5/#9)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── sendBookingAcknowledgement ─────────────────────────────────────────────

  it("sendBookingAcknowledgement writes a pending comms_log row with twilioSid and registers a statusCallback", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { getTwilio } = await import("@/lib/twilio");
    const { db, commsLogAdds } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    const tw = makeTwilio(async () => ({ sid: "SM_ack_1" }));
    vi.mocked(getTwilio).mockReturnValue(tw as never);

    const { sendBookingAcknowledgement } = await import("../notify-callback");
    await sendBookingAcknowledgement({
      clinicId: CLINIC_ID,
      callerPhone: "+447700900123",
      conversationId: "conv1",
    });

    expect(tw.messages.create).toHaveBeenCalledTimes(1);
    const arg = tw.messages.create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.statusCallback).toMatch(/\/api\/webhooks\/twilio\?clinicId=clinic-spires/);
    expect(commsLogAdds).toHaveLength(1);
    expect(commsLogAdds[0]).toMatchObject({
      channel: "sms",
      to: "+447700900123",
      outcome: "pending",
      twilioSid: "SM_ack_1",
    });
  });

  it("sendBookingAcknowledgement writes a send_failed row and re-throws when Twilio rejects", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { getTwilio } = await import("@/lib/twilio");
    const { db, commsLogAdds } = makeDb();
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    const tw = makeTwilio(async () => {
      throw new Error("carrier reject");
    });
    vi.mocked(getTwilio).mockReturnValue(tw as never);

    const { sendBookingAcknowledgement } = await import("../notify-callback");
    await expect(
      sendBookingAcknowledgement({
        clinicId: CLINIC_ID,
        callerPhone: "+447700900123",
        conversationId: "conv1",
      }),
    ).rejects.toThrow("carrier reject");

    expect(commsLogAdds).toHaveLength(1);
    expect(commsLogAdds[0]).toMatchObject({
      channel: "sms",
      to: "+447700900123",
      outcome: "send_failed",
    });
    expect(String(commsLogAdds[0].error)).toContain("carrier reject");

    const Sentry = await import("@sentry/nextjs");
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it("sendBookingAcknowledgement returns without throwing or logging when the clinic doc is missing", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { getTwilio } = await import("@/lib/twilio");
    const { db, commsLogAdds } = makeDb({ exists: false });
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    const tw = makeTwilio(async () => ({ sid: "x" }));
    vi.mocked(getTwilio).mockReturnValue(tw as never);

    const { sendBookingAcknowledgement } = await import("../notify-callback");
    await expect(
      sendBookingAcknowledgement({
        clinicId: CLINIC_ID,
        callerPhone: "+447700900123",
        conversationId: "conv1",
      }),
    ).resolves.toBeUndefined();

    expect(tw.messages.create).not.toHaveBeenCalled();
    expect(commsLogAdds).toHaveLength(0);
  });

  // ── sendCallbackNotification ───────────────────────────────────────────────

  it("sendCallbackNotification writes a pending comms_log row with twilioSid and registers a statusCallback", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { getTwilio } = await import("@/lib/twilio");
    const { db, commsLogAdds } = makeDb({ data: { name: "Spires", receptionPhone: "+442079460000" } });
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    const tw = makeTwilio(async () => ({ sid: "SM_cb_1" }));
    vi.mocked(getTwilio).mockReturnValue(tw as never);

    const { sendCallbackNotification } = await import("../notify-callback");
    await sendCallbackNotification({
      clinicId: CLINIC_ID,
      callerPhone: "+447700900123",
      callbackType: "general",
      reason: "patient in pain",
      conversationId: "conv2",
    });

    expect(tw.messages.create).toHaveBeenCalledTimes(1);
    const arg = tw.messages.create.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.statusCallback).toMatch(/\/api\/webhooks\/twilio\?clinicId=clinic-spires/);
    expect(commsLogAdds).toHaveLength(1);
    expect(commsLogAdds[0]).toMatchObject({
      channel: "sms",
      to: "+442079460000",
      outcome: "pending",
      twilioSid: "SM_cb_1",
    });
  });

  it("sendCallbackNotification writes a send_failed row and re-throws when Twilio rejects", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { getTwilio } = await import("@/lib/twilio");
    const { db, commsLogAdds } = makeDb({ data: { name: "Spires", receptionPhone: "+442079460000" } });
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    const tw = makeTwilio(async () => {
      throw new Error("balance exhausted");
    });
    vi.mocked(getTwilio).mockReturnValue(tw as never);

    const { sendCallbackNotification } = await import("../notify-callback");
    await expect(
      sendCallbackNotification({
        clinicId: CLINIC_ID,
        callerPhone: "+447700900123",
        callbackType: "general",
        reason: null,
        conversationId: "conv2",
      }),
    ).rejects.toThrow("balance exhausted");

    expect(commsLogAdds).toHaveLength(1);
    expect(commsLogAdds[0]).toMatchObject({ channel: "sms", to: "+442079460000", outcome: "send_failed" });
    expect(String(commsLogAdds[0].error)).toContain("balance exhausted");
  });

  it("sendCallbackNotification returns without throwing or logging when the clinic has no phone number", async () => {
    const { getAdminDb } = await import("@/lib/firebase-admin");
    const { getTwilio } = await import("@/lib/twilio");
    const { db, commsLogAdds } = makeDb({ data: { name: "Spires" } });
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    const tw = makeTwilio(async () => ({ sid: "x" }));
    vi.mocked(getTwilio).mockReturnValue(tw as never);

    const { sendCallbackNotification } = await import("../notify-callback");
    await expect(
      sendCallbackNotification({
        clinicId: CLINIC_ID,
        callerPhone: "+447700900123",
        callbackType: "general",
        reason: null,
        conversationId: "conv2",
      }),
    ).resolves.toBeUndefined();

    expect(tw.messages.create).not.toHaveBeenCalled();
    expect(commsLogAdds).toHaveLength(0);
  });
});
