/**
 * useEntitlements — client-side module access check.
 *
 * Access order:
 *   0. Superadmin → all modules open (no billing gate)
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
  const isSuperadmin = user?.role === "superadmin" || user?.role === "owner";

  const trialActive = isTrialActive(trialStartedAt);
  const daysLeft = computeDaysRemaining(trialStartedAt);

  // Superadmin and trial both grant full access; falls through to Stripe flags otherwise
  const hasIntelligence = isSuperadmin || trialActive || (flags?.intelligence ?? false);
  const hasPulse        = isSuperadmin || trialActive || (flags?.continuity ?? false);
  const hasAva          = isSuperadmin || trialActive || (flags?.receptionist ?? false);

  function hasModule(module: ModuleKey): boolean {
    if (isSuperadmin) return true;
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
