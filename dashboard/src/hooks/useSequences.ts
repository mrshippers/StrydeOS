"use client";

import { useEffect, useState, useCallback } from "react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { SequenceDefinition } from "@/types/comms";

export interface SequenceWithStats extends SequenceDefinition {
  sent: number;
  opened: number;
  clicked: number;
  rebooked: number;
  attributedRevenuePence: number;
}

export function useSequences() {
  const { user } = useAuth();
  const clinicId = user?.clinicId ?? null;

  const [definitions, setDefinitions] = useState<SequenceDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !clinicId) {
      setLoading(false);
      return;
    }

    const ref = collection(db, "clinics", clinicId, "sequence_definitions");
    const unsub: Unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const defs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as SequenceDefinition))
          .sort((a, b) => a.priority - b.priority);
        setDefinitions(defs);
        setLoading(false);
      },
      (err) => {
        console.error("[useSequences] listener error:", err);
        setError("Failed to load sequences.");
        setLoading(false);
      }
    );

    return unsub;
  }, [clinicId]);

  const toggleSequence = useCallback(
    async (definitionId: string, active: boolean) => {
      // Optimistic update
      setDefinitions((prev) =>
        prev.map((d) => (d.id === definitionId ? { ...d, active } : d))
      );

      if (!db || !clinicId) return;

      const ref = doc(db, "clinics", clinicId, "sequence_definitions", definitionId);
      try {
        await updateDoc(ref, { active });
      } catch (err) {
        console.error("[useSequences] toggleSequence failed:", err);
        setError("Failed to update sequence. Please try again.");
        // Revert on failure
        setDefinitions((prev) =>
          prev.map((d) => (d.id === definitionId ? { ...d, active: !active } : d))
        );
      }
    },
    [clinicId]
  );

  // Merge definitions with zero stats (stats come from useCommsLog)
  const sequences: SequenceWithStats[] = definitions.map((d) => ({
    ...d,
    sent: 0,
    opened: 0,
    clicked: 0,
    rebooked: 0,
    attributedRevenuePence: 0,
  }));

  return { sequences, toggleSequence, loading, error };
}
