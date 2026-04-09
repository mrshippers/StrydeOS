/**
 * Tests for PATCH /api/clinicians/[id]/heidi
 *
 * Allows clinicians to opt in/out of Heidi by setting their email.
 * Clinicians can only update their OWN record.
 * Admins/owners can update any clinician in their clinic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-guard", () => ({
  verifyApiRequest: vi.fn(),
  requireRole: vi.fn(),
  handleApiError: (e: unknown) => {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  },
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    get: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (fn: unknown) => fn,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDb(clinicianData?: Record<string, unknown>, ownerRole = "owner") {
  const updateImpl = vi.fn().mockResolvedValue(undefined);
  const getImpl = vi.fn().mockResolvedValue({
    exists: !!clinicianData,
    data: () => clinicianData ?? null,
  });

  // Leaf doc (the actual clinician doc): has get + update
  const clinicianDocRef = { get: getImpl, update: updateImpl };
  const cliniciansColRef = { doc: vi.fn().mockReturnValue(clinicianDocRef) };
  const clinicDocRef = { collection: vi.fn().mockReturnValue(cliniciansColRef) };
  const clinicsColRef = { doc: vi.fn().mockReturnValue(clinicDocRef) };

  // users collection — for the admin role re-verification in the route
  const userDocRef = { get: vi.fn().mockResolvedValue({ data: () => ({ role: ownerRole }) }) };
  const usersColRef = { doc: vi.fn().mockReturnValue(userDocRef) };

  const db = {
    collection: vi.fn().mockImplementation((name: string) =>
      name === "users" ? usersColRef : clinicsColRef,
    ),
  };
  return { db, getImpl, updateImpl };
}

async function makeRequest(
  clinicianId: string,
  body: Record<string, unknown>,
  authOverride?: Partial<{ uid: string; clinicId: string; role: string; clinicianId: string }>,
) {
  const { verifyApiRequest } = await import("@/lib/auth-guard");
  vi.mocked(verifyApiRequest).mockResolvedValue({
    uid: "user-1",
    email: "andrew@spires.co.uk",
    clinicId: "clinic-1",
    role: "clinician",
    clinicianId: "clin-andrew",
    ...authOverride,
  } as never);

  return new NextRequest(`http://localhost/api/clinicians/${clinicianId}/heidi`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("PATCH /api/clinicians/[id]/heidi", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("allows a clinician to enable Heidi on their own account", async () => {
    const { db, updateImpl } = makeDb({ name: "Andrew", active: true });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest(
      "clin-andrew",
      { enabled: true, email: "andrew@spires.co.uk" },
      { clinicianId: "clin-andrew", role: "clinician" },
    );

    const { PATCH } = await import("../[id]/heidi/route");
    const res = await PATCH(req, { params: Promise.resolve({ id: "clin-andrew" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(updateImpl).toHaveBeenCalledWith(
      expect.objectContaining({ heidiEnabled: true, heidiEmail: "andrew@spires.co.uk" }),
    );
  });

  it("allows a clinician to disable Heidi (opt out)", async () => {
    const { db, updateImpl } = makeDb({ name: "Andrew", active: true });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest(
      "clin-andrew",
      { enabled: false },
      { clinicianId: "clin-andrew", role: "clinician" },
    );

    const { PATCH } = await import("../[id]/heidi/route");
    const res = await PATCH(req, { params: Promise.resolve({ id: "clin-andrew" }) });

    expect(res.status).toBe(200);
    expect(updateImpl).toHaveBeenCalledWith(
      expect.objectContaining({ heidiEnabled: false, heidiEmail: null }),
    );
  });

  it("forbids a clinician updating another clinician's Heidi settings", async () => {
    const { db } = makeDb({ name: "Max", active: true });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest(
      "clin-max",
      { enabled: true, email: "max@spires.co.uk" },
      { clinicianId: "clin-andrew", role: "clinician" }, // andrew trying to update max
    );

    const { PATCH } = await import("../[id]/heidi/route");
    const res = await PATCH(req, { params: Promise.resolve({ id: "clin-max" }) });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/own/i);
  });

  it("allows owner to update any clinician's Heidi settings", async () => {
    const { db, updateImpl } = makeDb({ name: "Max", active: true });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest(
      "clin-max",
      { enabled: true, email: "max@spires.co.uk" },
      { clinicianId: "user-owner", role: "owner" },
    );

    const { PATCH } = await import("../[id]/heidi/route");
    const res = await PATCH(req, { params: Promise.resolve({ id: "clin-max" }) });

    expect(res.status).toBe(200);
    expect(updateImpl).toHaveBeenCalled();
  });

  it("returns 404 when clinician doc does not exist", async () => {
    const { db } = makeDb(undefined); // no data → exists: false
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest(
      "clin-ghost",
      { enabled: true, email: "ghost@spires.co.uk" },
      { clinicianId: "user-owner", role: "owner" },
    );

    const { PATCH } = await import("../[id]/heidi/route");
    const res = await PATCH(req, { params: Promise.resolve({ id: "clin-ghost" }) });

    expect(res.status).toBe(404);
  });

  it("returns 400 when enabling without providing email", async () => {
    const { db } = makeDb({ name: "Andrew", active: true });
    const { getAdminDb } = await import("@/lib/firebase-admin");
    vi.mocked(getAdminDb).mockReturnValue(db as never);

    const req = await makeRequest(
      "clin-andrew",
      { enabled: true }, // no email
      { clinicianId: "clin-andrew", role: "clinician" },
    );

    const { PATCH } = await import("../[id]/heidi/route");
    const res = await PATCH(req, { params: Promise.resolve({ id: "clin-andrew" }) });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/email/i);
  });
});
