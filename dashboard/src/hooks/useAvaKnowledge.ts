import { useCallback, useEffect, useState, useRef } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";
import type { KnowledgeEntry, KnowledgeCategory } from "@/lib/ava/ava-knowledge";

interface UseAvaKnowledgeResult {
  entries: KnowledgeEntry[];
  loading: boolean;
  saving: boolean;
  syncing: boolean;
  lastSyncedAt: string | null;
  hasPendingChanges: boolean;
  error: string | null;
  addEntry: (category: KnowledgeCategory, title: string, content: string) => Promise<void>;
  updateEntry: (id: string, updates: Partial<Pick<KnowledgeEntry, "title" | "content">>) => void;
  removeEntry: (id: string) => Promise<void>;
  saveEntries: () => Promise<void>;
  syncToAgent: () => Promise<{ success: boolean; error?: string }>;
}

export function useAvaKnowledge(clinicId: string | undefined): UseAvaKnowledgeResult {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load knowledge entries from Firestore
  const load = useCallback(async () => {
    if (!db || !clinicId) {
      setLoading(false);
      return;
    }

    try {
      const clinicDoc = await getDoc(doc(db, "clinics", clinicId));
      if (!clinicDoc.exists()) {
        setLoading(false);
        return;
      }

      const data = clinicDoc.data();
      const avaData = data.ava || {};

      setEntries(avaData.knowledge || []);
      setLastSyncedAt(avaData.knowledgeLastSyncedAt || null);
      setHasPendingChanges(false);
    } catch (err) {
      console.error("[Ava knowledge load error]", err);
      setError("Failed to load knowledge base");
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    load();
  }, [load]);

  // Persist entries to Firestore
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
        setHasPendingChanges(true);
      } catch (err) {
        console.error("[Ava knowledge save error]", err);
        setError("Failed to save knowledge base");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [clinicId],
  );

  // Ref always points to latest persistToFirestore to avoid stale closure in debounce
  const persistRef = useRef(persistToFirestore);
  useEffect(() => { persistRef.current = persistToFirestore; }, [persistToFirestore]);

  // Clear debounce on clinicId change to prevent cross-clinic writes
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [clinicId]);

  // Debounced save — triggers 800ms after last change
  const debouncedSave = useCallback(
    (updatedEntries: KnowledgeEntry[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        persistRef.current(updatedEntries);
      }, 800);
    },
    [],
  );

  // Add a new knowledge entry
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
    [entries, persistToFirestore],
  );

  // Update an existing entry (debounced save)
  const updateEntry = useCallback(
    (id: string, updates: Partial<Pick<KnowledgeEntry, "title" | "content">>) => {
      const updated = entries.map((e) =>
        e.id === id
          ? { ...e, ...updates, updatedAt: new Date().toISOString() }
          : e,
      );
      setEntries(updated);
      setHasPendingChanges(true);
      debouncedSave(updated);
    },
    [entries, debouncedSave],
  );

  // Remove an entry
  const removeEntry = useCallback(
    async (id: string) => {
      const updated = entries.filter((e) => e.id !== id);
      setEntries(updated);
      await persistToFirestore(updated);
    },
    [entries, persistToFirestore],
  );

  // Manual save (flush debounce)
  const saveEntries = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await persistToFirestore(entries);
  }, [entries, persistToFirestore]);

  // Sync knowledge base to ElevenLabs agent
  const syncToAgent = useCallback(async () => {
    setSyncing(true);
    setError(null);

    try {
      // Flush any pending saves first
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        await persistToFirestore(entries);
      }

      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        throw new Error("User not authenticated");
      }

      const token = await user.getIdToken();
      const response = await fetch("/api/ava/knowledge", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to sync knowledge base");
      }

      const data = await response.json();
      setLastSyncedAt(data.syncedAt);
      setHasPendingChanges(false);

      return { success: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sync knowledge base";
      console.error("[Ava knowledge sync error]", err);
      setError(message);
      return { success: false, error: message };
    } finally {
      setSyncing(false);
    }
  }, [entries, persistToFirestore]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    entries,
    loading,
    saving,
    syncing,
    lastSyncedAt,
    hasPendingChanges,
    error,
    addEntry,
    updateEntry,
    removeEntry,
    saveEntries,
    syncToAgent,
  };
}
