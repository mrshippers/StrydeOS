import { describe, it, expect, vi, beforeEach } from "vitest";
import { logIntegrationHealth, cleanOldHealthLogs } from "../health-logger";
import type { StageResult } from "../types";

// ── Firestore mock ───────────────────────────────────────────────────────────

function createMockDb() {
  const docs: Record<string, Record<string, unknown>> = {};
  let docCounter = 0;

  const mockCollection = (path: string) => ({
    add: vi.fn(async (data: Record<string, unknown>) => {
      const id = `auto-${++docCounter}`;
      docs[`${path}/${id}`] = data;
      return { id };
    }),
    where: vi.fn(() => ({
      limit: vi.fn(() => ({
        get: vi.fn(async () => {
          const cutoff = Object.entries(docs)
            .filter(([k]) => k.startsWith(path));
          return {
            empty: cutoff.length === 0,
            docs: cutoff.map(([, data]) => ({
              ref: { delete: vi.fn() },
              data: () => data,
            })),
          };
        }),
      })),
    })),
  });

  const db = {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        collection: vi.fn((sub: string) => mockCollection(`${name}/${id}/${sub}`)),
      })),
    })),
    batch: vi.fn(() => ({
      delete: vi.fn(),
      commit: vi.fn(async () => {}),
    })),
    _docs: docs,
  };

  return db;
}

describe("logIntegrationHealth", () => {
  it("writes a health entry with provider info and stage result", async () => {
    const db = createMockDb();
    const stageResult: StageResult = {
      stage: "sync-clinicians",
      ok: true,
      count: 5,
      errors: [],
      durationMs: 120,
    };

    await logIntegrationHealth(
      db as any,
      "clinic-1",
      "writeupp",
      "pms",
      stageResult
    );

    const entries = Object.values(db._docs);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      clinicId: "clinic-1",
      provider: "writeupp",
      providerType: "pms",
      stage: "sync-clinicians",
      ok: true,
      count: 5,
    });
    expect(entries[0].timestamp).toBeDefined();
  });

  it("does not throw when Firestore fails", async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            add: vi.fn(async () => { throw new Error("Firestore down"); }),
          })),
        })),
      })),
    };

    await expect(
      logIntegrationHealth(
        db as any,
        "clinic-1",
        "writeupp",
        "pms",
        { stage: "test", ok: true, count: 0, errors: [], durationMs: 0 }
      )
    ).resolves.toBeUndefined();
  });
});

describe("cleanOldHealthLogs", () => {
  it("does not throw when collection is empty", async () => {
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  empty: true,
                  docs: [],
                })),
              })),
            })),
          })),
        })),
      })),
    };

    await expect(
      cleanOldHealthLogs(db as any, "clinic-1")
    ).resolves.toBeUndefined();
  });
});
