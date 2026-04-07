/**
 * Pre-authorisation validation and session tracking logic.
 *
 * Pure business logic — no Firebase or external dependencies.
 * Used by the pre-auth API route and session tracking pipeline.
 */

import type { PreAuthStatus } from "@/types";

export interface PreAuth {
  id: string;
  patientId: string;
  insurerName: string;
  preAuthCode: string;
  sessionsAuthorised: number;
  sessionsUsed: number;
  expiryDate?: string;
  excessAmountPence?: number;
  excessCollected?: boolean;
  status: PreAuthStatus;
  confirmedBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface ValidationInput {
  insurerName: string;
  preAuthCode: string;
  sessionsAuthorised: number;
  expiryDate?: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePreAuth(input: ValidationInput): ValidationResult {
  if (!input.insurerName.trim()) {
    return { valid: false, error: "Missing insurer name" };
  }

  if (!input.preAuthCode.trim()) {
    return { valid: false, error: "Missing pre-authorisation code" };
  }

  if (input.sessionsAuthorised <= 0) {
    return { valid: false, error: "Authorised sessions must be at least 1" };
  }

  if (input.expiryDate) {
    const expiry = new Date(input.expiryDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (expiry < now) {
      return { valid: false, error: "Pre-auth expiry date is in the past" };
    }
  }

  return { valid: true };
}

export function computeSessionsRemaining(
  authorised: number,
  used: number
): number {
  return Math.max(0, authorised - used);
}

export function isPreAuthExpired(preAuth: PreAuth): boolean {
  if (!preAuth.expiryDate) return false;
  const expiry = new Date(preAuth.expiryDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return expiry < now;
}

interface AlertResult {
  alert: boolean;
  reason?: string;
}

export function shouldAlertOwner(preAuth: PreAuth): AlertResult {
  if (preAuth.status === "rejected") {
    return { alert: true, reason: "Pre-auth rejected by insurer" };
  }

  if (isPreAuthExpired(preAuth)) {
    return { alert: true, reason: "Pre-auth has expired" };
  }

  const remaining = computeSessionsRemaining(
    preAuth.sessionsAuthorised,
    preAuth.sessionsUsed
  );

  if (remaining === 0) {
    return { alert: true, reason: "All authorised sessions exhausted" };
  }

  if (remaining === 1) {
    return { alert: true, reason: "Only 1 authorised session remaining" };
  }

  return { alert: false };
}
