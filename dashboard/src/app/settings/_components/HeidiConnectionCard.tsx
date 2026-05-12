"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import { normalizeApiError } from "@/lib/api-errors";

export default function HeidiConnectionCard() {
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<"disconnected" | "connected" | "loading">("loading");
  const [apiKey, setApiKey] = useState("");
  const [region, setRegion] = useState("uk");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [noteCount, setNoteCount] = useState(0);

  // Load Heidi config on mount
  useEffect(() => {
    if (!user?.clinicId) return;
    const loadConfig = async () => {
      try {
        const { getDoc, getDocs, doc: fbDoc, collection: fbCollection } = await import("firebase/firestore");
        const { db: clientDb } = await import("@/lib/firebase");
        if (!clientDb) { setStatus("disconnected"); return; }
        const snap = await getDoc(
          fbDoc(clientDb, "clinics", user.clinicId, "integrations_config", "heidi")
        );
        if (snap.exists()) {
          const data = snap.data();
          setStatus(data.enabled && data.apiKey ? "connected" : "disconnected");
          setLastSync(data.lastSyncAt ?? null);
          setRegion(data.region ?? "uk");
        } else {
          setStatus("disconnected");
        }

        // Count clinical notes
        const notesSnap = await getDocs(
          fbCollection(clientDb, "clinics", user.clinicId, "clinical_notes")
        );
        setNoteCount(notesSnap.size);
      } catch {
        setStatus("disconnected");
      }
    };
    loadConfig();
  }, [user?.clinicId]);

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const res = await fetch("/api/heidi/save-config", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), region, testEmail: user?.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Failed to connect", "error");
        return;
      }
      setStatus("connected");
      setShowForm(false);
      setApiKey("");
      toast("Heidi connected", "success");
    } catch {
      toast("Connection failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const token = await firebaseUser?.getIdToken();
      await fetch("/api/heidi/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus("disconnected");
      setLastSync(null);
      toast("Heidi disconnected", "success");
    } catch {
      toast("Failed to disconnect", "error");
    }
  };

  const handleSync = async () => {
    if (!firebaseUser) {
      toast("Sign in required to sync Heidi notes", "error");
      return;
    }
    setSyncing(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/heidi/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(normalizeApiError(res.status, data?.error, "Heidi sync failed — check your API key"), "error");
        return;
      }
      if (data.ok) {
        setLastSync(new Date().toISOString());
        setNoteCount((prev) => prev + (data.count ?? 0));
        toast(`Synced ${data.count ?? 0} clinical notes from Heidi`, "success");
      } else {
        toast(data.errors?.[0] ?? "Heidi sync returned no data — try again", "error");
      }
    } catch {
      toast("Heidi sync failed — check your connection and try again", "error");
    } finally {
      setSyncing(false);
    }
  };

  const statusDot =
    status === "connected" ? "bg-success" : status === "loading" ? "bg-muted" : "bg-warn";
  const statusText =
    status === "connected"
      ? "Connected"
      : status === "loading"
        ? "Loading…"
        : "Not connected";

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white border border-border flex items-center justify-center shrink-0 p-1.5">
          <img src="/integrations/heidi.svg" alt="Heidi" className="w-full h-full object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-sm font-semibold text-navy">Heidi</p>
            <span className="text-[9px] font-semibold text-muted uppercase tracking-wide px-2 py-0.5 rounded-full bg-cloud-dark border border-border">
              Enrichment layer
            </span>
          </div>
          <p className="text-[11px] text-muted mb-2 leading-relaxed">
            Clinical documentation (SOAP notes, session summaries). When connected, StrydeOS reads session complexity signals to personalise Pulse follow-up timing and tone.
          </p>

          {/* Status row */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted mb-3">
            <span className={`w-1.5 h-1.5 rounded-full ${statusDot} inline-block`} />
            {statusText}
            {status === "connected" && lastSync && (
              <span className="ml-2">
                · Last sync: {new Date(lastSync).toLocaleDateString("en-GB")}
              </span>
            )}
            {status === "connected" && noteCount > 0 && (
              <span className="ml-2">· {noteCount} notes synced</span>
            )}
          </div>

          {/* Actions */}
          {status === "connected" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors disabled:opacity-50"
              >
                {syncing ? "Syncing…" : "Sync now →"}
              </button>
              <span className="text-[10px] text-muted">·</span>
              <button
                onClick={handleDisconnect}
                className="text-[11px] font-semibold text-muted hover:text-red-500 transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : status !== "loading" && !showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors"
            >
              Connect Heidi →
            </button>
          ) : null}

          {/* Connection form */}
          {showForm && status === "disconnected" && (
            <div className="mt-3 space-y-2.5">
              <div>
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1">
                  Heidi API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Heidi API key"
                  className="w-full text-[12px] px-3 py-2 rounded-lg border border-border bg-white text-navy placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1">
                  Region
                </label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full text-[12px] px-3 py-2 rounded-lg border border-border bg-white text-navy focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue"
                >
                  <option value="uk">United Kingdom</option>
                  <option value="au">Australia</option>
                  <option value="us">United States</option>
                  <option value="eu">Europe</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleConnect}
                  disabled={saving || !apiKey.trim()}
                  className="text-[11px] font-semibold text-white bg-blue hover:bg-blue-bright px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? "Validating…" : "Connect"}
                </button>
                <button
                  onClick={() => { setShowForm(false); setApiKey(""); }}
                  className="text-[11px] font-semibold text-muted hover:text-navy transition-colors"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[10px] text-muted leading-relaxed">
                Get your API key from{" "}
                <a
                  href="https://www.heidihealth.com/developers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue hover:underline"
                >
                  Heidi Developer Portal
                </a>
                . Requires a Together plan or higher.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
