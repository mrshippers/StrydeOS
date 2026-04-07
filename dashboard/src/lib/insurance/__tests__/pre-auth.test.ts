/**
 * Pre-authorisation validation and session tracking tests.
 *
 * These test the pure business logic for PMI pre-auth management:
 * - Validating pre-auth data before write
 * - Computing session remaining
 * - Detecting expiry
 * - Determining when alerts should fire
 */

import { describe, it, expect } from "vitest";
import {
  validatePreAuth,
  computeSessionsRemaining,
  isPreAuthExpired,
  shouldAlertOwner,
  type PreAuth,
} from "../pre-auth";

describe("PreAuth — Validation", () => {
  it("rejects pre-auth without insurer name", () => {
    const result = validatePreAuth({
      insurerName: "",
      preAuthCode: "BU-2026-1234",
      sessionsAuthorised: 6,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("insurer");
  });

  it("rejects pre-auth without a code", () => {
    const result = validatePreAuth({
      insurerName: "Bupa",
      preAuthCode: "",
      sessionsAuthorised: 6,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("code");
  });

  it("rejects zero or negative sessions authorised", () => {
    const result = validatePreAuth({
      insurerName: "Bupa",
      preAuthCode: "BU-2026-1234",
      sessionsAuthorised: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("sessions");
  });

  it("accepts valid pre-auth with all required fields", () => {
    const result = validatePreAuth({
      insurerName: "Bupa",
      preAuthCode: "BU-2026-1234",
      sessionsAuthorised: 6,
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts valid pre-auth with optional expiry date", () => {
    const result = validatePreAuth({
      insurerName: "AXA Health",
      preAuthCode: "AXA-2026-789",
      sessionsAuthorised: 10,
      expiryDate: "2026-12-31",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects pre-auth with expiry date in the past", () => {
    const result = validatePreAuth({
      insurerName: "Bupa",
      preAuthCode: "BU-2026-1234",
      sessionsAuthorised: 6,
      expiryDate: "2020-01-01",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expir");
  });
});

describe("PreAuth — Session Tracking", () => {
  it("computes sessions remaining correctly", () => {
    expect(computeSessionsRemaining(6, 2)).toBe(4);
  });

  it("returns 0 when all sessions used", () => {
    expect(computeSessionsRemaining(6, 6)).toBe(0);
  });

  it("returns 0 when sessions used exceeds authorised (overshoot)", () => {
    expect(computeSessionsRemaining(6, 8)).toBe(0);
  });
});

describe("PreAuth — Expiry Detection", () => {
  it("returns false when no expiry date set", () => {
    const preAuth: PreAuth = {
      id: "pa-1",
      patientId: "pt-1",
      insurerName: "Bupa",
      preAuthCode: "BU-2026-1234",
      sessionsAuthorised: 6,
      sessionsUsed: 2,
      status: "confirmed",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(isPreAuthExpired(preAuth)).toBe(false);
  });

  it("returns true when expiry date has passed", () => {
    const preAuth: PreAuth = {
      id: "pa-1",
      patientId: "pt-1",
      insurerName: "Bupa",
      preAuthCode: "BU-2026-1234",
      sessionsAuthorised: 6,
      sessionsUsed: 2,
      expiryDate: "2020-01-01",
      status: "confirmed",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(isPreAuthExpired(preAuth)).toBe(true);
  });

  it("returns false when expiry date is in the future", () => {
    const preAuth: PreAuth = {
      id: "pa-1",
      patientId: "pt-1",
      insurerName: "Bupa",
      preAuthCode: "BU-2026-1234",
      sessionsAuthorised: 6,
      sessionsUsed: 2,
      expiryDate: "2099-12-31",
      status: "confirmed",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(isPreAuthExpired(preAuth)).toBe(false);
  });
});

describe("PreAuth — Owner Alerts", () => {
  const basePreAuth: PreAuth = {
    id: "pa-1",
    patientId: "pt-1",
    insurerName: "Bupa",
    preAuthCode: "BU-2026-1234",
    sessionsAuthorised: 6,
    sessionsUsed: 0,
    status: "confirmed",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("alerts when only 1 session remaining", () => {
    const result = shouldAlertOwner({ ...basePreAuth, sessionsUsed: 5 });
    expect(result.alert).toBe(true);
    expect(result.reason).toContain("session");
  });

  it("does not alert when plenty of sessions remaining", () => {
    const result = shouldAlertOwner({ ...basePreAuth, sessionsUsed: 2 });
    expect(result.alert).toBe(false);
  });

  it("alerts when all sessions exhausted", () => {
    const result = shouldAlertOwner({ ...basePreAuth, sessionsUsed: 6 });
    expect(result.alert).toBe(true);
    expect(result.reason).toContain("exhaust");
  });

  it("alerts when pre-auth has expired", () => {
    const result = shouldAlertOwner({ ...basePreAuth, expiryDate: "2020-01-01" });
    expect(result.alert).toBe(true);
    expect(result.reason).toContain("expir");
  });

  it("alerts when pre-auth status is rejected", () => {
    const result = shouldAlertOwner({ ...basePreAuth, status: "rejected" });
    expect(result.alert).toBe(true);
    expect(result.reason).toContain("reject");
  });

  it("does not alert for healthy confirmed pre-auth", () => {
    const result = shouldAlertOwner(basePreAuth);
    expect(result.alert).toBe(false);
  });
});
