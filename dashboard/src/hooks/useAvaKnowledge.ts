import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, getFirebaseFunctions } from "@/lib/firebase";
import type {
  KnowledgeEntry,
  KnowledgeCategory,
  AvaSyncState,
  SyncLogEntry,
} from "@/lib/ava/ava-knowledge";

interface UseAvaKnowledgeResult {
  entries: KnowledgeEntry[];
  loading: boolean;
  saving: boolean;
  syncing: boolean;
  lastSyncedAt: string | null;
  hasPendingChanges: boolean;
  syncState: AvaSyncState | null;
  syncLog: SyncLogEntry[];
  error: string | null;
  addEntry: (category: KnowledgeCategory, title: string, content: string) => Promise<void>;
  updateEntry: (id: string, updates: Partial<Pick<KnowledgeEntry, "title" | "content">>) => void;
  removeEntry: (id: string) => Promise<void>;
  saveEntries: () => Promise<void>;
  syncToAgent: () => Promise<{ success: boolean; error?: string }>;
}

function toISOString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export function useAvaKnowledge(clinicId: string | undefined): UseAvaKnowledgeResult {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<AvaSyncState | null>(null);
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Suppress snapshot entry updates while a debounced local edit is pending
  const isEditingRef = useRef(false);

  // Real-time Firestore listener
  useEffect(() => {
    if (!db || !clinicId) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "clinics", clinicId),
      (snap) => {
        if (!snap.exists()) {
          setLoading(false);
          return;
        }

        const data = snap.data();
        const avaData = data.ava || {};

        // Don't overwrite entries while the user is actively editing
        if (!isEditingRef.current) {
          setEntries(avaData.knowledge || []);
        }

        const state = avaData.syncState || {};
        const rawLastSynced = state.lastSyncedAt;
        const lastSynced =
          toISOString(rawLastSynced) ?? avaData.knowledgeLastSyncedAt ?? null;

        setLastSyncedAt(lastSynced);
        setSyncLog(state.syncLog || []);
        setSyncState({
          status: state.status ?? null,
          lastSyncedAt: lastSynced,
          lastAttemptedAt: toISOString(state.lastAttemptedAt),
          avaAgentId: state.avaAgentId ?? null,
          lastError: state.lastError ?? null,
          lastSyncDiff: state.lastSyncDiff ?? null,
          syncLog: state.syncLog || [],
        });

        setLoading(false);
      },
      (err) => {
        console.error("[Ava knowledge listener error]", err);
        setError("Failed to load knowledge base");
        setLoading(false);
      }
    );

    return () => {
      unsub();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [clinicId]);

  // hasPendingChanges — derived from entry timestamps vs lastSyncedAt
  const hasPendingChanges = useMemo(() => {
    if (entries.length === 0) return false;
    if (!lastSyncedAt) return true;
    const syncMs = new Date(lastSyncedAt).getTime();
    return entries.some((e) => new Date(e.updatedAt).getTime() > syncMs);
  }, [entries, lastSyncedAt]);

  const persistToFirestore = useCallback(
    async (updatedEntries: KnowledgeEntry[]) => {
      if (!db || !clinicId) return;
      setSaving(true);
      setError(null);

      try {
        await updateDoc(doc(db, "clinics", clinicId), {
          "ava.knowledge": updatedEntries,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("[Ava knowledge save error]", err);
        setError("Failed to save knowledge base");
        throw err;
      } finally {
        setSaving(false);
        isEditingRef.current = false;
      }
    },
    [clinicId]
  );

  const persistRef = useRef(persistToFirestore);
  useEffect(() => { persistRef.current = persistToFirestore; }, [persistToFirestore]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [clinicId]);

  const debouncedSave = useCallback((updatedEntries: KnowledgeEntry[]) => {
    isEditingRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      persistRef.current(updatedEntries);
    }, 800);
  }, []);

  const addEntry = useCallback(
    async (category: KnowledgeCategory, title: string, content: string) => {
      const newEntry: KnowledgeEntry = {
        id: crypto.randomUUID(),
        category,
        title,
        content,
        updatedAt: new Date().toISOString(),
      };
      const updated = [...entries, newEntry];
      setEntries(updated);
      await persistToFirestore(updated);
    },
    [entries, persistToFirestore]
  );

  const updateEntry = useCallback(
    (id: string, updates: Partial<Pick<KnowledgeEntry, "title" | "content">>) => {
      const updated = entries.map((e) =>
        e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
      );
      setEntries(updated);
      debouncedSave(updated);
    },
    [entries, debouncedSave]
  );

  const removeEntry = useCallback(
    async (id: string) => {
      const updated = entries.filter((e) => e.id !== id);
      setEntries(updated);
      await persistToFirestore(updated);
    },
    [entries, persistToFirestore]
  );

  const saveEntries = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await persistToFirestore(entries);
  }, [entries, persistToFirestore]);

  const syncToAgent = useCallback(async () => {
    if (!clinicId) return { success: false, error: "No clinic ID" };

    setSyncing(true);
    setError(null);

    try {
      // Flush any pending local edits to Firestore before syncing
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        await persistToFirestore(entries);
      }

      const fns = getFirebaseFunctions();
      if (!fns) throw new Error("Firebase Functions not configured");

      const callSync = httpsCallable<{ clinicId: string }, { success: boolean }>(
        fns,
        "syncClinicToAva"
      );
      await callSync({ clinicId });
      // lastSyncedAt, syncState, and syncLog all update via onSnapshot
      // when the Cloud Function writes syncState back to Firestore

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync to Ava";
      console.error("[Ava knowledge sync error]", err);
      setError(message);
      return { success: false, error: message };
    } finally {
      setSyncing(false);
    }
  }, [clinicId, entries, persistToFirestore]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return {
    entries,
    loading,
    saving,
    syncing,
    lastSyncedAt,
    hasPendingChanges,
    syncState,
    syncLog,
    error,
    addEntry,
    updateEntry,
    removeEntry,
    saveEntries,
    syncToAgent,
  };
}
