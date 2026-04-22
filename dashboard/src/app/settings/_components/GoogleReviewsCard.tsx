"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import { normalizeApiError } from "@/lib/api-errors";
import { Star, Loader2 } from "lucide-react";

interface ReviewsConfigSummary {
  displayName?: string;
  totalReviews?: number;
  avgRating?: number;
  lastSyncedAt?: string;
}

/**
 * Settings card for connecting a clinic's Google Business Profile via Place ID.
 *
 * The API key is sourced from the platform-level GOOGLE_PLACES_API_KEY by
 * default. An override field is exposed for clinics that want to bring their
 * own key (required at scale, optional for the Spires dogfood).
 */
export default function GoogleReviewsCard() {
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();
  const clinicId = user?.clinicId;

  const [status, setStatus] = useState<"disconnected" | "connected" | "loading">("loading");
  const [placeId, setPlaceId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [summary, setSummary] = useState<ReviewsConfigSummary | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing config on mount
  useEffect(() => {
    if (!clinicId) {
      setStatus("disconnected");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { getDoc, doc: fbDoc } = await import("firebase/firestore");
        const { db: clientDb } = await import("@/lib/firebase");
        if (!clientDb) {
          if (!cancelled) setStatus("disconnected");
          return;
        }
        const snap = await getDoc(
          fbDoc(clientDb, "clinics", clinicId, "integrations_config", "google_reviews")
        );
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as { placeId?: string; summary?: ReviewsConfigSummary };
          if (data.placeId) {
            setStatus("connected");
            setPlaceId(data.placeId);
            setSummary(data.summary ?? null);
            return;
          }
        }
        setStatus("disconnected");
      } catch {
        if (!cancelled) setStatus("disconnected");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  async function handleConnect() {
    if (!placeId.trim()) {
      toast("Enter your Google Place ID", "error");
      return;
    }
    if (!firebaseUser) {
      toast("Sign in required", "error");
      return;
    }
    setTesting(true);
    try {
      const token = await firebaseUser.getIdToken();
      const testRes = await fetch("/api/reviews/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ placeId: placeId.trim(), apiKey: apiKey.trim() || undefined }),
      });
      const testData = await testRes.json().catch(() => ({}));
      if (!testRes.ok || !testData.ok) {
        toast(
          normalizeApiError(testRes.status, testData.error, "Place ID lookup failed — double-check the ID and your API key."),
          "error"
        );
        setTesting(false);
        return;
      }

      setSaving(true);
      const saveRes = await fetch("/api/reviews/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ placeId: placeId.trim(), apiKey: apiKey.trim() || undefined }),
      });
      if (!saveRes.ok) {
        const saveData = await saveRes.json().catch(() => ({}));
        toast(normalizeApiError(saveRes.status, saveData.error, "Place ID verified but save failed."), "error");
        return;
      }

      setStatus("connected");
      setApiKey("");
      setShowAdvanced(false);
      setSummary({
        displayName: testData.displayName,
        totalReviews: testData.totalReviews,
        avgRating: testData.avgRating,
        lastSyncedAt: new Date().toISOString(),
      });
      toast(
        `Connected — ${testData.displayName || "clinic"}: ${testData.totalReviews ?? 0} reviews, ${testData.avgRating?.toFixed?.(1) ?? "—"}★`,
        "success"
      );
    } catch {
      toast("Connection failed — check the Place ID and try again.", "error");
    } finally {
      setTesting(false);
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/reviews/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(normalizeApiError(res.status, data.error, "Failed to disconnect"), "error");
        return;
      }
      setStatus("disconnected");
      setPlaceId("");
      setApiKey("");
      setSummary(null);
      toast("Google Reviews disconnected", "success");
    } catch {
      toast("Failed to disconnect", "error");
    }
  }

  const statusDot =
    status === "connected" ? "bg-success" : status === "loading" ? "bg-muted" : "bg-warn";
  const statusText =
    status === "connected" ? "Connected" : status === "loading" ? "Loading…" : "Not connected";

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-warn/10 border border-warn/20 flex items-center justify-center shrink-0">
          <Star size={18} className="text-warn" fill="currentColor" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-sm font-semibold text-navy">Google Reviews</p>
            <span className="text-[9px] font-semibold text-muted uppercase tracking-wide px-2 py-0.5 rounded-full bg-cloud-dark border border-border">
              Reputation signal
            </span>
          </div>
          <p className="text-[11px] text-muted mb-2 leading-relaxed">
            Pull your Google Business Profile rating and the five most recent reviews Google exposes. Feeds the Intelligence
            Reputation tab and the NPS composite.
          </p>

          <div className="flex items-center gap-1.5 text-[11px] text-muted mb-3">
            <span className={`w-1.5 h-1.5 rounded-full ${statusDot} inline-block`} />
            {statusText}
            {status === "connected" && summary?.totalReviews != null && (
              <span className="ml-2">
                · {summary.totalReviews} reviews
                {summary.avgRating != null ? ` · ${summary.avgRating.toFixed(1)}★` : ""}
              </span>
            )}
            {status === "connected" && summary?.lastSyncedAt && (
              <span className="ml-2">
                · Last sync {new Date(summary.lastSyncedAt).toLocaleDateString("en-GB")}
              </span>
            )}
          </div>

          {status === "connected" ? (
            <div className="space-y-2">
              <p className="text-[11px] text-muted font-mono truncate">
                Place ID: {placeId}
              </p>
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-[11px] font-semibold text-muted hover:text-red-500 transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : status !== "loading" ? (
            <div className="space-y-2.5">
              <div>
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1">
                  Google Place ID
                </label>
                <input
                  type="text"
                  value={placeId}
                  onChange={(e) => setPlaceId(e.target.value)}
                  placeholder="ChIJ..."
                  className="w-full text-[12px] px-3 py-2 rounded-lg border border-border bg-white text-navy placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue font-mono"
                />
                <p className="text-[10px] text-muted mt-1 leading-relaxed">
                  Find your Place ID at{" "}
                  <a
                    href="https://developers.google.com/maps/documentation/places/web-service/place-id"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue hover:underline"
                  >
                    Google&apos;s Place ID Finder
                  </a>
                  . Paste the raw ID (starts with <span className="font-mono">ChIJ</span>).
                </p>
              </div>

              {showAdvanced ? (
                <div>
                  <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1">
                    Google Places API Key (optional)
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Leave blank to use the platform key"
                    className="w-full text-[12px] px-3 py-2 rounded-lg border border-border bg-white text-navy placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue"
                  />
                  <p className="text-[10px] text-muted mt-1">
                    Bring your own key if you need usage isolated to your Google Cloud project.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAdvanced(true)}
                  className="text-[10px] font-semibold text-muted hover:text-navy transition-colors"
                >
                  Advanced — use your own API key
                </button>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={testing || saving || !placeId.trim()}
                  className="text-[11px] font-semibold text-white bg-blue hover:bg-blue-bright px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {(testing || saving) && <Loader2 size={12} className="animate-spin" />}
                  {testing ? "Testing…" : saving ? "Saving…" : "Connect & sync"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
