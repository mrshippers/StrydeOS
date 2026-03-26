"use client";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import { normalizeApiError } from "@/lib/api-errors";
import {
  Link2,
  Unplug,
  Loader2,
  Check,
} from "lucide-react";
import { brand } from "@/lib/brand";

interface HepProviderOption {
  id: string;
  label: string;
  icon: string;
  logo?: string;
  comingSoon: boolean;
  recentlyAdded?: boolean;
}

const HEP_PROVIDERS: HepProviderOption[] = [
  { id: "physitrack", label: "Physitrack", icon: "🏃", logo: "/integrations/physitrack.svg", comingSoon: false },
  { id: "rehab_my_patient", label: "Rehab My Patient", icon: "💪", logo: "/integrations/rehab_my_patient.svg", comingSoon: false },
  { id: "wibbi", label: "Wibbi", icon: "🎯", logo: "/integrations/wibbi.svg", comingSoon: false },
];

interface HepIntegrationCardProps {
  hepProvider: string;
  setHepProvider: (v: string) => void;
  hepApiKey: string;
  setHepApiKey: (v: string) => void;
  hepConnected: boolean;
  setHepConnected: (v: boolean) => void;
  hepTesting: boolean;
  setHepTesting: (v: boolean) => void;
}

export default function HepIntegrationCard({
  hepProvider,
  setHepProvider,
  hepApiKey,
  setHepApiKey,
  hepConnected,
  setHepConnected,
  hepTesting,
  setHepTesting,
}: HepIntegrationCardProps) {
  const { user, firebaseUser, refreshClinicProfile } = useAuth();
  const { toast } = useToast();
  const clinicId = user?.clinicId;

  async function handleTestHep() {
    if (!hepProvider || !hepApiKey.trim()) {
      toast("Select a provider and enter your API key", "error");
      return;
    }
    if (!clinicId || !firebaseUser) {
      toast("HEP connected (demo mode)", "success");
      setHepConnected(true);
      return;
    }
    setHepTesting(true);
    try {
      const token = await firebaseUser.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const testRes = await fetch(`${base}/api/hep/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: hepProvider, apiKey: hepApiKey.trim() }),
      });
      const testData = await testRes.json().catch(() => ({}));
      if (!testRes.ok || !testData.ok) {
        toast(normalizeApiError(testRes.status, testData.error, "Connection failed. Check your API key."), "error");
        setHepTesting(false);
        return;
      }
      const saveRes = await fetch(`${base}/api/hep/save-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: hepProvider, apiKey: hepApiKey.trim() }),
      });
      if (!saveRes.ok) {
        toast("Connection verified but save failed. Try again.", "error");
        setHepTesting(false);
        return;
      }
      setHepConnected(true);
      setHepApiKey("");
      await refreshClinicProfile();
      toast("HEP platform connected and key saved securely", "success");
    } catch {
      toast("Connection failed. Check your API key and try again.", "error");
    } finally {
      setHepTesting(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-navy">HEP Integration</h3>
        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-teal/10 text-teal">
          Programme Assignment
        </span>
      </div>
      <p className="text-[12px] text-muted mb-5">
        Connect your home exercise platform to track programme assignment rates. Most providers track &quot;was a programme assigned&quot; — full compliance tracking varies by platform.
      </p>

      {hepConnected ? (
        <div className="flex items-center gap-4 p-4 rounded-xl border border-success/20 bg-success/5">
          <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
            <Link2 size={18} className="text-success" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-navy">
              {HEP_PROVIDERS.find((p) => p.id === hepProvider)?.label ?? "HEP Platform"} — Connected
            </p>
            <p className="text-[11px] text-muted">
              Programme assignment data syncs automatically with the pipeline
            </p>
          </div>
          <button
            onClick={async () => {
              if (!clinicId || !firebaseUser) return;
              try {
                const token = await firebaseUser.getIdToken();
                const base = typeof window !== "undefined" ? window.location.origin : "";
                const res = await fetch(`${base}/api/hep/disconnect`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  toast(normalizeApiError(res.status, data?.error, "Failed to disconnect"), "error");
                  return;
                }
                setHepConnected(false);
                setHepProvider("");
                setHepApiKey("");
                await refreshClinicProfile();
                toast("HEP platform disconnected", "success");
              } catch {
                toast("Failed to disconnect", "error");
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-danger border border-danger/20 hover:bg-danger/5 transition-colors"
          >
            <Unplug size={12} />
            Disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
              HEP Provider
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {HEP_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => !p.comingSoon && setHepProvider(p.id)}
                  className={`relative flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                    hepProvider === p.id
                      ? "border-teal bg-teal/5 text-teal"
                      : p.comingSoon
                        ? "border-border/50 text-muted/70 cursor-default"
                        : "border-border hover:border-teal/30 text-navy"
                  }`}
                  title={p.comingSoon ? "Coming soon — integration in development" : undefined}
                >
                  {p.logo ? (
                    <img src={p.logo} alt={p.label} className="h-7 w-auto max-w-[68px] object-contain" />
                  ) : (
                    <span className="text-lg leading-none">{p.icon}</span>
                  )}
                  <span className="text-[12px] font-semibold leading-tight text-center">{p.label}</span>
                  {hepProvider === p.id && !p.comingSoon && (
                    <Check size={11} className="absolute top-1.5 right-1.5 text-teal" />
                  )}
                  {p.recentlyAdded && !p.comingSoon && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-success/10 text-success absolute top-1.5 left-1.5">
                      New
                    </span>
                  )}
                  {p.comingSoon && (
                    <span className="text-[9px] font-semibold text-muted/60 uppercase tracking-wide">
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {hepProvider && !HEP_PROVIDERS.find((p) => p.id === hepProvider)?.comingSoon && (
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                API Key
              </label>
              <input
                type="password"
                value={hepApiKey}
                onChange={(e) => setHepApiKey(e.target.value)}
                placeholder={`Enter your ${HEP_PROVIDERS.find((p) => p.id === hepProvider)?.label ?? hepProvider} API key`}
                className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
              />
              <button
                onClick={handleTestHep}
                disabled={!hepApiKey.trim() || hepTesting}
                className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: (!hepApiKey.trim() && !hepTesting) ? "#9CA3AF" : brand.success }}
              >
                {hepTesting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Link2 size={14} />
                )}
                {hepTesting ? "Testing..." : "Test Connection"}
              </button>
              {!hepApiKey.trim() && !hepTesting && (
                <p className="text-[11px] text-muted mt-1.5">Enter your API key above to test the connection</p>
              )}
            </div>
          )}

          {hepProvider && HEP_PROVIDERS.find((p) => p.id === hepProvider)?.comingSoon && (
            <div className="p-4 rounded-xl border border-warn/20 bg-warn/5">
              <p className="text-sm font-medium text-navy">
                {HEP_PROVIDERS.find((p) => p.id === hepProvider)?.label} integration is coming soon
              </p>
              <p className="text-[12px] text-muted mt-1">
                We're building the API adapter for this provider. You'll be notified when it's ready.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
