/**
 * useEntitlements — client-side module access check.
 *
 * Access order:
 *   0. Demo user (uid "demo") → all modules open (synthetic data, no real billing)
 *   1. Superadmin → all modules open (no billing gate)
 *   2. Trial active → per-module based on trialModule
 *   3. featureFlags from Stripe subscription → per-module
 *   4. None of the above → locked (ModuleGuard shows LockedModulePage)
 *
 * Demo is not a trial and not a subscription — it's a preview mode. Treat it
 * as first-class so every downstream UI (billing, banners, guards) can branch
 * on `isDemo` instead of pretending the clinic has an active subscription.
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
  isDemo: boolean;
  hasModule: (module: ModuleKey) => boolean;
}

export function useEntitlements(): Entitlements {
  const { user, loading } = useAuth();
  const flags = user?.clinicProfile?.featureFlags;
  const trialStartedAt = user?.clinicProfile?.trialStartedAt ?? null;
  const trialModule: string | null = user?.clinicProfile?.trialModule ?? null;
  const isSuperadmin = user?.role === "superadmin";
  const isDemo = user?.uid === "demo";

  // Demo mode is a preview of the full product — never treat as a trial.
  const trialActive = !isDemo && isTrialActive(trialStartedAt);
  const daysLeft = isDemo ? null : computeDaysRemaining(trialStartedAt);

  // Trial grants access to selected module only (fullstack = all three)
  function trialGrantsModule(module: ModuleKey): boolean {
    if (!trialActive || !trialModule) return false;
    if (trialModule === "fullstack") return true;
    return trialModule === module;
  }

  // Demo + superadmin bypass all billing gating.
  const hasIntelligence = isDemo || isSuperadmin || trialGrantsModule("intelligence") || (flags?.intelligence ?? false);
  const hasPulse        = isDemo || isSuperadmin || trialGrantsModule("pulse")        || (flags?.continuity ?? false);
  const hasAva          = isDemo || isSuperadmin || trialGrantsModule("ava")          || (flags?.receptionist ?? false);

  function hasModule(module: ModuleKey): boolean {
    if (isDemo) return true;
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
    isDemo,
    hasModule,
  };
}
