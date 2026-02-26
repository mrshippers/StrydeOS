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

  const demoClinicians = useDemoClinicians();
  const clinicId = user?.clinicId ?? null;

  useEffect(() => {
    setLoading(true);

    const unsubscribe = subscribeClinicians(
      clinicId,
      (data) => {
        if (data.length === 0) {
          setClinicians(demoClinicians);
        } else {
          setClinicians(data);
        }
        setLoading(false);
      },
      () => {
        setClinicians(demoClinicians);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [clinicId, demoClinicians]);

  return { clinicians, loading };
}
