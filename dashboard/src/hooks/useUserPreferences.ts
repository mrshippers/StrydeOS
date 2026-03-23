"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { LifecycleState, SequenceType } from "@/types";

export interface UserPreferences {
  userId: string;
  clinicId: string;
  visibleSegments: LifecycleState[];
  visibleMetrics: string[];
  visibleSequenceTypes: SequenceType[];
  showRevenue: boolean;
  updatedAt: string;
}

const ALL_SEGMENTS: LifecycleState[] = [
  "NEW", "ONBOARDING", "ACTIVE", "AT_RISK", "LAPSED", "RE_ENGAGED", "DISCHARGED", "CHURNED",
];

const ALL_METRICS = [
  "riskScore", "lifecycleState", "sessions", "lastVisit",
  "nextAppointment", "hepStatus", "followUpBooked", "clinician",
];

const ALL_SEQUENCE_TYPES: SequenceType[] = [
  "early_intervention", "rebooking_prompt", "hep_reminder",
  "pre_auth_collection", "review_prompt", "reactivation_90d", "reactivation_180d",
];

function defaultPreferences(userId: string, clinicId: string): UserPreferences {
  return {
    userId,
    clinicId,
    visibleSegments:      ALL_SEGMENTS,
    visibleMetrics:       ALL_METRICS,
    visibleSequenceTypes: ALL_SEQUENCE_TYPES,
    showRevenue:          true,
    updatedAt:            new Date().toISOString(),
  };
}

export function useUserPreferences() {
  const { user } = useAuth();
  const userId  = user?.uid ?? null;
  const clinicId = user?.clinicId ?? null;

  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Clear debounce on unmount to prevent post-unmount Firestore writes
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!db || !userId || !clinicId) {
      setLoading(false);
      return;
    }

    const ref = doc(db, "user_preferences", userId);
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          setPreferences(snap.data() as UserPreferences);
        } else {
          setPreferences(defaultPreferences(userId, clinicId));
        }
      })
      .catch(() => {
        setPreferences(defaultPreferences(userId, clinicId));
      })
      .finally(() => setLoading(false));

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [userId, clinicId]);

  const updatePreferences = useCallback(
    (partial: Partial<UserPreferences>) => {
      if (!db || !userId || !clinicId) return;
      const firestore = db; // narrow out of null for use inside closure

      setPreferences((prev) => {
        const next = {
          ...(prev ?? defaultPreferences(userId, clinicId)),
          ...partial,
          updatedAt: new Date().toISOString(),
        };

        // Debounced Firestore write (500ms)
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          if (mountedRef.current) {
            setDoc(doc(firestore, "user_preferences", userId), next).catch(() => {});
          }
        }, 500);

        return next;
      });
    },
    [userId, clinicId]
  );

  const prefs = preferences ?? (userId && clinicId ? defaultPreferences(userId, clinicId) : null);

  return { preferences: prefs, updatePreferences, loading };
}
