"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { subscribeGoogleReviewsSummary } from "@/lib/queries";

export type ConnectionModule = "intelligence" | "pulse" | "ava" | "shared";

export interface ConnectionSource {
  key: string;
  label: string;
  blurb: string;
  module: ConnectionModule;
  connected: boolean;
  settingsHref: string;
}

/**
 * Per-clinic connection status for every enrichable data source. Drives two
 * things: hiding cards whose source isn't set up, and the enrichment drawer
 * (not-connected sources surface as soft CTAs). Signals are read per clinicId
 * from the clinic profile + integrations_config, never hardcoded.
 */
export function useConnections(): {
  sources: ConnectionSource[];
  connected: Record<string, boolean>;
  loading: boolean;
} {
  const { user, loading: authLoading } = useAuth();
  const cp = user?.clinicProfile;
  const clinicId = cp?.id ?? null;
  const outcomesOn = cp?.featureFlags?.outcomeTracking ?? false;
  const insuranceOn = cp?.featureFlags?.insuranceIntake ?? false;
  // ava agent lives on the clinic doc as a nested object, not in ClinicProfile.
  const avaAgentId = (cp as { ava?: { agent_id?: string } } | undefined)?.ava?.agent_id ?? null;

  const [googleConnected, setGoogleConnected] = useState(false);
  const [heidiConnected, setHeidiConnected] = useState(false);

  useEffect(() => {
    if (!clinicId) return;
    const unsub = subscribeGoogleReviewsSummary(
      clinicId,
      (s) => setGoogleConnected(Boolean(s && (s.totalReviews ?? 0) > 0)),
      () => setGoogleConnected(false)
    );
    return () => unsub();
  }, [clinicId]);

  useEffect(() => {
    if (!db || !clinicId) return;
    let alive = true;
    getDoc(doc(db, "clinics", clinicId, "integrations_config", "heidi"))
      .then((snap) => { if (alive) setHeidiConnected(Boolean(snap.exists() && snap.data()?.enabled)); })
      .catch(() => { if (alive) setHeidiConnected(false); });
    return () => { alive = false; };
  }, [clinicId]);

  const sources = useMemo<ConnectionSource[]>(() => [
    {
      key: "reviews",
      label: "Google reviews",
      blurb: "Pull live ratings and review velocity into Reputation.",
      module: "intelligence",
      connected: googleConnected,
      settingsHref: "/settings#reviews",
    },
    {
      key: "nps",
      label: "NPS",
      blurb: "Auto-survey discharged patients and track promoter score.",
      module: "intelligence",
      connected: Boolean(cp?.npsConfig?.enabled),
      settingsHref: "/settings#nps",
    },
    {
      key: "hep",
      label: "Exercise programs",
      blurb: "Connect Physitrack to track HEP compliance and outcomes.",
      module: "intelligence",
      connected: Boolean(cp?.hepType),
      settingsHref: "/settings#hep",
    },
    {
      key: "outcomes",
      label: "Outcome measures",
      blurb: "Record NPRS, PSFS and more to prove clinical improvement.",
      module: "intelligence",
      connected: outcomesOn,
      settingsHref: "/settings#outcomes",
    },
    {
      key: "heidi",
      label: "Heidi notes",
      blurb: "Surface clinical-note signals from your Heidi scribe.",
      module: "intelligence",
      connected: heidiConnected,
      settingsHref: "/settings#heidi",
    },
    {
      key: "insurance",
      label: "Insurance pre-auth",
      blurb: "Collect insurer details from patients before they arrive.",
      module: "pulse",
      connected: insuranceOn,
      settingsHref: "/settings#insurance",
    },
    {
      key: "ava",
      label: "Ava receptionist",
      blurb: "Let Ava answer calls and book appointments 24/7.",
      module: "ava",
      connected: Boolean(avaAgentId),
      settingsHref: "/receptionist",
    },
  ], [googleConnected, heidiConnected, cp?.npsConfig?.enabled, cp?.hepType, outcomesOn, insuranceOn, avaAgentId]);

  const connected = useMemo(
    () => Object.fromEntries(sources.map((s) => [s.key, s.connected])),
    [sources]
  );

  return { sources, connected, loading: authLoading };
}
