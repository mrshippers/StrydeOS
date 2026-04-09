/**
 * P0 tests for audit-log.ts — Firestore audit log writing and IP extraction.
 *
 * Audit logging is a HIPAA compliance requirement. These tests verify that
 * entries are written to the correct Firestore path and that IP extraction
 * handles the standard reverse-proxy header chain correctly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { writeAuditLog, extractIpFromRequest } from "../audit-log";

// ─── Firestore mock ─────────────────────────────────────────────────────────

function createMockDb() {
  const addFn = vi.fn().mockResolvedValue({ id: "audit-doc-123" });
  const collectionFn = vi.fn();
  const docFn = vi.fn();

  // Chain: db.collection("clinics").doc(clinicId).collection("audit_logs").add(entry)
  collectionFn.mockImplementation((name: string) => {
    if (name === "clinics") {
      return { doc: docFn };
    }
    // subcollection: "audit_logs"
    return { add: addFn };
  });

  docFn.mockReturnValue({ collection: collectionFn });

  return {
    db: { collection: collectionFn } as unknown as Firestore,
    addFn,
    collectionFn,
    docFn,
  };
}

// ─── writeAuditLog ──────────────────────────────────────────────────────────

describe("writeAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("writes to clinics/{clinicId}/audit_logs collection", async () => {
    const { db, collectionFn, docFn, addFn } = createMockDb();

    await writeAuditLog(db, "clinic-42", {
      userId: "user-1",
      userEmail: "test@clinic.com",
      action: "read",
      resource: "patients",
      resourceId: "patient-99",
    });

    // Verify Firestore path: clinics -> doc(clinicId) -> audit_logs -> add()
    expect(collectionFn).toHaveBeenCalledWith("clinics");
    expect(docFn).toHaveBeenCalledWith("clinic-42");
    expect(collectionFn).toHaveBeenCalledWith("audit_logs");
    expect(addFn).toHaveBeenCalledTimes(1);
  });

  it("adds a timestamp to the entry", async () => {
    const { db, addFn } = createMockDb();

    await writeAuditLog(db, "clinic-1", {
      userId: "user-1",
      userEmail: "admin@clinic.com",
      action: "write",
      resource: "settings",
    });

    const writtenEntry = addFn.mock.calls[0][0];
    expect(writtenEntry.timestamp).toBeDefined();
    // Should be a valid ISO string
    expect(new Date(writtenEntry.timestamp).toISOString()).toBe(writtenEntry.timestamp);
  });

  it("preserves all entry fields in the written document", async () => {
    const { db, addFn } = createMockDb();

    const entry = {
      userId: "user-7",
      userEmail: "clinician@clinic.com",
      action: "update" as const,
      resource: "patients",
      resourceId: "patient-55",
      metadata: { field: "email", oldValue: "old@test.com" },
      ip: "192.168.1.1",
    };

    await writeAuditLog(db, "clinic-1", entry);

    const writtenEntry = addFn.mock.calls[0][0];
    expect(writtenEntry.userId).toBe("user-7");
    expect(writtenEntry.userEmail).toBe("clinician@clinic.com");
    expect(writtenEntry.action).toBe("update");
    expect(writtenEntry.resource).toBe("patients");
    expect(writtenEntry.resourceId).toBe("patient-55");
    expect(writtenEntry.metadata).toEqual({ field: "email", oldValue: "old@test.com" });
    expect(writtenEntry.ip).toBe("192.168.1.1");
  });

  it("does not throw when Firestore write fails (logs + reports to Sentry)", async () => {
    const { db } = createMockDb();
    // Override to make the chain fail
    (db as any).collection = vi.fn(() => {
      throw new Error("Firestore unavailable");
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Should not throw — audit log failures are logged, not propagated
    await expect(
      writeAuditLog(db, "clinic-1", {
        userId: "user-1",
        userEmail: "test@clinic.com",
        action: "login",
        resource: "auth",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    const errorMessage = consoleSpy.mock.calls[0].join(" ");
    expect(errorMessage).toContain("audit log write error");

    consoleSpy.mockRestore();
  });
});

// ─── extractIpFromRequest ───────────────────────────────────────────────────

describe("extractIpFromRequest", () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request("http://localhost:3000/api/test", {
      headers: new Headers(headers),
    });
  }

  it("reads the first IP from x-forwarded-for header", () => {
    const req = makeRequest({ "x-forwarded-for": "203.0.113.50, 70.41.3.18, 150.172.238.178" });
    expect(extractIpFromRequest(req)).toBe("203.0.113.50");
  });

  it("trims whitespace from the x-forwarded-for IP", () => {
    const req = makeRequest({ "x-forwarded-for": "  10.0.0.1  , 172.16.0.1" });
    expect(extractIpFromRequest(req)).toBe("10.0.0.1");
  });

  it("handles single IP in x-forwarded-for (no comma)", () => {
    const req = makeRequest({ "x-forwarded-for": "192.168.1.1" });
    expect(extractIpFromRequest(req)).toBe("192.168.1.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = makeRequest({ "x-real-ip": "10.0.0.5" });
    expect(extractIpFromRequest(req)).toBe("10.0.0.5");
  });

  it("prefers x-forwarded-for over x-real-ip when both present", () => {
    const req = makeRequest({
      "x-forwarded-for": "203.0.113.50",
      "x-real-ip": "10.0.0.5",
    });
    expect(extractIpFromRequest(req)).toBe("203.0.113.50");
  });

  it("returns undefined when no IP headers are present", () => {
    const req = makeRequest({});
    expect(extractIpFromRequest(req)).toBeUndefined();
  });

  it("returns undefined when headers contain unrelated values only", () => {
    const req = makeRequest({ "user-agent": "Mozilla/5.0", "accept": "application/json" });
    expect(extractIpFromRequest(req)).toBeUndefined();
  });
});
