/**
 * Tests for POST /api/comms/send
 *
 * Covers the Pulse comms dispatch guarantees:
 *   - ad-hoc send to an unsubscribed patient returns 409
 *   - template with unresolved [BookingUrl] returns 422
 *   - [ClinicName] resolved from Firestore clinic doc
 *   - UK-format "07..." auto-normalised to "+44..." before Twilio
 *
 * Run: npx vitest run src/app/api/comms/send/__tests__/route.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ limited: false, remaining: 20 }),
}));

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}));

const mockVerify = vi.fn();
const mockRequireRole = vi.fn();
const mockRequireClinic = vi.fn();
vi.mock("@/lib/auth-guard", () => ({
  verifyApiRequest: (...args: unknown[]) => mockVerify(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireClinic: (...args: unknown[]) => mockRequireClinic(...args),
  handleApiError: (err: unknown) => {
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    return new Response(JSON.stringify({ error: e.message ?? "error" }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  },
}));

// Firestore mock — supports:
//   clinics/{id}                     (clinic meta doc)
//   clinics/{id}/comms_log query     (opt-out lookup + append)
//   clinics/{id}/patients/{pid}      (clinicianId denormalisation)
interface CommsLogEntry {
  patientId: string;
  outcome: string;
}

const state: {
  clinicData: Record<string, unknown> | null;
  commsLog: CommsLogEntry[];
  appended: unknown[];
  patientData: Record<string, unknown> | null;
} = {
  clinicData: null,
  commsLog: [],
  appended: [],
  patientData: null,
};

function resetState() {
  state.clinicData = null;
  state.commsLog = [];
  state.appended = [];
  state.patientData = null;
}

vi.mock("@/lib/firebase-admin", () => {
  const commsLogRef = {
    where(field: string, _op: string, value: unknown) {
      return {
        where(field2: string, _op2: string, value2: unknown) {
          return {
            limit(_n: number) {
              return {
                async get() {
                  const docs = state.commsLog.filter(
                    (e) =>
                      (e as Record<string, unknown>)[field] === value &&
                      (e as Record<string, unknown>)[field2] === value2,
                  );
                  return { empty: docs.length === 0, docs };
                },
              };
            },
          };
        },
      };
    },
    async add(entry: unknown) {
      state.appended.push(entry);
      return { id: `log-${state.appended.length}` };
    },
  };

  const patientsCollection = {
    doc: (_pid: string) => ({
      async get() {
        return {
          exists: state.patientData !== null,
          data: () => state.patientData ?? {},
        };
      },
    }),
  };

  const clinicDocRef = {
    async get() {
      return {
        exists: state.clinicData !== null,
        data: () => state.clinicData ?? {},
      };
    },
    collection: (sub: string) => {
      if (sub === "comms_log") return commsLogRef;
      if (sub === "patients") return patientsCollection;
      throw new Error(`Unmocked subcollection: ${sub}`);
    },
  };

  return {
    getAdminDb: () => ({
      collection: (col: string) => {
        if (col !== "clinics") throw new Error(`Unmocked collection: ${col}`);
        return {
          doc: (_id: string) => clinicDocRef,
        };
      },
      doc: (path: string) => {
        // Matches "clinics/{cid}/patients/{pid}"
        const m = path.match(/^clinics\/[^/]+\/patients\/[^/]+$/);
        if (!m) throw new Error(`Unmocked doc path: ${path}`);
        return {
          async get() {
            return {
              exists: state.patientData !== null,
              data: () => state.patientData ?? {},
            };
          },
        };
      },
    }),
  };
});

const mockTwilioCreate = vi.fn();
vi.mock("@/lib/twilio", () => ({
  getTwilio: () => ({
    messages: { create: (...args: unknown[]) => mockTwilioCreate(...args) },
  }),
  getTwilioPhone: () => "+441234567890",
}));

const mockResendSend = vi.fn();
vi.mock("@/lib/resend", () => ({
  getResend: () => ({
    emails: { send: (...args: unknown[]) => mockResendSend(...args) },
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/comms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: "Bearer token" },
    body: JSON.stringify(body),
  });
}

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  mockVerify.mockResolvedValue({
    uid: "uid-1",
    email: "owner@clinic.co.uk",
    clinicId: "clinic-1",
    role: "owner",
  });
  mockRequireRole.mockImplementation(() => {});
  mockRequireClinic.mockImplementation(() => {});
  mockTwilioCreate.mockResolvedValue({ sid: "SM123" });
  mockResendSend.mockResolvedValue({ data: { id: "re_1" }, error: null });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/comms/send — opt-out gate", () => {
  it("returns 409 when patient has a prior unsubscribed comms_log entry", async () => {
    state.clinicData = { name: "Spires Physiotherapy", bookingUrl: "https://book.spires.co.uk" };
    state.commsLog = [{ patientId: "pat-1", outcome: "unsubscribed" }];

    const res = await POST(
      buildRequest({
        clinicId: "clinic-1",
        patientId: "pat-1",
        patientName: "Alex",
        sequenceType: "rebooking_prompt",
        channel: "sms",
        to: "+447000111222",
        body: "Hi [Name], book at [ClinicName]: [BookingUrl]",
      }),
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.outcome).toBe("unsubscribed");
    // Must not dispatch to Twilio and must not write a new comms_log entry
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(state.appended).toHaveLength(0);
  });
});

describe("POST /api/comms/send — template resolution", () => {
  it("returns 422 with unresolved=['BookingUrl'] when clinic has no bookingUrl", async () => {
    state.clinicData = { name: "Spires Physiotherapy" /* no bookingUrl */ };

    const res = await POST(
      buildRequest({
        clinicId: "clinic-1",
        patientId: "pat-1",
        patientName: "Alex",
        sequenceType: "rebooking_prompt",
        channel: "sms",
        to: "+447000111222",
        body: "Hi [Name], book at [ClinicName]: [BookingUrl]",
      }),
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Template has unresolved variables");
    expect(json.unresolved).toEqual(["BookingUrl"]);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
    expect(state.appended).toHaveLength(0);
  });

  it("resolves [ClinicName] from the Firestore clinic doc", async () => {
    state.clinicData = {
      name: "Spires Physiotherapy",
      bookingUrl: "https://book.spires.co.uk",
    };

    const res = await POST(
      buildRequest({
        clinicId: "clinic-1",
        patientId: "pat-1",
        patientName: "Alex",
        sequenceType: "rebooking_prompt",
        channel: "sms",
        to: "+447000111222",
        body: "Hi [Name], book at [ClinicName]: [BookingUrl]",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
    const callArg = mockTwilioCreate.mock.calls[0][0] as { body: string; to: string };
    expect(callArg.body).toBe(
      "Hi Alex, book at Spires Physiotherapy: https://book.spires.co.uk",
    );
  });
});

describe("POST /api/comms/send — UK phone normalisation", () => {
  it("auto-converts 07384742532 to +447384742532 before dispatching to Twilio", async () => {
    state.clinicData = { name: "Spires Physiotherapy" };

    const res = await POST(
      buildRequest({
        clinicId: "clinic-1",
        patientId: "pat-1",
        patientName: "Alex",
        sequenceType: "review_prompt",
        channel: "sms",
        to: "07384742532",
        body: "Hi [Name], thanks from [ClinicName].",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
    const callArg = mockTwilioCreate.mock.calls[0][0] as { to: string };
    expect(callArg.to).toBe("+447384742532");
  });

  it("returns 400 for an SMS recipient that is neither E.164 nor UK 07...", async () => {
    state.clinicData = { name: "Spires Physiotherapy" };

    const res = await POST(
      buildRequest({
        clinicId: "clinic-1",
        patientId: "pat-1",
        patientName: "Alex",
        sequenceType: "review_prompt",
        channel: "sms",
        to: "12345",
        body: "Hi [Name], thanks from [ClinicName].",
      }),
    );

    expect(res.status).toBe(400);
    expect(mockTwilioCreate).not.toHaveBeenCalled();
  });
});
