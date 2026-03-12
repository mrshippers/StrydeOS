/**
 * useEntitlements — client-side module access check.
 *
 * Access order:
 *   1. Trial active → all modules open
 *   2. featureFlags from Stripe subscription → per-module
 *   3. Neither → locked (ModuleGuard shows LockedModulePage)
 *
 * The source of truth for featureFlags is set by the Stripe webhook.
 * The source of truth for trialStartedAt is the Firestore clinic doc.
 */

import { useAuth } from "@/hooks/useAuth";
import {
  isTrialActive,
  trialDaysRemaining as computeDaysRemaining,
} from "@/lib/billing";
import type { ModuleKey } from "@/lib/billing";

export interface Entitlements {
  hasIntelligence: boolean;
  hasPulse: boolean;
  hasAva: boolean;
  loading: boolean;
  trialActive: boolean;
  trialDaysRemaining: number | null;
  hasModule: (module: ModuleKey) => boolean;
}

export function useEntitlements(): Entitlements {
  const { user, loading } = useAuth();
  const flags = user?.clinicProfile?.featureFlags;
  const trialStartedAt = user?.clinicProfile?.trialStartedAt ?? null;
  const clinicId = user?.clinicId;

  const trialActive = isTrialActive(trialStartedAt, clinicId);
  const daysLeft = computeDaysRemaining(trialStartedAt, clinicId);

  // Trial grants full access; falls through to Stripe flags otherwise
  const hasIntelligence = trialActive || (flags?.intelligence ?? false);
  const hasPulse        = trialActive || (flags?.continuity ?? false);
  const hasAva          = trialActive || (flags?.receptionist ?? false);

  function hasModule(module: ModuleKey): boolean {
    if (trialActive) return true;
    switch (module) {
      case "intelligence": return flags?.intelligence ?? false;
      case "pulse":        return flags?.continuity ?? false;
      case "ava":          return flags?.receptionist ?? false;
    }
  }

  return {
    hasIntelligence,
    hasPulse,
    hasAva,
    loading,
    trialActive,
    trialDaysRemaining: daysLeft,
    hasModule,
  };
}
