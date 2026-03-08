"use client";

import { useEffect, useState } from "react";
import { subscribeClinicians } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import { useDemoClinicians } from "./useDemoData";
import type { Clinician } from "@/types";

export function useClinicians() {
  const { user } = useAuth();
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDemo = user?.uid === "demo";
  const demoClinicians = useDemoClinicians();
  const clinicId = user?.clinicId ?? null;

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (isDemo) {
      setClinicians(demoClinicians);
      setLoading(false);
      return () => {};
    }

    const unsubscribe = subscribeClinicians(
      clinicId,
      (data) => {
        setClinicians(data);
        setLoading(false);
      },
      (err) => {
        console.error("[useClinicians]", err);
        setError("Failed to load clinicians.");
        setClinicians([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [clinicId, demoClinicians, isDemo]);

  return { clinicians, loading, error };
}
