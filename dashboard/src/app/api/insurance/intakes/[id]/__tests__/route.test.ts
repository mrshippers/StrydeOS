/**
 * Tests for the staff approve/reject endpoint — the only path that writes
 * insurance into the PMS.
 *
 * Critical properties:
 *   - approve calls the adapter's writeInsurance and marks the record approved
 *   - reject marks rejected and never calls the PMS
 *   - a non-pending record cannot be re-actioned
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ limited: false, remaining: 20 }),
}));
vi.mock("@/lib/request-logger", () => ({
  withRequestLog: <T extends (...a: unknown[]) => unknown>(h: T) => h,
}));
vi.mock("@/lib/audit-log", () => ({
  writeAuditLog: vi.fn(),
  extractIpFromRequest: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/crypto/credentials", () => ({
  isEncrypted: vi.fn().mockReturnValue(false),
  decryptCredential: vi.fn((v: string) => v),
}));

const mockVerify = vi.fn();
const mockRequireRole = vi.fn();
vi.mock("@/lib/auth-guard", () => ({
  verifyApiRequest: (...a: unknown[]) => mockVerify(...a),
  requireRole: (...a: unknown[]) => mockRequireRole(...a),
  handleApiError: (err: unknown) => {
    const e = err as { statusCode?: number; message?: string };
    return new Response(JSON.stringify({ error: e.message ?? "error" }), {
      status: e.statusCode ?? 500,
      headers: { "Content-Type": "application/json" },
    });
  },
}));

const mockWriteInsurance = vi.fn();
const mockDiscover = vi.fn();
vi.mock("@/lib/integrations/pms/factory", () => ({
  createPMSAdapter: () => ({
    provider: "cliniko",
    discoverInsuranceFields: (...a: unknown[]) => mockDiscover(...a),
    writeInsurance: (...a: unknown[]) => mockWriteInsurance(...a),
  }),
}));

// Path-keyed Firestore mock.
const seed: Record<string, Record<string, unknown> | undefined> = {};
const sets: { path: string; data: Record<string, unknown>; merge?: boolean }[] = [];

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
  return { doc: (id: string) => docRef(`${path}/${id}`) };
}
vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({ collection: (name: string) => collRef(name) }),
}));

import { PATCH } from "../route";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/insurance/intakes/intake-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", authorization: "Bearer t" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "intake-1" }) };

function seedPendingIntake(overrides: Record<string, unknown> = {}) {
  seed["clinics/clinic-1/insurance_intakes/intake-1"] = {
    tenantId: "clinic-1",
    patientRef: "p-42",
    source: "form",
    insurerName: "Bupa",
    policyNumber: "AB123456",
    confidence: 1,
    capturedAt: "2026-06-08T09:30:00.000Z",
    capturedBy: "patient",
    reviewStatus: "pending",
    audit: [],
    ...overrides,
  };
  seed["clinics/clinic-1/integrations_config/pms"] = { provider: "cliniko", apiKey: "plain-key" };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seed)) delete seed[k];
  sets.length = 0;
  mockVerify.mockResolvedValue({ uid: "u1", email: "owner@c.co", clinicId: "clinic-1", role: "owner" });
  mockRequireRole.mockImplementation(() => {});
  mockDiscover.mockResolvedValue({
    insurerOptions: ["Bupa", "AXA"], templateId: "tpl-1",
    insurerQuestionName: "Provider", policyQuestionName: "Policy number",
    fallbackToInvoiceExtraInfo: false,
  });
  mockWriteInsurance.mockResolvedValue({
    ok: true, wroteCustomFields: true, wroteBillingInfo: true, usedFallback: false, onboardingTaskNeeded: false,
  });
});

describe("PATCH /api/insurance/intakes/[id]", () => {
  it("approves: writes to the PMS and marks the record approved", async () => {
    seedPendingIntake();
    const res = await PATCH(req({ action: "approve" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).reviewStatus).toBe("approved");
    expect(mockWriteInsurance).toHaveBeenCalledTimes(1);
    const approvedSet = sets.find((s) => s.data.reviewStatus === "approved");
    expect(approvedSet).toBeDefined();
  });

  it("rejects: marks rejected and never calls the PMS", async () => {
    seedPendingIntake();
    const res = await PATCH(req({ action: "reject", note: "duplicate" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).reviewStatus).toBe("rejected");
    expect(mockWriteInsurance).not.toHaveBeenCalled();
    const rejectedSet = sets.find((s) => s.data.reviewStatus === "rejected");
    expect(rejectedSet).toBeDefined();
  });

  it("returns 502 and does not approve when the PMS write fails", async () => {
    seedPendingIntake();
    mockWriteInsurance.mockResolvedValue({
      ok: false, wroteCustomFields: false, wroteBillingInfo: false,
      usedFallback: false, onboardingTaskNeeded: false, error: "Cliniko 422",
    });
    const res = await PATCH(req({ action: "approve" }), ctx);
    expect(res.status).toBe(502);
    expect(sets.some((s) => s.data.reviewStatus === "approved")).toBe(false);
  });

  it("returns 409 when the intake is not pending", async () => {
    seedPendingIntake({ reviewStatus: "approved" });
    const res = await PATCH(req({ action: "approve" }), ctx);
    expect(res.status).toBe(409);
    expect(mockWriteInsurance).not.toHaveBeenCalled();
  });

  it("rejects an unknown action", async () => {
    seedPendingIntake();
    const res = await PATCH(req({ action: "frobnicate" }), ctx);
    expect(res.status).toBe(400);
  });
});
