import { describe, it, expect, vi, beforeEach } from "vitest";
import { BACKFILL_WEEKS, INCREMENTAL_WEEKS } from "../types";

// ─── Stage mocks ──────────────────────────────────────────────────────────────

const mockSyncClinicians = vi.fn();
const mockBuildClinicianMap = vi.fn();
const mockSyncAppointments = vi.fn();
const mockSyncPatients = vi.fn();
const mockSyncHep = vi.fn();
const mockSyncHeidi = vi.fn();
const mockComputePatientFields = vi.fn();
const mockComputeWeeklyMetrics = vi.fn();
const mockSyncReviews = vi.fn();
const mockTriggerCommsSequences = vi.fn();
const mockComputeAttribution = vi.fn();
const mockComputeKPIs = vi.fn();
const mockWriteComputeState = vi.fn();
const mockAppendDataQualityIssues = vi.fn();
const mockLogIntegrationHealth = vi.fn();
const mockCleanOldHealthLogs = vi.fn();
const mockIsEncrypted = vi.fn();
const mockDecryptCredential = vi.fn();

vi.mock("../sync-clinicians", () => ({
  syncClinicians: (...args: unknown[]) => mockSyncClinicians(...args),
  buildClinicianMap: (...args: unknown[]) => mockBuildClinicianMap(...args),
}));
vi.mock("../sync-appointments", () => ({
  syncAppointments: (...args: unknown[]) => mockSyncAppointments(...args),
}));
vi.mock("../sync-patients", () => ({
  syncPatients: (...args: unknown[]) => mockSyncPatients(...args),
}));
vi.mock("../sync-hep", () => ({
  syncHep: (...args: unknown[]) => mockSyncHep(...args),
}));
vi.mock("../sync-heidi", () => ({
  syncHeidi: (...args: unknown[]) => mockSyncHeidi(...args),
}));
vi.mock("../compute-patients", () => ({
  computePatientFields: (...args: unknown[]) => mockComputePatientFields(...args),
}));
vi.mock("@/lib/metrics/compute-weekly", () => ({
  computeWeeklyMetricsForClinic: (...args: unknown[]) => mockComputeWeeklyMetrics(...args),
}));
vi.mock("../sync-reviews", () => ({
  syncReviews: (...args: unknown[]) => mockSyncReviews(...args),
}));
vi.mock("@/lib/comms/trigger-sequences", () => ({
  triggerCommsSequences: (...args: unknown[]) => mockTriggerCommsSequences(...args),
}));
vi.mock("../compute-attribution", () => ({
  computeAttribution: (...args: unknown[]) => mockComputeAttribution(...args),
}));
vi.mock("@/lib/intelligence/compute-kpis", () => ({
  computeKPIs: (...args: unknown[]) => mockComputeKPIs(...args),
}));
vi.mock("@/lib/intelligence/compute-state", () => ({
  writeComputeState: (...args: unknown[]) => mockWriteComputeState(...args),
  appendDataQualityIssues: (...args: unknown[]) => mockAppendDataQualityIssues(...args),
}));
vi.mock("../health-logger", () => ({
  logIntegrationHealth: (...args: unknown[]) => mockLogIntegrationHealth(...args),
  cleanOldHealthLogs: (...args: unknown[]) => mockCleanOldHealthLogs(...args),
}));
vi.mock("@/lib/crypto/credentials", () => ({
  isEncrypted: (...args: unknown[]) => mockIsEncrypted(...args),
  decryptCredential: (...args: unknown[]) => mockDecryptCredential(...args),
}));

// ─── Firestore mock ───────────────────────────────────────────────────────────

const pipelineDocSetSpy = vi.fn().mockResolvedValue(undefined);
let pipelineConfig: Record<string, unknown> = {};

const STAGE_OK = { ok: true, count: 0, errors: [], durationMs: 0 };

