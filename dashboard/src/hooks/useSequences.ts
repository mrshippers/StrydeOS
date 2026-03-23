"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { SequenceDefinition } from "@/types/comms";
import { DEFAULT_SEQUENCE_DEFINITIONS } from "@/types/comms";

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
  const isOwnerOrAdmin = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";

  const [definitions, setDefinitions] = useState<SequenceDefinition[]>([]);
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (!db || !clinicId) {
      // No Firestore or no clinic — fall back to canonical defaults so the UI isn't empty
      setDefinitions(
        DEFAULT_SEQUENCE_DEFINITIONS.map((d, i) => ({
          ...d,
          id: `default_${d.sequenceType}`,
        }))
      );
      setUsingDefaults(true);
      setLoading(false);
      return;
    }

    const ref = collection(db, "clinics", clinicId, "sequence_definitions");
    const unsub: Unsubscribe = onSnapshot(
      ref,
      async (snap) => {
        // Auto-seed default sequences if collection is empty (owner/admin only, once per session)
        if (snap.empty && isOwnerOrAdmin && !seededRef.current) {
          seededRef.current = true;
          try {
            for (const def of DEFAULT_SEQUENCE_DEFINITIONS) {
              await addDoc(ref, def);
            }
          } catch {
            // Seeding failed — fall back to canonical defaults so the tab isn't blank
            setDefinitions(
              DEFAULT_SEQUENCE_DEFINITIONS.map((d) => ({
                ...d,
                id: `default_${d.sequenceType}`,
              }))
            );
            setUsingDefaults(true);
            setLoading(false);
          }
          return; // The onSnapshot will fire again with the seeded docs
        }

        // If snapshot is still empty after seeding attempt (non-owner, or seeding didn't run)
        if (snap.empty) {
          setDefinitions(
            DEFAULT_SEQUENCE_DEFINITIONS.map((d) => ({
              ...d,
              id: `default_${d.sequenceType}`,
            }))
          );
          setUsingDefaults(true);
          setLoading(false);
          return;
        }

        const defs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as SequenceDefinition))
          .sort((a, b) => a.priority - b.priority);
        setDefinitions(defs);
        setUsingDefaults(false);
        setLoading(false);
      },
      (err) => {
        // Firestore error — still show defaults so the tab isn't blank
        setDefinitions(
          DEFAULT_SEQUENCE_DEFINITIONS.map((d) => ({
            ...d,
            id: `default_${d.sequenceType}`,
          }))
        );
        setUsingDefaults(true);
        setError("Failed to load sequences.");
        setLoading(false);
      }
    );

    return unsub;
  }, [clinicId, isOwnerOrAdmin]);

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

  return { sequences, toggleSequence, loading, error, usingDefaults };
}
