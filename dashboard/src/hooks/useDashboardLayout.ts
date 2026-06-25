"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

/**
 * Per-user dashboard card ordering.
 *
 * Load precedence:
 *   1. Firestore  users/{uid}.dashboardLayout   (cross-device source of truth)
 *   2. localStorage  stryde:dashboard-layout:{uid}  (instant + offline/rules-denied fallback)
 *   3. the supplied default order
 *
 * Writes go to localStorage synchronously (always succeeds, keeps the layout
 * sticky on the device) and to Firestore best-effort + debounced. A denied or
 * offline Firestore write never breaks the UI.
 *
 * `reconcile` guarantees the returned order always contains exactly the known
 * card ids: unknown ids are dropped (a card removed from a build) and missing
 * ids are appended (a newly shipped card) so a stale stored order can never
 * hide a card or surface a phantom one.
 */

function lsKey(uid: string): string {
  return `stryde:dashboard-layout:${uid}`;
}

function reconcile(stored: string[] | null | undefined, valid: readonly string[]): string[] {
  const validSet = new Set(valid);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of stored ?? []) {
    if (validSet.has(id) && !seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }
  for (const id of valid) {
    if (!seen.has(id)) next.push(id);
  }
  return next;
}

interface UseDashboardLayoutResult {
  order: string[];
  setOrder: (next: string[]) => void;
  /** True once the cross-device (Firestore) read has resolved. */
  ready: boolean;
}

export function useDashboardLayout(defaultOrder: readonly string[]): UseDashboardLayoutResult {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [order, setOrderState] = useState<string[]>(() => reconcile(null, defaultOrder));
  const [ready, setReady] = useState(false);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  // Canonical id set is stable across renders; keep a ref so callbacks reconcile
  // against the current valid set without re-binding.
  const validRef = useRef<readonly string[]>(defaultOrder);
  validRef.current = defaultOrder;

  const orderKey = defaultOrder.join("|");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  // Load order for the active user.
  useEffect(() => {
    if (!uid) {
      setOrderState(reconcile(null, validRef.current));
      setReady(false);
      return;
    }

    let cancelled = false;

    // 1. localStorage — instant, avoids a layout flash before Firestore resolves.
    let local: string[] | null = null;
    try {
      const raw = localStorage.getItem(lsKey(uid));
      if (raw) local = JSON.parse(raw) as string[];
    } catch {
      /* localStorage unavailable or malformed — ignore */
    }
    if (local) setOrderState(reconcile(local, validRef.current));

    // 2. Firestore — cross-device, wins when present.
    (async () => {
      if (!db) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", uid));
        const remote = snap.exists()
          ? (snap.data()?.dashboardLayout as string[] | undefined)
          : undefined;
        if (cancelled) return;
        if (Array.isArray(remote) && remote.length > 0) {
          setOrderState(reconcile(remote, validRef.current));
        } else if (!local) {
          setOrderState(reconcile(null, validRef.current));
        }
      } catch {
        /* rules-denied or offline — keep local/default */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // orderKey tracks the canonical id set; re-run if the user or that set changes.
  }, [uid, orderKey]);

  const setOrder = useCallback(
    (next: string[]) => {
      const clean = reconcile(next, validRef.current);
      setOrderState(clean);
      if (!uid) return;
      try {
        localStorage.setItem(lsKey(uid), JSON.stringify(clean));
      } catch {
        /* quota / unavailable — Firestore still attempts below */
      }
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        if (!mounted.current || !db) return;
        setDoc(doc(db, "users", uid), { dashboardLayout: clean }, { merge: true }).catch(() => {
          /* denied/offline — local copy already holds the layout */
        });
      }, 600);
    },
    [uid]
  );

  return { order, setOrder, ready };
}