function makeMockDb() {
  const noopDoc = {
    get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    collection: vi.fn(() => noopCollection),
  };
  const noopCollection = {
    doc: vi.fn(() => noopDoc),
    where: vi.fn(() => ({ limit: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ empty: true, docs: [] }) })) })),
    select: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ docs: [] }) })),
    get: vi.fn().mockResolvedValue({ docs: [] }),
  };

  return {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => {
            if (name === "clinics") {
              return { sessionPricePence: 5000, onboardingV2: { stage: "active" } };
            }
            return {};
          },
        }),
        update: vi.fn().mockResolvedValue(undefined),
        collection: vi.fn((subName: string) => ({
          doc: vi.fn((subId: string) => ({
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => {
                if (subName === "integrations_config") {
                  if (subId === "pms") return { apiKey: "test-key", provider: "cliniko", baseUrl: "https://api.uk3.cliniko.com/v1" };
                  if (subId === "pipeline") return pipelineConfig;
                  if (subId === "hep") return {};
                  if (subId === "google_reviews") return {};
                }
                return {};
              },
            }),
            set: subId === "pipeline" ? pipelineDocSetSpy : vi.fn().mockResolvedValue(undefined),
          })),
        })),
      })),
    })),
    batch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
  };
}

vi.mock("@/lib/integrations/pms/factory", () => ({
  createPMSAdapter: vi.fn(() => ({
    getClinicians: vi.fn().mockResolvedValue([]),
    getAppointments: vi.fn().mockResolvedValue([]),
    getPatient: vi.fn().mockResolvedValue({ firstName: "Joe", lastName: "Bloggs" }),
  })),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  pipelineConfig = {};

  mockSyncClinicians.mockResolvedValue({ stage: "sync-clinicians", ...STAGE_OK });
  mockBuildClinicianMap.mockResolvedValue(new Map());
  mockSyncAppointments.mockResolvedValue({
    stage: "sync-appointments",
    ...STAGE_OK,
    patientExternalIds: new Set<string>(),
  });
  mockSyncPatients.mockResolvedValue({ stage: "sync-patients", ...STAGE_OK });
  mockSyncHep.mockResolvedValue({ stage: "sync-hep", ...STAGE_OK });
  mockSyncHeidi.mockResolvedValue({ stage: "sync-heidi", ...STAGE_OK });
  mockComputePatientFields.mockResolvedValue({ stage: "compute-patients", ...STAGE_OK });
  mockComputeWeeklyMetrics.mockResolvedValue({ written: 0 });
  mockTriggerCommsSequences.mockResolvedValue({ fired: 0, errors: [] });
  mockComputeAttribution.mockResolvedValue({ stage: "compute-attribution", ...STAGE_OK });
  mockComputeKPIs.mockResolvedValue({ written: 0, lastComputedKpis: [], dataQualityIssues: [] });
  mockWriteComputeState.mockResolvedValue(undefined);
  mockLogIntegrationHealth.mockResolvedValue(undefined);
  mockCleanOldHealthLogs.mockResolvedValue(undefined);
  mockIsEncrypted.mockReturnValue(false);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runPipeline auto-backfill detection", () => {
  it("B: uses BACKFILL_WEEKS on first run (no backfillCompleted in pipeline config)", async () => {
    // pipelineConfig is empty — backfillCompleted not set
    const { runPipeline } = await import("../run-pipeline");
    await runPipeline(makeMockDb() as never, "clinic-spires");

    expect(mockSyncAppointments).toHaveBeenCalledOnce();
    const opts = mockSyncAppointments.mock.calls[0][4] as { backfill?: boolean };
    expect(opts.backfill).toBe(true);
  });

  it("B: sets backfillCompleted=true in pipeline config after first run", async () => {
    const { runPipeline } = await import("../run-pipeline");
    await runPipeline(makeMockDb() as never, "clinic-spires");

    // pipeline doc set() should have been called with backfillCompleted: true
    const setArgs = pipelineDocSetSpy.mock.calls.map(([data]) => data as Record<string, unknown>);
    const backfillWrite = setArgs.find((d) => "backfillCompleted" in d);
    expect(backfillWrite?.backfillCompleted).toBe(true);
  });

  it("B: uses INCREMENTAL_WEEKS on subsequent runs (backfillCompleted: true)", async () => {
    pipelineConfig = { backfillCompleted: true, backfillCompletedAt: "2026-01-01T06:00:00Z" };

    const { runPipeline } = await import("../run-pipeline");
    await runPipeline(makeMockDb() as never, "clinic-spires");

    expect(mockSyncAppointments).toHaveBeenCalledOnce();
    const opts = mockSyncAppointments.mock.calls[0][4] as { backfill?: boolean };
    expect(opts.backfill).toBe(false);
  });

  it("B: explicit backfill=true forces full history even when backfillCompleted is already set", async () => {
    pipelineConfig = { backfillCompleted: true, backfillCompletedAt: "2026-01-01T06:00:00Z" };

    const { runPipeline } = await import("../run-pipeline");
    await runPipeline(makeMockDb() as never, "clinic-spires", { backfill: true });

    const opts = mockSyncAppointments.mock.calls[0][4] as { backfill?: boolean };
    expect(opts.backfill).toBe(true);
  });

  it("B: BACKFILL_WEEKS (26) covers 6 months of Cliniko history to capture all existing patients", () => {
    // Regression guard: if BACKFILL_WEEKS drops below 24, historical patients (like Joe Bloggs) may be missed
    expect(BACKFILL_WEEKS).toBeGreaterThanOrEqual(24);
    expect(INCREMENTAL_WEEKS).toBeLessThan(BACKFILL_WEEKS);
  });
});

// ── Finding 2 regression guard: failed KPI compute must NOT advance lastFullRecomputeAt ──

describe("runPipeline compute-kpis failure path", () => {
  it("F2: does NOT include completedAt in writeComputeState when compute-kpis throws", async () => {
    // compute-kpis throws -> the failure catch block must call writeComputeState
    // WITHOUT completedAt so lastFullRecomputeAt is not advanced.
    // A successful run later writes completedAt via the normal final path.
    mockComputeKPIs.mockRejectedValue(new Error("KPI compute exploded"));

    const { runPipeline } = await import("../run-pipeline");
    await runPipeline(makeMockDb() as never, "clinic-spires");

    // Find the call made from inside the catch block (status: "failed")
    const failedCall = mockWriteComputeState.mock.calls.find(
      ([, , update]: [unknown, unknown, Record<string, unknown>]) =>
        (update as Record<string, unknown>).status === "failed"
    );

    expect(failedCall).toBeDefined();
    const failedUpdate = failedCall![2] as Record<string, unknown>;
    // completedAt must NOT be present - presence would advance lastFullRecomputeAt
    expect(failedUpdate).not.toHaveProperty("completedAt");
    // lastError must be present so the operator can see what failed
    expect(failedUpdate.lastError).toContain("KPI compute exploded");
  });

  it("F2: includes completedAt in writeComputeState only on successful run", async () => {
    // Successful run must still write completedAt via the final writeComputeState call
    mockComputeKPIs.mockResolvedValue({ written: 1, lastComputedKpis: ["followUpRate"], dataQualityIssues: [] });

    const { runPipeline } = await import("../run-pipeline");
    await runPipeline(makeMockDb() as never, "clinic-spires");

    // The final writeComputeState call (status: "ok" or "degraded") must carry completedAt
    const okCall = mockWriteComputeState.mock.calls.find(
      ([, , update]: [unknown, unknown, Record<string, unknown>]) =>
        (update as Record<string, unknown>).status === "ok" ||
        (update as Record<string, unknown>).status === "degraded"
    );

    expect(okCall).toBeDefined();
    const okUpdate = okCall![2] as Record<string, unknown>;
    expect(okUpdate).toHaveProperty("completedAt");
    expect(typeof okUpdate.completedAt).toBe("string");
  });
});
