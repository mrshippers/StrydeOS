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
  const trialModule: string | null = (user?.clinicProfile as unknown as Record<string, unknown>)?.trialModule as string | null ?? null;
  const isSuperadmin = user?.role === "superadmin";

  const trialActive = isTrialActive(trialStartedAt);
  const daysLeft = computeDaysRemaining(trialStartedAt);

  // Trial grants access to selected module only (fullstack = all three)
  function trialGrantsModule(module: ModuleKey): boolean {
    if (!trialActive || !trialModule) return false;
    if (trialModule === "fullstack") return true;
    return trialModule === module;
  }

  // Superadmin bypasses all billing; owners are subject to trial + Stripe flags
  const hasIntelligence = isSuperadmin || trialGrantsModule("intelligence") || (flags?.intelligence ?? false);
  const hasPulse        = isSuperadmin || trialGrantsModule("pulse")        || (flags?.continuity ?? false);
  const hasAva          = isSuperadmin || trialGrantsModule("ava")          || (flags?.receptionist ?? false);

  function hasModule(module: ModuleKey): boolean {
    if (isSuperadmin) return true;
    if (trialGrantsModule(module)) return true;
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
