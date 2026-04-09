/**
 * Tests for sync-heidi.ts — per-clinician opt-in behaviour.
 *
 * Key assertions:
 * - Only syncs clinicians where heidiEnabled = true and heidiEmail is set
 * - Skips clinicians that have not opted in
 * - Skips the entire sync when clinic Heidi config is disabled or missing
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Heidi client ────────────────────────────────────────────────────────

vi.mock("@/lib/integrations/heidi/client", () => ({
  getHeidiJwt: vi.fn(),
  fetchSessions: vi.fn(),
  fetchSessionDocuments: vi.fn(),
  fetchClinicalCodes: vi.fn(),
  fetchPatientProfile: vi.fn(),
  askHeidi: vi.fn(),
}));

vi.mock("@/lib/pipeline/extract-complexity", () => ({
  composeComplexitySignals: vi.fn().mockReturnValue({ complexityTier: "LOW" }),
}));

// ─── Firestore stub ───────────────────────────────────────────────────────────

function makeFirestoreStub(opts: {
  heidiConfig?: Record<string, unknown> | null;
  clinicians?: Array<{ id: string; data: Record<string, unknown> }>;
  patients?: Array<{ id: string; data: Record<string, unknown> }>;
}) {
  const {
    heidiConfig = null,
    clinicians = [],
    patients = [],
  } = opts;

  const notesAddImpl = vi.fn().mockResolvedValue({ id: "note-1" });
  const patientsUpdateImpl = vi.fn().mockResolvedValue(undefined);
  const configUpdateImpl = vi.fn().mockResolvedValue(undefined);

  const collectionsMap: Record<string, unknown> = {
    integrations_config: {
      doc: (id: string) => {
        if (id === "heidi") {
          return {
            get: vi.fn().mockResolvedValue({
              data: () => heidiConfig,
            }),
            update: configUpdateImpl,
          };
        }
        return { get: vi.fn().mockResolvedValue({ data: () => null }) };
      },
    },
    clinicians: {
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        docs: clinicians.map((c) => ({ id: c.id, data: () => c.data })),
      }),
    },
    patients: {
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        docs: patients.map((p) => ({ id: p.id, data: () => p.data })),
      }),
    },
    clinical_notes: {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: true }),
      add: notesAddImpl,
    },
  };

  const db = {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockImplementation((name: string) => {
          const col = collectionsMap[name];
          if (!col) throw new Error(`Unknown collection: ${name}`);
          return col;
        }),
        update: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };

  return { db, notesAddImpl, patientsUpdateImpl, configUpdateImpl };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("syncHeidi — per-clinician opt-in", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("skips sync entirely when clinic Heidi config is missing", async () => {
    const { db } = makeFirestoreStub({ heidiConfig: null });
    const { syncHeidi } = await import("../sync-heidi");
    const result = await syncHeidi(db as never, "clinic-1");

    expect(result.ok).toBe(true);
    expect(result.count).toBe(0);
    expect(result.errors[0]).toMatch(/No Heidi config/);
  });

  it("skips sync when enabled is false", async () => {
    const { db } = makeFirestoreStub({
      heidiConfig: { enabled: false, apiKey: "key", region: "uk" },
    });
    const { syncHeidi } = await import("../sync-heidi");
    const result = await syncHeidi(db as never, "clinic-1");

    expect(result.count).toBe(0);
    expect(result.errors[0]).toMatch(/No Heidi config/);
  });

  it("skips clinicians where heidiEnabled is false or missing", async () => {
    const { getHeidiJwt } = await import("@/lib/integrations/heidi/client");

    const { db } = makeFirestoreStub({
      heidiConfig: { enabled: true, apiKey: "key", region: "uk" },
      clinicians: [
        { id: "clin-1", data: { name: "Andrew", active: true, heidiEnabled: false, heidiEmail: "a@s.co.uk" } },
        { id: "clin-2", data: { name: "Max", active: true } }, // no heidiEnabled
      ],
    });

    const { syncHeidi } = await import("../sync-heidi");
    await syncHeidi(db as never, "clinic-1");

    expect(vi.mocked(getHeidiJwt)).not.toHaveBeenCalled();
  });

  it("only syncs clinicians with heidiEnabled = true and heidiEmail set", async () => {
    const { getHeidiJwt, fetchSessions } = await import("@/lib/integrations/heidi/client");
    vi.mocked(getHeidiJwt).mockResolvedValue("mock-jwt");
    vi.mocked(fetchSessions).mockResolvedValue([]);

    const { db } = makeFirestoreStub({
      heidiConfig: { enabled: true, apiKey: "key", region: "uk" },
      clinicians: [
        { id: "clin-1", data: { name: "Andrew", active: true, heidiEnabled: true, heidiEmail: "andrew@spires.co.uk" } },
        { id: "clin-2", data: { name: "Max", active: true, heidiEnabled: false } },
      ],
    });

    const { syncHeidi } = await import("../sync-heidi");
    await syncHeidi(db as never, "clinic-1");

    // Only called once — for Andrew, not Max
    expect(vi.mocked(getHeidiJwt)).toHaveBeenCalledOnce();
    expect(vi.mocked(getHeidiJwt)).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "key" }),
      "andrew@spires.co.uk",
      "clin-1",
    );
  });

  it("records error for opted-in clinician when JWT fails, continues others", async () => {
    const { getHeidiJwt, fetchSessions } = await import("@/lib/integrations/heidi/client");
    vi.mocked(getHeidiJwt)
      .mockRejectedValueOnce(new Error("Heidi API 503: Service Unavailable"))
      .mockResolvedValueOnce("mock-jwt");
    vi.mocked(fetchSessions).mockResolvedValue([]);

    const { db } = makeFirestoreStub({
      heidiConfig: { enabled: true, apiKey: "key", region: "uk" },
      clinicians: [
        { id: "clin-1", data: { name: "Andrew", active: true, heidiEnabled: true, heidiEmail: "andrew@spires.co.uk" } },
        { id: "clin-2", data: { name: "Max", active: true, heidiEnabled: true, heidiEmail: "max@spires.co.uk" } },
      ],
    });

    const { syncHeidi } = await import("../sync-heidi");
    const result = await syncHeidi(db as never, "clinic-1");

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Andrew/);
    // Max's JWT was fetched successfully
    expect(vi.mocked(getHeidiJwt)).toHaveBeenCalledTimes(2);
  });
});
