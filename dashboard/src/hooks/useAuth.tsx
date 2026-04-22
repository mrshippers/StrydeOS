"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  getIdToken,
  multiFactor,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getFirebaseAuth, db, isFirebaseConfigured } from "@/lib/firebase";
import type { AuthUser, ClinicProfile, UserRole, UserStatus, FeatureFlags, BillingState, BillingTier, StripeSubscriptionStatus, ClinicStatus, PmsProvider, HepProvider, NpsConfig } from "@/types";

async function createServerSession(fbUser: User): Promise<void> {
  try {
    const idToken = await getIdToken(fbUser);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Session API returned ${res.status}`);
  } catch {
    // Session API unreachable or timed out — do not set a client-side cookie fallback.
    // The middleware will redirect to /login if no valid HMAC-signed session exists.
  }
}

async function clearServerSession(): Promise<void> {
  try {
    await fetch("/api/auth/session", { method: "DELETE" });
  } catch {
    // Session API unreachable — cookie will expire naturally or on next successful logout.
  }
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  intelligence: false,
  continuity: false,
  receptionist: false,
};

/**
 * Single source of truth for parsing a raw Firestore clinic document into a ClinicProfile.
 * Eliminates divergent defaults across fetchUserProfile, onSnapshot, and switchClinic.
 */
function parseClinicProfile(id: string, raw: Record<string, unknown>): ClinicProfile {
  const billingRaw = raw.billing as Record<string, unknown> | undefined;
  const billing: BillingState | undefined = billingRaw
    ? {
        stripeCustomerId: (billingRaw.stripeCustomerId as string) ?? null,
        subscriptionId: (billingRaw.subscriptionId as string) ?? null,
        subscriptionStatus: (billingRaw.subscriptionStatus as StripeSubscriptionStatus) ?? null,
        currentPeriodEnd: (billingRaw.currentPeriodEnd as string) ?? null,
        tier: (billingRaw.tier as BillingTier) ?? null,
        extraSeats: billingRaw.extraSeats as number | undefined,
      }
    : undefined;

  const targetsRaw = raw.targets as Record<string, unknown> | undefined;
  const onboardingRaw = raw.onboarding as Record<string, boolean> | undefined;

  return {
    id,
    name: (raw.name as string) ?? "",
    timezone: (raw.timezone as string) ?? "Europe/London",
    ownerEmail: (raw.ownerEmail as string) ?? "",
    address: raw.address as string | undefined,
    phone: raw.phone as string | undefined,
    sessionPricePence: raw.sessionPricePence as number | undefined,
    parkingInfo: raw.parkingInfo as string | undefined,
    website: raw.website as string | undefined,
    status: (raw.status as ClinicStatus) ?? "onboarding",
    pmsType: (raw.pmsType as PmsProvider) ?? null,
    pmsLastSyncAt: (raw.pmsLastSyncAt as string) ?? ((raw.pms as Record<string, unknown>)?.lastSyncAt as string) ?? null,
    featureFlags: {
      ...DEFAULT_FEATURE_FLAGS,
      ...((raw.featureFlags as Partial<FeatureFlags>) ?? {}),
    },
    targets: {
      followUpRate: (targetsRaw?.followUpRate as number) ?? 4.0,
      hepRate: (targetsRaw?.hepRate as number) ?? (targetsRaw?.physitrackRate as number) ?? 95,
      utilisationRate: (targetsRaw?.utilisationRate as number) ?? 75,
      dnaRate: (targetsRaw?.dnaRate as number) ?? 6,
      treatmentCompletionTarget: (targetsRaw?.treatmentCompletionTarget as number) ?? 80,
    },
    brandConfig: (raw.brandConfig as Record<string, unknown>) ?? {},
    onboarding: {
      pmsConnected: onboardingRaw?.pmsConnected ?? false,
      cliniciansConfirmed: onboardingRaw?.cliniciansConfirmed ?? false,
      targetsSet: onboardingRaw?.targetsSet ?? false,
    },
    onboardingV2: raw.onboardingV2 as ClinicProfile["onboardingV2"] ?? undefined,
    billing,
    compliance: raw.compliance as ClinicProfile["compliance"] ?? undefined,
    trialStartedAt: (raw.trialStartedAt as string) ?? null,
    createdAt: (raw.createdAt as string) ?? "",
    updatedAt: (raw.updatedAt as string) ?? "",
  };
}

const DEMO_USER: AuthUser = {
  uid: "demo",
  email: "demo@strydeos.com",
  clinicId: "demo-clinic",
  role: "owner",
  firstName: "Demo",
  lastName: "User",
  firstLogin: true,
  tourCompleted: true,
  status: "registered",
  mfaEnrolled: false,
  allowedClinicIds: ["demo-clinic"],
  allowedClinics: [{ id: "demo-clinic", name: "Demo Clinic" }],
  activeClinicId: "demo-clinic",
  isMultiSite: false,
  clinicProfile: {
    id: "demo-clinic",
    name: "Demo Clinic",
    timezone: "Europe/London",
    ownerEmail: "demo@strydeos.com",
    status: "live",
    pmsType: null,
    featureFlags: DEFAULT_FEATURE_FLAGS,
    targets: {
      followUpRate: 4.0,
      hepRate: 95,
      utilisationRate: 75,
      dnaRate: 6,
      treatmentCompletionTarget: 80,
    },
    brandConfig: {},
    onboarding: {
      pmsConnected: false,
      cliniciansConfirmed: false,
      targetsSet: false,
    },
    billing: {
      stripeCustomerId: null,
      subscriptionId: null,
      subscriptionStatus: null,
      currentPeriodEnd: null,
    },
    trialStartedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

const IMPERSONATION_KEY = "stryde_impersonation";

interface ImpersonationState {
  clinicId: string;
  clinicProfile: ClinicProfile;
}

interface AuthContextValue {
  user: AuthUser | null;
  firebaseUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshClinicProfile: () => Promise<void>;
  enterDemoMode: () => Promise<void>;
  isFirebaseConfigured: boolean;
  impersonating: boolean;
  impersonationTarget: ClinicProfile | null;
  startImpersonation: (clinic: ClinicProfile) => void;
  stopImpersonation: () => void;
  /** Multi-site: switch the active clinic context. Reloads clinic profile. */
  switchClinic: (clinicId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  firebaseUser: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  refreshClinicProfile: async () => {},
  enterDemoMode: async () => {},
  isFirebaseConfigured: false,
  impersonating: false,
  impersonationTarget: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
  switchClinic: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

async function fetchUserProfile(fbUser: User): Promise<AuthUser | null> {
  // No Firestore — cannot verify role. Treat as unauthenticated.
  if (!db) return null;

  try {
    const userDoc = await getDoc(doc(db, "users", fbUser.uid));
    // No profile doc — incomplete onboarding or deleted. Do not grant any role.
    if (!userDoc.exists()) return null;

    const userData = userDoc.data() as {
      clinicId: string;
      clinicianId?: string;
      role: UserRole;
      firstName?: string;
      lastName?: string;
      firstLogin?: boolean;
      tourCompleted?: boolean;
      status?: UserStatus;
      allowedClinicIds?: string[];
    };

    let clinicProfile: ClinicProfile | null = null;
    if (userData.clinicId) {
      const clinicDoc = await getDoc(
        doc(db, "clinics", userData.clinicId)
      );
      if (clinicDoc.exists()) {
        clinicProfile = parseClinicProfile(clinicDoc.id, clinicDoc.data());
      }
    }

    const mfaEnrolled = multiFactor(fbUser).enrolledFactors.length > 0;

    // Build the unified allowed clinics list (always includes primary)
    const allowedClinicIds = Array.from(
      new Set([userData.clinicId, ...(userData.allowedClinicIds ?? [])])
    );

    // Pre-load clinic names for the picker (multi-site users only)
    let allowedClinics: { id: string; name: string }[] = [
      { id: userData.clinicId, name: clinicProfile?.name ?? userData.clinicId },
    ];
    if (allowedClinicIds.length > 1 && db) {
      const otherIds = allowedClinicIds.filter((id) => id !== userData.clinicId);
      const clinicDocs = await Promise.all(
        otherIds.map((id) => getDoc(doc(db!, "clinics", id)))
      );
      allowedClinics = allowedClinicIds.map((id) => {
        if (id === userData.clinicId) return { id, name: clinicProfile?.name ?? id };
        const d = clinicDocs.find((c) => c.id === id);
        return { id, name: (d?.data()?.name as string) ?? id };
      });
    }

    return {
      uid: fbUser.uid,
      email: fbUser.email ?? "",
      clinicId: userData.clinicId,
      clinicianId: userData.clinicianId,
      role: userData.role ?? "clinician",
      firstName: userData.firstName ?? "",
      lastName: userData.lastName ?? "",
      firstLogin: userData.firstLogin ?? true,
      tourCompleted: userData.tourCompleted ?? false,
      status: userData.status ?? "registered",
      mfaEnrolled,
      clinicProfile,
      allowedClinicIds,
      allowedClinics,
      activeClinicId: userData.clinicId,
      isMultiSite: allowedClinicIds.length > 1,
    };
  } catch {
    // Firestore read failed — do not grant any role.
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(IMPERSONATION_KEY);
      return raw ? (JSON.parse(raw) as ImpersonationState) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const firebaseAuth = getFirebaseAuth();
      if (!firebaseAuth) {
        setLoading(false);
        return;
      }
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
        try {
          if (fbUser) {
            setFirebaseUser(fbUser);
            const profile = await fetchUserProfile(fbUser);
            setUser(profile);
            if (profile) {
              // Must complete before setLoading(false) so the __session cookie
              // is set before the login page navigates to /dashboard.
              // AbortController timeout (5s) prevents this from hanging forever.
              await createServerSession(fbUser);
              // On first login, self-heal: ensure clinician doc exists and is linked.
              // Fire-and-forget — non-blocking so it doesn't delay the dashboard render.
              if (profile.firstLogin && profile.clinicId) {
                getIdToken(fbUser)
                  .then((idToken) =>
                    fetch("/api/clinic/ensure-clinician", {
                      method: "POST",
                      headers: { Authorization: `Bearer ${idToken}` },
                    })
                  )
                  .then((res) => {
                    if (res && !res.ok) {
                      console.warn("[useAuth] ensure-clinician returned", res.status);
                    }
                  })
                  .catch((err) => {
                    // Non-fatal — the user can still use the app
                    console.warn("[useAuth] First-login self-heal failed:", err instanceof Error ? err.message : err);
                  });
              }
            } else {
              await clearServerSession();
            }
          } else {
            setFirebaseUser(null);
            setUser(null);
            await clearServerSession();
          }
        } catch (err) {
          console.error("[Auth] Failed to load user profile:", err);
          setFirebaseUser(null);
          setUser(null);
          await clearServerSession();
        } finally {
          setLoading(false);
        }
      });
      return () => unsubscribe();
    } catch (err) {
      console.error("[Auth] Firebase init failed:", err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !user?.clinicId) return;
    const unsubscribe = onSnapshot(
      doc(db, "clinics", user.clinicId),
      (snap) => {
        if (snap.exists()) {
          const profile = parseClinicProfile(snap.id, snap.data());
          setUser((prev) => (prev ? { ...prev, clinicProfile: profile } : prev));
        }
      }
    );
    return () => unsubscribe();
  }, [user?.clinicId]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error("Firebase is not configured. Use demo mode.");
      await signInWithEmailAndPassword(auth, email, password);
    },
    []
  );

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (auth) await fbSignOut(auth);
    setUser(null);
    setFirebaseUser(null);
    await clearServerSession();
  }, []);

  const refreshClinicProfile = useCallback(async () => {
    if (firebaseUser && db) {
      const profile = await fetchUserProfile(firebaseUser);
      setUser(profile);
    }
  }, [firebaseUser]);

  const enterDemoMode = useCallback(async () => {
    // Get an HMAC-signed session cookie for uid "demo" from the server.
    // This replaces the old unsigned document.cookie write.
    await fetch("/api/auth/demo", { method: "POST" });
    setUser(DEMO_USER);
    setFirebaseUser(null);
    // Pick a random demo data scenario (0–4) for this session
    try {
      sessionStorage.setItem("strydeos_demo_scenario", String(Math.floor(Math.random() * 5)));
    } catch { /* sessionStorage unavailable */ }
  }, []);

  const startImpersonation = useCallback((clinic: ClinicProfile) => {
    const state: ImpersonationState = { clinicId: clinic.id, clinicProfile: clinic };
    try { sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(state)); } catch { /* ignore */ }
    setImpersonation(state);
  }, []);

  const stopImpersonation = useCallback(() => {
    try { sessionStorage.removeItem(IMPERSONATION_KEY); } catch { /* ignore */ }
    setImpersonation(null);
  }, []);

  // Multi-site: switch the active clinic by loading its profile
  const switchClinic = useCallback(async (targetClinicId: string) => {
    if (!user || !db) return;
    if (!user.allowedClinicIds.includes(targetClinicId)) return;

    const clinicDoc = await getDoc(doc(db, "clinics", targetClinicId));
    if (!clinicDoc.exists()) return;

    const profile = parseClinicProfile(clinicDoc.id, clinicDoc.data());

    setUser((prev) =>
      prev
        ? { ...prev, activeClinicId: targetClinicId, clinicId: targetClinicId, clinicProfile: profile }
        : prev
    );
  }, [user]);

  // When impersonating, override clinicId + clinicProfile on the user object
  const effectiveUser: AuthUser | null = user && impersonation
    ? { ...user, clinicId: impersonation.clinicId, clinicProfile: impersonation.clinicProfile }
    : user;

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        firebaseUser,
        loading,
        signIn,
        signOut,
        refreshClinicProfile,
        enterDemoMode,
        isFirebaseConfigured,
        impersonating: !!impersonation,
        impersonationTarget: impersonation?.clinicProfile ?? null,
        startImpersonation,
        stopImpersonation,
        switchClinic,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
