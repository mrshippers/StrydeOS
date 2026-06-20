/**
 * Tests for transferCallToReception — P0-12 (withheld-CLI transfer must not
 * grab the wrong patient's call under concurrency).
 *
 * Behaviour under test:
 *   1. Explicit Call SID → redirect THAT exact SID, no Twilio call lookup.
 *   2. No SID, exactly one in-progress call → redirect it (legacy fallback).
 *   3. No SID, multiple in-progress calls → refuse (ambiguous_call), no redirect.
 *   4. No SID, zero in-progress calls → no active call, no redirect.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const updateMock = vi.fn().mockResolvedValue(undefined);
const callsListMock = vi.fn();
// tw.calls is callable (tw.calls(sid).update) AND has .list — model both.
const callsCallable = vi.fn().mockReturnValue({ update: updateMock }) as unknown as {
  (sid: string): { update: typeof updateMock };
  list: typeof callsListMock;
};
(callsCallable as unknown as { list: typeof callsListMock }).list = callsListMock;

vi.mock("@/lib/twilio", () => ({
  getTwilio: () => ({ calls: callsCallable }),
}));

const clinicData = {
  receptionPhone: "+442079460000",
  timezone: "Europe/London",
  ava: {
    config: { phone: "+442079461111" },
    // Keep reception hours open all day so the out-of-hours guard never fires.
    attributionConfig: { receptionStartHour: 0, receptionEndHour: 24 },
  },
};

const callLogSet = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ exists: true, data: () => clinicData }),
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({ set: callLogSet })),
        })),
      })),
    })),
  }),
}));

import { transferCallToReception } from "@/lib/ava/transfer-call";

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://portal.strydeos.com";
});

afterEach(() => {
  vi.clearAllMocks();
});

const baseReq = {
  clinicId: "clinic_001",
  callerPhone: "+447700900123",
  conversationId: "conv_abc",
  reason: "complaint",
};

describe("transferCallToReception — explicit Call SID", () => {
  it("redirects the exact SID and never queries Twilio for in-progress calls", async () => {
    const result = await transferCallToReception({ ...baseReq, callSid: "CA_explicit_999" });

    expect(result.success).toBe(true);
    // No heuristic lookup when a sid is supplied.
    expect(callsListMock).not.toHaveBeenCalled();
    // The exact supplied sid was the one redirected.
    expect(callsCallable).toHaveBeenCalledWith("CA_explicit_999");
    expect(updateMock).toHaveBeenCalledOnce();
  });
});

describe("transferCallToReception — heuristic fallback (no SID)", () => {
  it("redirects the single in-progress call when exactly one exists", async () => {
    // from+to match returns nothing (withheld CLI), broad lookup returns one.
    callsListMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ sid: "CA_only_one" }]);

    const result = await transferCallToReception({ ...baseReq });

    expect(result.success).toBe(true);
    expect(callsCallable).toHaveBeenCalledWith("CA_only_one");
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it("refuses to transfer when multiple in-progress calls exist and no SID is given", async () => {
    callsListMock
      .mockResolvedValueOnce([]) // no from+to match (withheld CLI)
      .mockResolvedValueOnce([{ sid: "CA_one" }, { sid: "CA_two" }]); // ambiguous

    const result = await transferCallToReception({ ...baseReq });

    expect(result.success).toBe(false);
    expect(result.error).toBe("ambiguous_call:no_call_sid");
    // Critically: NO call was redirected — no random patient grabbed.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns no-active-call when there are zero in-progress calls", async () => {
    callsListMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await transferCallToReception({ ...baseReq });

    expect(result.success).toBe(false);
    expect(result.error).toBe("No active call found for transfer");
    expect(updateMock).not.toHaveBeenCalled();
  });
});
