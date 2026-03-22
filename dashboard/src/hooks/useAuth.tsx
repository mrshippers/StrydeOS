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
  multiFactor,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getFirebaseAuth, db, isFirebaseConfigured } from "@/lib/firebase";
import type { AuthUser, ClinicProfile, UserRole, UserStatus, FeatureFlags, BillingState } from "@/types";

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  intelligence: false,
  continuity: false,
  receptionist: false,
};

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
      courseCompletionTarget: 80,
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
      subscriptionStatus: "active",
      currentPeriodEnd: null,
    },
    trialStartedAt: "2099-01-01T00:00:00.000Z",
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
  enterDemoMode: () => void;
  isFirebaseConfigured: boolean;
  impersonating: boolean;
  impersonationTarget: ClinicProfile | null;
  startImpersonation: (clinic: ClinicProfile) => void;
  stopImpersonation: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  firebaseUser: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  refreshClinicProfile: async () => {},
  enterDemoMode: () => {},
  isFirebaseConfigured: false,
  impersonating: false,
  impersonationTarget: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
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
    };

    let clinicProfile: ClinicProfile | null = null;
    if (userData.clinicId) {
      const clinicDoc = await getDoc(
        doc(db, "clinics", userData.clinicId)
      );
      if (clinicDoc.exists()) {
        const raw = clinicDoc.data();
        const billingRaw = raw.billing;
        const billing: BillingState | undefined = billingRaw
          ? {
              stripeCustomerId: billingRaw.stripeCustomerId ?? null,
              subscriptionId: billingRaw.subscriptionId ?? null,
              subscriptionStatus: billingRaw.subscriptionStatus ?? null,
              currentPeriodEnd: billingRaw.currentPeriodEnd ?? null,
            }
          : undefined;

        clinicProfile = {
          id: clinicDoc.id,
          name: raw.name ?? "",
          timezone: raw.timezone ?? "Europe/London",
          ownerEmail: raw.ownerEmail ?? "",
          status: raw.status ?? "onboarding",
          pmsType: raw.pmsType ?? null,
          pmsLastSyncAt: raw.pmsLastSyncAt ?? raw.pms?.lastSyncAt ?? null,
          featureFlags: {
            ...DEFAULT_FEATURE_FLAGS,
            ...(raw.featureFlags ?? {}),
          },
          targets: {
            followUpRate: raw.targets?.followUpRate ?? 4.0,
            hepRate: raw.targets?.hepRate ?? raw.targets?.physitrackRate ?? 95,
            utilisationRate: raw.targets?.utilisationRate ?? 75,
            dnaRate: raw.targets?.dnaRate ?? 6,
            courseCompletionTarget: raw.targets?.courseCompletionTarget ?? 80,
          },
          brandConfig: raw.brandConfig ?? {},
          onboarding: {
            pmsConnected: raw.onboarding?.pmsConnected ?? false,
            cliniciansConfirmed: raw.onboarding?.cliniciansConfirmed ?? false,
            targetsSet: raw.onboarding?.targetsSet ?? false,
          },
          onboardingV2: raw.onboardingV2 ?? undefined,
          billing,
          compliance: raw.compliance ?? undefined,
          trialStartedAt: raw.trialStartedAt ?? null,
          createdAt: raw.createdAt ?? "",
          updatedAt: raw.updatedAt ?? "",
        };
      }
    }

    const mfaEnrolled = multiFactor(fbUser).enrolledFactors.length > 0;

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
              document.cookie = "__session=1; path=/; SameSite=Lax";
            } else {
              document.cookie = "__session=; path=/; max-age=0; SameSite=Lax";
            }
          } else {
            setFirebaseUser(null);
            setUser(null);
            document.cookie = "__session=; path=/; max-age=0; SameSite=Lax";
          }
        } catch {
          setFirebaseUser(null);
          setUser(null);
          document.cookie = "__session=; path=/; max-age=0; SameSite=Lax";
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
          const raw = snap.data();
          const billingRaw = raw.billing;
          const billing: BillingState | undefined = billingRaw
            ? {
                stripeCustomerId: billingRaw.stripeCustomerId ?? null,
                subscriptionId: billingRaw.subscriptionId ?? null,
                subscriptionStatus: billingRaw.subscriptionStatus ?? null,
                currentPeriodEnd: billingRaw.currentPeriodEnd ?? null,
              }
            : undefined;

          const profile: ClinicProfile = {
            id: snap.id,
            name: raw.name ?? "",
            timezone: raw.timezone ?? "Europe/London",
            ownerEmail: raw.ownerEmail ?? "",
            status: raw.status ?? "onboarding",
            pmsType: raw.pmsType ?? null,
            pmsLastSyncAt: raw.pmsLastSyncAt ?? raw.pms?.lastSyncAt ?? null,
            featureFlags: {
              ...DEFAULT_FEATURE_FLAGS,
              ...(raw.featureFlags ?? {}),
            },
            targets: {
              followUpRate: raw.targets?.followUpRate ?? 4.0,
              hepRate: raw.targets?.hepRate ?? raw.targets?.physitrackRate ?? 95,
              utilisationRate: raw.targets?.utilisationRate ?? 85,
              dnaRate: raw.targets?.dnaRate ?? 5,
              courseCompletionTarget: raw.targets?.courseCompletionTarget ?? 80,
            },
            brandConfig: raw.brandConfig ?? {},
            onboarding: {
              pmsConnected: raw.onboarding?.pmsConnected ?? false,
              cliniciansConfirmed: raw.onboarding?.cliniciansConfirmed ?? false,
              targetsSet: raw.onboarding?.targetsSet ?? false,
            },
            billing,
            trialStartedAt: raw.trialStartedAt ?? null,
            createdAt: raw.createdAt ?? "",
            updatedAt: raw.updatedAt ?? "",
          };
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
    document.cookie = "__session=; path=/; max-age=0; SameSite=Lax";
  }, []);

  const refreshClinicProfile = useCallback(async () => {
    if (firebaseUser && db) {
      const profile = await fetchUserProfile(firebaseUser);
      setUser(profile);
    }
  }, [firebaseUser]);

  const enterDemoMode = useCallback(() => {
    setUser(DEMO_USER);
    setFirebaseUser(null);
    document.cookie = "__session=1; path=/; SameSite=Lax";
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
