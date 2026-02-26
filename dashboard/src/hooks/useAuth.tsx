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
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getFirebaseAuth, db, isFirebaseConfigured } from "@/lib/firebase";
import type { AuthUser, ClinicProfile, UserRole, FeatureFlags } from "@/types";

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  intelligence: true,
  continuity: true,
  receptionist: false,
};

const DEMO_USER: AuthUser = {
  uid: "demo",
  email: "demo@strydeos.com",
  clinicId: "demo-clinic",
  role: "owner",
  clinicProfile: {
    id: "demo-clinic",
    name: "Demo Clinic",
    timezone: "Europe/London",
    ownerEmail: "demo@strydeos.com",
    status: "live",
    pmsType: null,
    featureFlags: DEFAULT_FEATURE_FLAGS,
    targets: {
      followUpRate: 2.9,
      physitrackRate: 95,
      utilisationRate: 85,
      dnaRate: 5,
      courseCompletionTarget: 80,
    },
    brandConfig: {},
    onboarding: {
      pmsConnected: false,
      cliniciansConfirmed: false,
      targetsSet: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

interface AuthContextValue {
  user: AuthUser | null;
  firebaseUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshClinicProfile: () => Promise<void>;
  enterDemoMode: () => void;
  isFirebaseConfigured: boolean;
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
});

export function useAuth() {
  return useContext(AuthContext);
}

async function fetchUserProfile(fbUser: User): Promise<AuthUser | null> {
  if (!db) {
    return {
      uid: fbUser.uid,
      email: fbUser.email ?? "",
      clinicId: "",
      role: "owner",
      clinicProfile: null,
    };
  }
  try {
    const userDoc = await getDoc(doc(db, "users", fbUser.uid));
    if (!userDoc.exists()) {
      return {
        uid: fbUser.uid,
        email: fbUser.email ?? "",
        clinicId: "",
        role: "owner",
        clinicProfile: null,
      };
    }

    const userData = userDoc.data() as {
      clinicId: string;
      clinicianId?: string;
      role: UserRole;
    };

    let clinicProfile: ClinicProfile | null = null;
    if (userData.clinicId) {
      const clinicDoc = await getDoc(
        doc(db, "clinics", userData.clinicId)
      );
      if (clinicDoc.exists()) {
        const raw = clinicDoc.data();
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
            followUpRate: raw.targets?.followUpRate ?? 2.9,
            physitrackRate: raw.targets?.physitrackRate ?? 95,
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
          createdAt: raw.createdAt ?? "",
          updatedAt: raw.updatedAt ?? "",
        };
      }
    }

    return {
      uid: fbUser.uid,
      email: fbUser.email ?? "",
      clinicId: userData.clinicId,
      clinicianId: userData.clinicianId,
      role: userData.role ?? "owner",
      clinicProfile,
    };
  } catch {
    return {
      uid: fbUser.uid,
      email: fbUser.email ?? "",
      clinicId: "",
      role: "owner",
      clinicProfile: null,
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
          } else {
            setFirebaseUser(null);
            setUser(null);
          }
        } catch {
          setFirebaseUser(null);
          setUser(null);
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
              followUpRate: raw.targets?.followUpRate ?? 2.9,
              physitrackRate: raw.targets?.physitrackRate ?? 95,
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
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        signIn,
        signOut,
        refreshClinicProfile,
        enterDemoMode,
        isFirebaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
