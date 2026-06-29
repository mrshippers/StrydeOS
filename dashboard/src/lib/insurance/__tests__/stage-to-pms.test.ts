import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InsuranceRecord } from "../types";

const mockDiscover = vi.fn();
const mockWrite = vi.fn();
vi.mock("@/lib/integrations/pms/factory", () => ({
  createPMSAdapter: () => ({
    discoverInsuranceFields: (...a: unknown[]) => mockDiscover(...a),
    writeInsurance: (...a: unknown[]) => mockWrite(...a),
  }),
}));
vi.mock("@/lib/crypto/credentials", () => ({
  isEncrypted: vi.fn().mockReturnValue(false),
  decryptCredential: vi.fn((v: string) => v),
}));

import { stageIntakeToPms } from "../stage-to-pms";

// Minimal path-agnostic Firestore stub: every collection()/doc() returns the
// same chain; get() resolves the configured pms doc data.
function fakeDb(cfgData: unknown) {
  const chain: Record<string, unknown> = {};
  chain.collection = vi.fn(() => chain);
  chain.doc = vi.fn(() => chain);
  chain.set = vi.fn();
  chain.get = vi.fn().mockResolvedValue({ data: () => cfgData });
  return chain as unknown as import("firebase-admin/firestore").Firestore;
}

function record(overrides: Partial<InsuranceRecord> = {}): InsuranceRecord {
  return {
    tenantId: "clinic-1",
    patientRef: "p-1",
    source: "form",
    insurerName: "Bupa",
    policyNumber: "AB123456",
    confidence: 1,
    capturedAt: "2026-07-01T09:00:00.000Z",
    capturedBy: "patient",
    reviewStatus: "pending",
    audit: [],
    appointmentId: null,
    ...overrides,
  };
}

const CLINIKO_CFG = {
  provider: "cliniko",
  apiKey: "key-123",
  baseUrl: "https://api.uk3.cliniko.com/v1",
  webBaseUrl: "https://spires-physiotherapy.uk3.cliniko.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDiscover.mockResolvedValue({ fallbackToInvoiceExtraInfo: false });
  mockWrite.mockResolvedValue({ ok: true, usedFallback: false, onboardingTaskNeeded: false });
});

describe("stageIntakeToPms", () => {
  it("writes to the PMS and returns a patient-scoped invoice link when no appointment is known", async () => {
    const res = await stageIntakeToPms(fakeDb(CLINIKO_CFG), "clinic-1", record());
    expect(res.ok).toBe(true);
    expect(res.noPms).toBe(false);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(res.pmsInvoiceUrl).toBe("https://spires-physiotherapy.uk3.cliniko.com/invoices/new?patient_id=p-1");
  });

  it("flags noPms (caller keeps the record pending) when the clinic has no PMS configured", async () => {
    const res = await stageIntakeToPms(fakeDb(undefined), "clinic-1", record());
    expect(res.ok).toBe(false);
    expect(res.noPms).toBe(true);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("returns ok:false with the error (not noPms) when the PMS write fails", async () => {
    mockWrite.mockResolvedValue({ ok: false, usedFallback: false, error: "cliniko 500" });
    const res = await stageIntakeToPms(fakeDb(CLINIKO_CFG), "clinic-1", record());
    expect(res.ok).toBe(false);
    expect(res.noPms).toBe(false);
    expect(res.error).toBe("cliniko 500");
    expect(res.pmsInvoiceUrl).toBeNull();
  });

  it("surfaces onboardingTaskNeeded from a fallback write", async () => {
    mockWrite.mockResolvedValue({ ok: true, usedFallback: true, onboardingTaskNeeded: true });
    const res = await stageIntakeToPms(fakeDb(CLINIKO_CFG), "clinic-1", record());
    expect(res.ok).toBe(true);
    expect(res.usedFallback).toBe(true);
    expect(res.onboardingTaskNeeded).toBe(true);
  });
});
