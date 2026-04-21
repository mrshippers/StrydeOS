"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import type { ClinicalNote } from "@/types";

/**
 * Subscribes to clinical notes for a specific patient from Firestore.
 *
 * Uses `onSnapshot` so notes synced mid-session (e.g. a fresh Heidi ingest)
 * surface immediately in the UI. The listener is cleaned up on unmount or
 * when `patientId` changes.
 */
export function useClinicalNotes(patientId: string | null) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patientId || !user?.clinicId || !db) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const notesRef = collection(db, "clinics", user.clinicId, "clinical_notes");
    const q = query(
      notesRef,
      where("patientId", "==", patientId),
      orderBy("sessionDate", "desc"),
      limit(10),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotes(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClinicalNote),
        );
        setLoading(false);
      },
      () => {
        setNotes([]);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [patientId, user?.clinicId]);

  return { notes, loading };
}
