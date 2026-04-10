/**
 * Tests for Heidi per-clinician access helpers.
 *
 * These mirror the server-side rules enforced in
 * src/app/api/clinicians/[id]/heidi/route.ts so the UI can hide
 * controls clinicians cannot use, without leaking admin-only options.
 */

import { describe, it, expect } from "vitest";
import { canEditHeidi, validateHeidiPatch } from "../access";

describe("canEditHeidi", () => {
  it("allows an owner to edit any clinician's Heidi settings", () => {
    const viewer = { role: "owner" as const, clinicianId: "clin-owner" };
    expect(canEditHeidi(viewer, "clin-andrew")).toBe(true);
    expect(canEditHeidi(viewer, "clin-max")).toBe(true);
  });

  it("allows an admin to edit any clinician", () => {
    const viewer = { role: "admin" as const, clinicianId: "clin-admin" };
    expect(canEditHeidi(viewer, "clin-andrew")).toBe(true);
  });

  it("allows a superadmin to edit any clinician", () => {
    const viewer = { role: "superadmin" as const, clinicianId: undefined };
    expect(canEditHeidi(viewer, "clin-andrew")).toBe(true);
  });

  it("allows a clinician to edit only their own record", () => {
    const viewer = { role: "clinician" as const, clinicianId: "clin-andrew" };
    expect(canEditHeidi(viewer, "clin-andrew")).toBe(true);
  });

  it("forbids a clinician editing another clinician's record", () => {
    const viewer = { role: "clinician" as const, clinicianId: "clin-andrew" };
    expect(canEditHeidi(viewer, "clin-max")).toBe(false);
  });

  it("forbids a clinician with no clinicianId from editing anything", () => {
    const viewer = { role: "clinician" as const, clinicianId: undefined };
    expect(canEditHeidi(viewer, "clin-andrew")).toBe(false);
  });
});

describe("validateHeidiPatch", () => {
  it("accepts disable payload with no email", () => {
    const result = validateHeidiPatch({ enabled: false });
    expect(result.ok).toBe(true);
  });

  it("accepts enable payload with a valid email", () => {
    const result = validateHeidiPatch({ enabled: true, email: "andrew@spires.co.uk" });
    expect(result.ok).toBe(true);
  });

  it("rejects enable without an email", () => {
    const result = validateHeidiPatch({ enabled: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/email/i);
  });

  it("rejects enable with a whitespace-only email", () => {
    const result = validateHeidiPatch({ enabled: true, email: "   " });
    expect(result.ok).toBe(false);
  });

  it("rejects enable with a malformed email", () => {
    const result = validateHeidiPatch({ enabled: true, email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/email/i);
  });

  it("trims whitespace around a valid email", () => {
    const result = validateHeidiPatch({ enabled: true, email: "  andrew@spires.co.uk  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.email).toBe("andrew@spires.co.uk");
  });

  it("rejects enable when the clinic-level Heidi config is not connected", () => {
    const result = validateHeidiPatch(
      { enabled: true, email: "andrew@spires.co.uk" },
      { clinicHeidiConnected: false },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/clinic/i);
  });

  it("allows disable regardless of clinic-level connection state", () => {
    const result = validateHeidiPatch(
      { enabled: false },
      { clinicHeidiConnected: false },
    );
    expect(result.ok).toBe(true);
  });
});
