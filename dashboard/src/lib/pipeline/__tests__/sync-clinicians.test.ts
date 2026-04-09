import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncClinicians, buildClinicianMap } from "../sync-clinicians";
import type { PMSAdapter } from "@/types/pms";

// ─── Firestore mock helpers ─────────────────────────────────────────────────

interface MockDoc {
  id: string;
  data: () => Record<string, unknown>;
}

function createMockBatch() {
  return {
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockCollectionRef(docs: MockDoc[] = []) {
  const ref: Record<string, unknown> = {
    doc: vi.fn((id?: string) => {
      const docRef = {
        id: id ?? `auto-${Math.random().toString(36).slice(2, 8)}`,
        collection: vi.fn(() => createMockCollectionRef()),
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({}),
        }),
      };
      return docRef;
    }),
    limit: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({ docs }),
    })),
    get: vi.fn().mockResolvedValue({ docs }),
  };
  return ref;
}

function createMockDb(existingClinicians: MockDoc[] = []) {
  const batch = createMockBatch();
  const cliniciansRef = createMockCollectionRef(existingClinicians);

  const db = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn((name: string) => {
          if (name === "clinicians") return cliniciansRef;
          return createMockCollectionRef();
        }),
      })),
    })),
    batch: vi.fn(() => batch),
  };

  return { db: db as unknown as import("firebase-admin/firestore").Firestore, batch, cliniciansRef };
}

function createMockAdapter(overrides: Partial<PMSAdapter> = {}): PMSAdapter {
  return {
    provider: "writeupp",
    testConnection: vi.fn().mockResolvedValue({ ok: true }),
    getAppointments: vi.fn().mockResolvedValue([]),
    getPatient: vi.fn().mockResolvedValue({ externalId: "p1", firstName: "Test", lastName: "Patient" }),
    createAppointment: vi.fn().mockResolvedValue({ externalId: "a1" }),
    updateAppointmentStatus: vi.fn().mockResolvedValue(undefined),
    getClinicians: vi.fn().mockResolvedValue([]),
    getInsuranceInfo: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("syncClinicians", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates new clinicians from PMS data", async () => {
    const { db, batch } = createMockDb([]);
    const adapter = createMockAdapter({
      getClinicians: vi.fn().mockResolvedValue([
        { externalId: "ext-1", name: "Dr Alice", role: "Physiotherapist", active: true },
        { externalId: "ext-2", name: "Dr Bob", active: true },
      ]),
    });

    const result = await syncClinicians(db, "clinic-1", adapter);

    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(result.stage).toBe("sync-clinicians");
    expect(result.errors).toEqual([]);
    expect(batch.set).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalledOnce();

    // Verify first clinician payload
    const firstCallPayload = batch.set.mock.calls[0][1];
    expect(firstCallPayload).toMatchObject({
      name: "Dr Alice",
      role: "Physiotherapist",
      active: true,
      pmsExternalId: "ext-1",
      createdBy: "pipeline",
    });

    // Verify role defaults to Physiotherapist when not provided
    const secondCallPayload = batch.set.mock.calls[1][1];
    expect(secondCallPayload.role).toBe("Physiotherapist");
  });

  it("updates existing clinicians with matching pmsExternalId", async () => {
    const existingDocs: MockDoc[] = [
      { id: "fs-1", data: () => ({ pmsExternalId: "ext-1", name: "Old Name" }) },
    ];
    const { db, batch } = createMockDb(existingDocs);
    const adapter = createMockAdapter({
      getClinicians: vi.fn().mockResolvedValue([
        { externalId: "ext-1", name: "Updated Name", role: "Osteopath", active: true },
      ]),
    });

    const result = await syncClinicians(db, "clinic-1", adapter);

    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(batch.update).toHaveBeenCalledTimes(1);
    expect(batch.set).not.toHaveBeenCalled();

    const updatePayload = batch.update.mock.calls[0][1];
    expect(updatePayload).toMatchObject({
      name: "Updated Name",
      role: "Osteopath",
      active: true,
      pmsExternalId: "ext-1",
    });
  });

  it("deactivates clinicians not returned by PMS", async () => {
    const existingDocs: MockDoc[] = [
      { id: "fs-1", data: () => ({ pmsExternalId: "ext-1", name: "Active" }) },
      { id: "fs-2", data: () => ({ pmsExternalId: "ext-removed", name: "Gone" }) },
    ];
    const { db, batch } = createMockDb(existingDocs);
    const adapter = createMockAdapter({
      getClinicians: vi.fn().mockResolvedValue([
        { externalId: "ext-1", name: "Active", active: true },
      ]),
    });

    const result = await syncClinicians(db, "clinic-1", adapter);

    expect(result.ok).toBe(true);
    // 1 PMS clinician processed + 1 deactivation update
    expect(batch.update).toHaveBeenCalledTimes(2);

    // Find the deactivation call (the one setting active: false)
    const deactivationCall = batch.update.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>).active === false
    );
    expect(deactivationCall).toBeDefined();
    expect(deactivationCall![1]).toMatchObject({ active: false });
  });

  it("returns ok=true and correct count on success", async () => {
    const { db } = createMockDb([]);
    const adapter = createMockAdapter({
      getClinicians: vi.fn().mockResolvedValue([
        { externalId: "ext-1", name: "A", active: true },
        { externalId: "ext-2", name: "B", active: true },
        { externalId: "ext-3", name: "C", active: false },
      ]),
    });

    const result = await syncClinicians(db, "clinic-1", adapter);

    expect(result.ok).toBe(true);
    expect(result.count).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns ok=false with error message when adapter throws", async () => {
    const { db } = createMockDb([]);
    const adapter = createMockAdapter({
      getClinicians: vi.fn().mockRejectedValue(new Error("PMS connection timeout")),
    });

    const result = await syncClinicians(db, "clinic-1", adapter);

    expect(result.ok).toBe(false);
    expect(result.count).toBe(0);
    expect(result.errors).toContain("PMS connection timeout");
  });
});

describe("buildClinicianMap", () => {
  it("returns Map from external ID to Firestore doc ID", async () => {
    const docs: MockDoc[] = [
      { id: "fs-abc", data: () => ({ pmsExternalId: "ext-1", name: "Alice" }) },
      { id: "fs-def", data: () => ({ pmsExternalId: "ext-2", name: "Bob" }) },
      { id: "fs-ghi", data: () => ({ name: "No External ID" }) },
    ];
    const { db } = createMockDb(docs);

    const map = await buildClinicianMap(db, "clinic-1");

    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(2);
    expect(map.get("ext-1")).toBe("fs-abc");
    expect(map.get("ext-2")).toBe("fs-def");
  });

  it("returns empty map when no clinicians exist", async () => {
    const { db } = createMockDb([]);
    const map = await buildClinicianMap(db, "clinic-1");
    expect(map.size).toBe(0);
  });
});
