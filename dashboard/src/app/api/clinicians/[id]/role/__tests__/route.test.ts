/**
 * Tests for PATCH /api/clinicians/[id]/role — RBAC role changes.
 * Security-critical guards: caller privilege, no self-change, owner-grant gate,
 * last-owner protection, and the user.role mirror.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ limited: false, remaining: 10 }),
}));
vi.mock("@/lib/request-logger", () => ({
  withRequestLog: <T extends (...a: unknown[]) => unknown>(h: T) => h,
}));
vi.mock("@/lib/audit-log", () => ({
  writeAuditLog: vi.fn(),
  extractIpFromRequest: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerify = vi.fn();
vi.mock("@/lib/auth-guard", () => ({
  verifyApiRequest: (...a: unknown[]) => mockVerify(...a),
  handleApiError: (err: unknown) => {
    const e = err as { statusCode?: number; message?: string };
    return new Response(JSON.stringify({ error: e.message ?? "error" }), {
      status: e.statusCode ?? 500,
      headers: { "Content-Type": "application/json" },
    });
  },
}));

// Path-keyed Firestore mock with collection listing.
const seed: Record<string, Record<string, unknown> | undefined> = {};
const writes: { path: string; data: Record<string, unknown> }[] = [];

function childrenOf(collPath: string) {
  return Object.keys(seed)
    .filter((p) => p.startsWith(collPath + "/") && p.split("/").length === collPath.split("/").length + 1 && seed[p])
    .map((p) => ({ id: p.split("/").pop()!, data: () => seed[p] }));
}
function docRef(path: string) {
  return {
    id: path.split("/").pop(),
    collection: (n: string) => collRef(`${path}/${n}`),
    get: async () => ({ exists: seed[path] !== undefined, id: path.split("/").pop(), data: () => seed[path] }),
    update: async (data: Record<string, unknown>) => { writes.push({ path, data }); seed[path] = { ...(seed[path] ?? {}), ...data }; },
    set: async (data: Record<string, unknown>) => { writes.push({ path, data }); seed[path] = { ...(seed[path] ?? {}), ...data }; },
  };
}
function collRef(path: string) {
  return { doc: (id: string) => docRef(`${path}/${id}`), get: async () => ({ docs: childrenOf(path) }) };
}
vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({ collection: (n: string) => collRef(n) }),
}));

import { PATCH } from "../route";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/clinicians/c-target/role", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", authorization: "Bearer t" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "c-target" }) };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seed)) delete seed[k];
  writes.length = 0;
  mockVerify.mockResolvedValue({ uid: "owner-uid", email: "owner@c.co", clinicId: "clinic-1", role: "owner" });
  seed["users/owner-uid"] = { role: "owner" };
  seed["clinics/clinic-1/clinicians/c-target"] = { authUid: "max-uid", authRole: "clinician", name: "Max", active: true };
});

describe("PATCH /api/clinicians/[id]/role", () => {
  it("promotes a clinician to admin and mirrors to the user's role", async () => {
    const res = await PATCH(req({ role: "admin" }), ctx);
    expect(res.status).toBe(200);
    expect(seed["clinics/clinic-1/clinicians/c-target"]!.authRole).toBe("admin");
    expect(seed["users/max-uid"]!.role).toBe("admin");
  });

  it("rejects a non-admin caller", async () => {
    mockVerify.mockResolvedValue({ uid: "cl-uid", email: "c@c.co", clinicId: "clinic-1", role: "clinician" });
    const res = await PATCH(req({ role: "admin" }), ctx);
    expect(res.status).toBe(403);
  });

  it("rejects changing your own role", async () => {
    seed["clinics/clinic-1/clinicians/c-target"] = { authUid: "owner-uid", authRole: "owner", name: "Me", active: true };
    const res = await PATCH(req({ role: "admin" }), ctx);
    expect(res.status).toBe(403);
  });

  it("stops an admin from granting owner", async () => {
    mockVerify.mockResolvedValue({ uid: "admin-uid", email: "a@c.co", clinicId: "clinic-1", role: "admin" });
    seed["users/admin-uid"] = { role: "admin" };
    const res = await PATCH(req({ role: "owner" }), ctx);
    expect(res.status).toBe(403);
  });

  it("protects the last active owner", async () => {
    seed["clinics/clinic-1/clinicians/c-target"] = { authUid: "max-uid", authRole: "owner", name: "Only Owner", active: true };
    const res = await PATCH(req({ role: "admin" }), ctx);
    expect(res.status).toBe(409);
  });

  it("rejects an invalid role", async () => {
    const res = await PATCH(req({ role: "superadmin" }), ctx);
    expect(res.status).toBe(400);
  });
});
