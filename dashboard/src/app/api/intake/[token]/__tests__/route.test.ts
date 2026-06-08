/**
 * Tests for the public insurance intake submit endpoint.
 *
 * Critical properties:
 *   - consent is enforced server-side (no consent → 400, nothing written)
 *   - a valid submission creates a PENDING record and marks the link submitted
 *   - the endpoint never writes to the PMS (it has no PMS dependency at all)
 *   - an invalid/expired token is rejected
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ limited: false, remaining: 30 }),
}));
vi.mock("@/lib/request-logger", () => ({
  withRequestLog: <T extends (...a: unknown[]) => unknown>(h: T) => h,
}));
vi.mock("@/lib/audit-log", () => ({
  writeAuditLog: vi.fn(),
  extractIpFromRequest: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerifyToken = vi.fn();
vi.mock("@/lib/insurance/intake-token", () => ({
  verifyIntakeToken: (...a: unknown[]) => mockVerifyToken(...a),
}));

// Path-keyed Firestore mock.
const seed: Record<string, Record<string, unknown> | undefined> = {};
const sets: { path: string; data: Record<string, unknown>; merge?: boolean }[] = [];
let autoCounter = 0;

function docRef(path: string) {
  return {
    id: path.split("/").pop(),
    collection: (name: string) => collRef(`${path}/${name}`),
    get: async () => ({ exists: seed[path] !== undefined, id: path.split("/").pop(), data: () => seed[path] }),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      sets.push({ path, data, merge: opts?.merge });
      seed[path] = { ...(seed[path] ?? {}), ...data };
    },
  };
}
function collRef(path: string) {
  return { doc: (id?: string) => docRef(`${path}/${id ?? `auto-${++autoCounter}`}`) };
}
vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({ collection: (name: string) => collRef(name) }),
}));

import { POST } from "../route";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/intake/tok", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ token: "tok" }) };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seed)) delete seed[k];
  sets.length = 0;
  autoCounter = 0;
  mockVerifyToken.mockReturnValue({ clinicId: "clinic-1", linkId: "link-9", exp: Date.now() + 60_000 });
  seed["clinics/clinic-1/insurance_intake_links/link-9"] = {
    patientRef: "p-42",
    appointmentId: null,
    insurerOptions: ["Bupa", "AXA"],
    consentVersion: "intake-v1",
    status: "issued",
  };
});

describe("POST /api/intake/[token]", () => {
  it("rejects a submission without consent and writes nothing", async () => {
    const res = await POST(req({ insurerName: "Bupa", policyNumber: "AB123456", consent: false }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errors.some((e: string) => /consent/i.test(e))).toBe(true);
    // no intake created
    expect(sets.some((s) => s.path.includes("insurance_intakes"))).toBe(false);
  });

  it("rejects an insurer outside the tenant's options", async () => {
    const res = await POST(req({ insurerName: "Acme", policyNumber: "AB123456", consent: true }), ctx);
    expect(res.status).toBe(400);
  });

  it("creates a pending record and marks the link submitted", async () => {
    const res = await POST(req({
      insurerName: "Bupa", policyNumber: "AB123456", consent: true,
      addressLine1: "1 High Street", town: "London", postcode: "NW6 1AB",
    }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const intakeSet = sets.find((s) => s.path.includes("insurance_intakes"));
    expect(intakeSet).toBeDefined();
    expect(intakeSet!.data.reviewStatus).toBe("pending");
    expect(intakeSet!.data.source).toBe("form");
    expect(intakeSet!.data.patientRef).toBe("p-42");

    const linkSet = sets.find((s) => s.path.endsWith("insurance_intake_links/link-9"));
    expect(linkSet!.data.status).toBe("submitted");
  });

  it("returns 404 for an invalid or expired token", async () => {
    mockVerifyToken.mockReturnValue(null);
    const res = await POST(req({ insurerName: "Bupa", policyNumber: "AB123456", consent: true }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 409 if the link was already submitted", async () => {
    seed["clinics/clinic-1/insurance_intake_links/link-9"]!.status = "submitted";
    const res = await POST(req({ insurerName: "Bupa", policyNumber: "AB123456", consent: true }), ctx);
    expect(res.status).toBe(409);
  });
});
