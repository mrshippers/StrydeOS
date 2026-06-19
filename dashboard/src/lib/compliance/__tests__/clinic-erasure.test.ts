/**
 * Tests for the clinic-termination full-erasure engine (GDPR Art. 17).
 *
 * Behaviour under test:
 *   1. eraseClinicData sweeps every subcollection (via listCollections), the
 *      clinic-scoped top-level docs, the Firebase Auth accounts, and the clinic
 *      doc — and reports honest counts.
 *   2. executeClinicTerminationErasures only acts on clinics whose grace period
 *      has elapsed AND whose status is "churned" — anything else is skipped, not
 *      erased — and writes a retained tombstone for each erasure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const deleteUsers = vi.fn().mockResolvedValue({ successCount: 2, failureCount: 0 });

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminAuth: () => ({ deleteUsers }),
}));

import {
  eraseClinicData,
  executeClinicTerminationErasures,
} from "@/lib/compliance/clinic-erasure";

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function makeDoc(id: string, data: Record<string, unknown> = {}) {
  return { id, data: () => data, ref: { delete: vi.fn().mockResolvedValue(undefined) } };
}

function makeSnap(docs: ReturnType<typeof makeDoc>[]) {
  return { empty: docs.length === 0, size: docs.length, docs };
}

/** A Query/CollectionReference stand-in whose .limit().get() yields one page. */
function makeQuery(docs: ReturnType<typeof makeDoc>[]) {
  const snap = makeSnap(docs);
  const q: Record<string, unknown> = {};
  q.where = vi.fn(() => q);
  q.limit = vi.fn(() => ({ get: vi.fn().mockResolvedValue(snap) }));
  q.get = vi.fn().mockResolvedValue(snap);
  return q;
}

function makeSubcollection(id: string, docs: ReturnType<typeof makeDoc>[]) {
  const col = makeQuery(docs) as Record<string, unknown>;
  col.id = id;
  return col;
}

interface DbConfig {
  users?: ReturnType<typeof makeDoc>[];
  funnelEvents?: ReturnType<typeof makeDoc>[];
  dueClinics?: ReturnType<typeof makeDoc>[];
}

function makeDb(cfg: DbConfig = {}) {
  const erasureLogSet = vi.fn().mockResolvedValue(undefined);
  const usersQuery = makeQuery(cfg.users ?? []);
  const funnelQuery = makeQuery(cfg.funnelEvents ?? []);
  const clinicsQuery = makeQuery(cfg.dueClinics ?? []);
  const erasureLogCol = { doc: vi.fn(() => ({ set: erasureLogSet })) };

  const db = {
    collection: vi.fn((name: string) => {
      if (name === "users") return usersQuery;
      if (name === "funnel_events") return funnelQuery;
      if (name === "clinics") return clinicsQuery;
      if (name === "_erasure_log") return erasureLogCol;
      return makeQuery([]);
    }),
    batch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
  };

  return { db, erasureLogSet };
}

function makeClinicDoc(
  id: string,
  data: Record<string, unknown>,
  subcollections: ReturnType<typeof makeSubcollection>[]
) {
  return {
    id,
    data: () => data,
    ref: {
      listCollections: vi.fn().mockResolvedValue(subcollections),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

beforeEach(() => {
  deleteUsers.mockClear();
});

// ─── eraseClinicData ────────────────────────────────────────────────────────────

describe("eraseClinicData", () => {
  it("sweeps every subcollection, top-level docs, Auth accounts and the clinic doc", async () => {
    const { db } = makeDb({
      users: [makeDoc("uid-1"), makeDoc("uid-2")],
      funnelEvents: [makeDoc("fe-1")],
    });

    const subcollections = [
      makeSubcollection("appointments", [makeDoc("a1"), makeDoc("a2")]),
      makeSubcollection("audit_logs", [makeDoc("l1")]),
      makeSubcollection("integrations_config", [makeDoc("c1")]),
    ];
    const clinicDoc = makeClinicDoc("clinicX", { name: "Clinic X" }, subcollections);

    const result = await eraseClinicData(db as never, clinicDoc as never);

    // 4 subcollection docs + 2 users + 1 funnel + 1 clinic doc = 8
    expect(result.docsDeleted).toBe(8);
    expect(result.authUsersDeleted).toBe(2);
    expect(result.subcollections).toEqual(["appointments", "audit_logs", "integrations_config"]);

    // Auth accounts removed by uid
    expect(deleteUsers).toHaveBeenCalledWith(["uid-1", "uid-2"]);
    // Clinic doc deleted last
    expect(clinicDoc.ref.delete).toHaveBeenCalledTimes(1);
  });

  it("handles a clinic with no users (no Auth deletion attempted)", async () => {
    const { db } = makeDb({});
    const clinicDoc = makeClinicDoc("emptyClinic", { name: "Empty" }, [
      makeSubcollection("patients", []),
    ]);

    const result = await eraseClinicData(db as never, clinicDoc as never);

    expect(result.authUsersDeleted).toBe(0);
    expect(deleteUsers).not.toHaveBeenCalled();
    expect(result.docsDeleted).toBe(1); // just the clinic doc
  });
});

// ─── executeClinicTerminationErasures ───────────────────────────────────────────

describe("executeClinicTerminationErasures", () => {
  it("skips a scheduled clinic whose status is not 'churned' (never erases by accident)", async () => {
    const live = makeClinicDoc(
      "liveClinic",
      { name: "Live", status: "live", terminationScheduledAt: "2020-01-01T00:00:00.000Z" },
      [makeSubcollection("patients", [makeDoc("p1")])]
    );
    const { db, erasureLogSet } = makeDb({ dueClinics: [live] });

    const result = await executeClinicTerminationErasures(db as never);

    expect(result.erased).toBe(0);
    expect(result.skipped).toEqual(["liveClinic"]);
    expect(live.ref.delete).not.toHaveBeenCalled();
    expect(erasureLogSet).not.toHaveBeenCalled();
  });

  it("erases a churned clinic past its grace period and writes a tombstone", async () => {
    const churned = makeClinicDoc(
      "deadClinic",
      {
        name: "Dead Clinic",
        status: "churned",
        terminationRequestedAt: "2026-05-01T00:00:00.000Z",
        terminationScheduledAt: "2026-05-31T00:00:00.000Z",
        terminationReason: "contract ended",
        terminatedBy: "superadmin-1",
      },
      [makeSubcollection("appointments", [makeDoc("a1")])]
    );
    const { db, erasureLogSet } = makeDb({
      dueClinics: [churned],
      users: [makeDoc("uid-1"), makeDoc("uid-2")],
    });

    const result = await executeClinicTerminationErasures(db as never);

    expect(result.erased).toBe(1);
    expect(result.errors).toEqual([]);
    expect(churned.ref.delete).toHaveBeenCalledTimes(1);
    expect(erasureLogSet).toHaveBeenCalledTimes(1);

    const tombstone = erasureLogSet.mock.calls[0][0];
    expect(tombstone).toMatchObject({
      clinicId: "deadClinic",
      clinicName: "Dead Clinic",
      terminationReason: "contract ended",
      terminatedBy: "superadmin-1",
      authUsersDeleted: 2,
    });
    // Tombstone carries no patient PII — only counts + termination metadata.
    expect(tombstone).not.toHaveProperty("patients");
  });
});
