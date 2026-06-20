/**
 * P0-13 tests for resolve-recipient.ts — Recipient validation, clinic binding, audit.
 *
 * Security-sensitive: clinical PII and revenue figures are sent to recipients
 * resolved by this module. All paths must be exercised.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { resolveRecipient } from "../resolve-recipient";

// ─── Firestore mock helpers ──────────────────────────────────────────────────

/**
 * Build a mock Firestore db that returns user docs matching the supplied
 * email/clinicId pair. Pass empty docs array to simulate "not found".
 */
function makeMockDb(opts: {
  userDocs?: Array<{ uid: string; email: string; clinicId: string }>;
  auditAddFn?: ReturnType<typeof vi.fn>;
} = {}) {
  const { userDocs = [], auditAddFn = vi.fn().mockResolvedValue({ id: "audit-1" }) } = opts;

  // Convert user docs to the shape Firestore returns
  const queryDocs = userDocs.map((u) => ({
    id: u.uid,
    data: () => ({ email: u.email, clinicId: u.clinicId }),
  }));

  const auditAddMock = auditAddFn;

  // Nested chain: db.collection('users').where('clinicId', '==', c).where('email', '==', e).limit(1).get()
  // and: db.collection('clinics').doc(clinicId).collection('audit_logs').add(entry)
  const limitGetFn = vi.fn().mockResolvedValue({ docs: queryDocs, empty: queryDocs.length === 0 });
  const limitFn = vi.fn(() => ({ get: limitGetFn }));
  const where2Fn = vi.fn(() => ({ limit: limitFn }));
  const where1Fn = vi.fn(() => ({ where: where2Fn }));

  // clinic doc chain for audit_logs
  const auditCollFn = vi.fn(() => ({ add: auditAddMock }));
  const clinicDocFn = vi.fn(() => ({ collection: auditCollFn }));
  const clinicsCollFn = vi.fn(() => ({ doc: clinicDocFn }));

  const collectionFn = vi.fn((name: string) => {
    if (name === "users") return { where: where1Fn };
    if (name === "clinics") return { doc: clinicDocFn };
    return {};
  });

  return {
    db: { collection: collectionFn } as unknown as Firestore,
    limitGetFn,
    auditAddMock,
    collectionFn,
    where1Fn,
    where2Fn,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("resolveRecipient — format validation", () => {
  it("rejects an email missing @", async () => {
    const { db } = makeMockDb();
    const result = await resolveRecipient("notanemail", "clinic-1", db);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/format/i);
  });

  it("rejects an email missing domain", async () => {
    const { db } = makeMockDb();
    const result = await resolveRecipient("user@", "clinic-1", db);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/format/i);
  });

  it("rejects an email missing local part", async () => {
    const { db } = makeMockDb();
    const result = await resolveRecipient("@domain.com", "clinic-1", db);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/format/i);
  });

  it("rejects an email with spaces", async () => {
    const { db } = makeMockDb();
    const result = await resolveRecipient("user @domain.com", "clinic-1", db);
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/format/i);
  });

  it("does NOT hit Firestore for an invalid format email", async () => {
    const { db, collectionFn } = makeMockDb();
    await resolveRecipient("bademail", "clinic-1", db);
    expect(collectionFn).not.toHaveBeenCalled();
  });
});

describe("resolveRecipient — role/test domain rejection", () => {
  const roleAddresses = [
    "admin@clinic.com",
    "noreply@someplace.org",
    "no-reply@emails.io",
    "test@example.com",
    "mailer-daemon@domain.com",
    "postmaster@clinic.co.uk",
  ];

  for (const addr of roleAddresses) {
    it(`rejects role address: ${addr}`, async () => {
      const { db } = makeMockDb();
      const result = await resolveRecipient(addr, "clinic-1", db);
      expect(result.valid).toBe(false);
      expect((result as { valid: false; reason: string }).reason).toMatch(/role|test/i);
    });
  }

  it("does NOT hit Firestore for a role address", async () => {
    const { db, collectionFn } = makeMockDb();
    await resolveRecipient("admin@clinic.com", "clinic-1", db);
    expect(collectionFn).not.toHaveBeenCalled();
  });
});

describe("resolveRecipient — clinic membership check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid:true with uid when email belongs to this clinic", async () => {
    const { db } = makeMockDb({
      userDocs: [{ uid: "user-abc", email: "physio@spires.com", clinicId: "clinic-1" }],
    });

    const result = await resolveRecipient("physio@spires.com", "clinic-1", db);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.uid).toBe("user-abc");
      expect(result.email).toBe("physio@spires.com");
    }
  });

  it("returns valid:false + isDrift:true when email not found in this clinic", async () => {
    // No matching user docs
    const { db } = makeMockDb({ userDocs: [] });

    const result = await resolveRecipient("ghost@clinic.com", "clinic-1", db);
    expect(result.valid).toBe(false);
    const invalid = result as { valid: false; reason: string; isDrift?: boolean };
    expect(invalid.isDrift).toBe(true);
    expect(invalid.reason).toMatch(/not found|clinic/i);
  });

  it("records a drift event in audit_logs when email is valid format but absent from clinic", async () => {
    const auditAddFn = vi.fn().mockResolvedValue({ id: "audit-drift-1" });
    const { db } = makeMockDb({ userDocs: [], auditAddFn });

    await resolveRecipient("ghost@clinic.com", "clinic-1", db);

    expect(auditAddFn).toHaveBeenCalledTimes(1);
    const written = auditAddFn.mock.calls[0][0];
    expect(written.metadata?.event).toBe("recipient_drift");
    expect(written.metadata?.security).toBe(true);
    expect(written.metadata?.recipient).toBe("ghost@clinic.com");
    expect(written.metadata?.clinicId).toBe("clinic-1");
  });

  it("queries Firestore users collection with clinicId AND email where-clauses", async () => {
    const { db, where1Fn, where2Fn } = makeMockDb({ userDocs: [] });

    await resolveRecipient("physio@spires.com", "clinic-99", db);

    expect(where1Fn).toHaveBeenCalledWith("clinicId", "==", "clinic-99");
    expect(where2Fn).toHaveBeenCalledWith("email", "==", "physio@spires.com");
  });
});

describe("resolveRecipient — multi-tenant isolation", () => {
  it("rejects a recipient who belongs to a DIFFERENT clinicId", async () => {
    // The user doc returned has clinicId "clinic-OTHER", not "clinic-1".
    // The query is scoped to clinic-1 so no docs would match — simulated as empty.
    const { db } = makeMockDb({ userDocs: [] });

    const result = await resolveRecipient("physio@other.com", "clinic-1", db);
    expect(result.valid).toBe(false);
    const invalid = result as { valid: false; isDrift?: boolean };
    expect(invalid.isDrift).toBe(true);
  });

  it("does not mix up recipients across clinics in the same call batch", async () => {
    // clinic-A has this user, clinic-B does not
    const dbA = makeMockDb({
      userDocs: [{ uid: "u-1", email: "shared@physio.com", clinicId: "clinic-a" }],
    });
    const dbB = makeMockDb({ userDocs: [] });

    const [resultA, resultB] = await Promise.all([
      resolveRecipient("shared@physio.com", "clinic-a", dbA.db),
      resolveRecipient("shared@physio.com", "clinic-b", dbB.db),
    ]);

    expect(resultA.valid).toBe(true);
    expect(resultB.valid).toBe(false);
    if (!resultB.valid) {
      expect(resultB.isDrift).toBe(true);
    }
  });
});
