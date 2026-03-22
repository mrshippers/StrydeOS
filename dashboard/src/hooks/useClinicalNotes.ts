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
  getDocs,
} from "firebase/firestore";
import type { ClinicalNote } from "@/types";

/**
 * Fetches clinical notes for a specific patient from Firestore.
 * Loads on-demand (not real-time) — notes don't change while you're looking at them.
 */
export function useClinicalNotes(patientId: string | null) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patientId || !user?.clinicId || !db) return;

    let cancelled = false;
    setLoading(true);

    const notesRef = collection(db, "clinics", user.clinicId, "clinical_notes");
    const q = query(
      notesRef,
      where("patientId", "==", patientId),
      orderBy("sessionDate", "desc"),
      limit(10),
    );

    getDocs(q)
      .then((snap) => {
        if (cancelled) return;
        setNotes(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClinicalNote),
        );
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, user?.clinicId]);

  return { notes, loading };
}
