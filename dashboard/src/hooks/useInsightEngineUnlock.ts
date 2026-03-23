"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { InsightEngineMilestone } from "@/types/insight-events";

interface UseInsightEngineUnlockResult {
  /** Whether the unlock popup should be shown */
  shouldShow: boolean;
  /** Milestone data (null if not unlocked yet) */
  data: InsightEngineMilestone | null;
  /** Mark the popup as displayed (writes displayedAt) */
  markDisplayed: () => Promise<void>;
  /** Dismiss the popup (writes dismissedAt) */
  dismiss: () => Promise<void>;
}

/**
 * Real-time hook for the Insight Engine first-run milestone.
 * Only triggers for owner/admin roles.
 * Listens to clinics/{clinicId}/milestones/insight_engine_unlocked.
 */
export function useInsightEngineUnlock(): UseInsightEngineUnlockResult {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;
  const role = user?.role;
  const isEligible = role === "owner" || role === "admin" || role === "superadmin";

  const [data, setData] = useState<InsightEngineMilestone | null>(null);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (!db || !clinicId || !isEligible) {
      setData(null);
      setShouldShow(false);
      return;
    }

    const ref = doc(db, "clinics", clinicId, "milestones", "insight_engine_unlocked");

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setData(null);
          setShouldShow(false);
          return;
        }

        const milestone = snap.data() as InsightEngineMilestone;
        setData(milestone);

        // Show popup if it hasn't been displayed yet
        setShouldShow(!milestone.displayedAt);
      },
      (err) => {
        console.warn("[useInsightEngineUnlock] listener error:", err.message);
        setData(null);
        setShouldShow(false);
      }
    );

    return unsub;
  }, [clinicId, isEligible]);

  const markDisplayed = useCallback(async () => {
    if (!db || !clinicId) return;
    try {
      const ref = doc(db, "clinics", clinicId, "milestones", "insight_engine_unlocked");
      await updateDoc(ref, { displayedAt: new Date().toISOString() });
    } catch (err) {
      console.error("[useInsightEngineUnlock] markDisplayed failed:", err);
    }
  }, [clinicId]);

  const dismiss = useCallback(async () => {
    if (!db || !clinicId) return;
    try {
      const ref = doc(db, "clinics", clinicId, "milestones", "insight_engine_unlocked");
      await updateDoc(ref, { dismissedAt: new Date().toISOString() });
      setShouldShow(false);
    } catch (err) {
      console.error("[useInsightEngineUnlock] dismiss failed:", err);
    }
  }, [clinicId]);

  return { shouldShow, data, markDisplayed, dismiss };
}
