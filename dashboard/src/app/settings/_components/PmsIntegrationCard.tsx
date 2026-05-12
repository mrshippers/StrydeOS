"use client";

import { useState, useEffect } from "react";
import { doc, updateDoc, collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import { normalizeApiError } from "@/lib/api-errors";
import Tooltip from "@/components/ui/Tooltip";
import {
  Check,
  Loader2,
  Link2,
  Unplug,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  XCircle,
  Upload,
} from "lucide-react";
import type { ClinicProfile, PmsProvider } from "@/types";
import { brand } from "@/lib/brand";
import ProviderLogo from "./ProviderLogo";
import CsvImportPanel from "./pms/CsvImportPanel";
import ImportHistory, { type ImportHistoryRecord } from "./pms/ImportHistory";
import EmailIngest from "./pms/EmailIngest";

// ─── PMS provider catalogue + supporting types ────────────────────────────

interface PmsProviderOption {
  id: PmsProvider;
  label: string;
  icon: string;
  logo?: string;
  logoDark?: string;
  comingSoon: boolean;
  csvBridge?: boolean;
  recentlyAdded?: boolean;
  hasApi?: boolean;
}

const PMS_PROVIDERS: PmsProviderOption[] = [
  { id: "writeupp", label: "WriteUpp", icon: "📋", logo: "/integrations/writeupp.svg", comingSoon: false, hasApi: false, csvBridge: true },
  { id: "cliniko", label: "Cliniko", icon: "🗂️", logo: "/integrations/cliniko-dark.svg", logoDark: "/integrations/cliniko-light.svg", comingSoon: false, hasApi: true },
  { id: "tm3", label: "TM3", icon: "⚕️", logo: "/integrations/tm3.svg", comingSoon: false, csvBridge: true, hasApi: false },
  { id: "jane", label: "Jane App", icon: "🌿", logo: "/integrations/jane.png", comingSoon: true, hasApi: false },
  { id: "powerdiary", label: "Zanda (Power Diary)", icon: "📓", logo: "/integrations/powerdiary.png", comingSoon: false, recentlyAdded: true, hasApi: true },
  { id: "pabau", label: "Pabau", icon: "🏥", logo: "/integrations/pabau.svg", comingSoon: true, hasApi: false },
  { id: "halaxy", label: "Halaxy", icon: "💙", logo: "/integrations/halaxy.svg", comingSoon: false, recentlyAdded: true, hasApi: true },
  { id: "pps", label: "PPS (Rushcliff)", icon: "🩺", logo: "/integrations/pps.svg", comingSoon: true, hasApi: false },
];

// ─── PmsIntegrationCard ───────────────────────────────────────────────────

interface PmsIntegrationCardProps {
  cp: ClinicProfile | null;
}

export default function PmsIntegrationCard({ cp }: PmsIntegrationCardProps) {
  const { user, firebaseUser, refreshClinicProfile } = useAuth();
  const { toast } = useToast();
  const clinicId = user?.clinicId;

  const [pmsProvider, setPmsProvider] = useState<string>("");
  const [pmsApiKey, setPmsApiKey] = useState("");
  const [pmsConnected, setPmsConnected] = useState(false);
  const [pmsTesting, setPmsTesting] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pmsTestFailed, setPmsTestFailed] = useState(false);
  const [requestingAssist, setRequestingAssist] = useState(false);
  const [assistRequested, setAssistRequested] = useState(false);
  const [importPanelOpen, setImportPanelOpen] = useState(false);

  // Column mapping trigger state (set by handleImportCSV when server returns
  // needsMapping; consumed by ColumnMapping child which owns its own
  // interaction state — values, schema name, saving flag).
  const [mappingHeaders, setMappingHeaders] = useState<string[] | null>(null);
  const [mappingSampleRows, setMappingSampleRows] = useState<Record<string, string>[]>([]);
  const [mappingFile, setMappingFile] = useState<File | null>(null);
  const [mappingFileType, setMappingFileType] = useState<"appointments" | "patients">("appointments");

  // Import history state (lifted so the CSV bridge card can show "Last import"
  // alongside the standalone ImportHistory card below.)
  const [importHistory, setImportHistory] = useState<ImportHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Onboarding wizard state — lifted so the CSV bridge card can open the
  // wizard pre-configured at step 4 (auto-import setup).
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardPms, setWizardPms] = useState<string>("");

  // Sync PMS state with clinic profile on mount/change. Only treat PMS as
  // connected if the flag is true AND there's evidence of actual credentials
  // (either a sync has run or the V2 stage reached api_connected+) — this
  // prevents a false Connected state when the user skipped the PMS step
  // during onboarding.
  useEffect(() => {
    if (!cp) return;
    setPmsProvider(cp.pmsType ?? "");
    const pmsFlag = cp.onboarding?.pmsConnected ?? false;
    const pmsVerified =
      !!cp.pmsLastSyncAt ||
      ["api_connected", "first_value_reached", "activation_complete"].includes(
        cp.onboardingV2?.stage ?? ""
      );
    setPmsConnected(pmsFlag && pmsVerified);
  }, [cp]);

  async function handleTestPms() {
    if (!pmsProvider || !pmsApiKey.trim()) {
      toast("Select a provider and enter your API key", "error");
      return;
    }
    if (!clinicId || !firebaseUser) {
      toast("PMS connected (demo mode)", "success");
      setPmsConnected(true);
      return;
    }
    setPmsTesting(true);
    setPmsTestFailed(false);
    try {
      const token = await firebaseUser.getIdToken();

      const testRes = await fetch(`/api/pms/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: pmsProvider, apiKey: pmsApiKey.trim() }),
      });
      const testData = await testRes.json().catch(() => ({}));
      if (!testRes.ok || !testData.ok) {
        toast(normalizeApiError(testRes.status, testData.error, "Connection failed. Check your API key."), "error");
        setPmsTestFailed(true);
        setPmsTesting(false);
        return;
      }
      const saveRes = await fetch(`/api/pms/save-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: pmsProvider, apiKey: pmsApiKey.trim(), baseUrl: testData.resolvedBase }),
      });
      if (!saveRes.ok) {
        toast("Connection verified but save failed. Try again.", "error");
        setPmsTesting(false);
        return;
      }
      setPmsConnected(true);
      setPmsApiKey("");
      await refreshClinicProfile();
      toast("PMS connected and key saved securely", "success");
    } catch {
      toast("Connection failed. Check your API key and try again.", "error");
    } finally {
      setPmsTesting(false);
    }
  }

  async function handleDisconnectPms() {
    if (!clinicId || !firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();

      const res = await fetch(`/api/pms/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(normalizeApiError(res.status, data?.error, "Failed to disconnect"), "error");
        return;
      }
      setPmsConnected(false);
      setPmsApiKey("");
      setPmsProvider("");
      await refreshClinicProfile();
      toast("PMS disconnected", "success");
    } catch {
      toast("Failed to disconnect", "error");
    }
  }

  async function handleRequestAssistedSetup() {
    if (!clinicId || !db || !user) return;
    setRequestingAssist(true);
    try {
      await addDoc(collection(db, "clinics", clinicId, "integration_requests"), {
        provider: pmsProvider || "unknown",
        ownerEmail: user.email,
        clinicName: cp?.name ?? "",
        requestedAt: new Date().toISOString(),
        status: "pending",
      });
      await updateDoc(doc(db, "clinics", clinicId), {
        "onboardingV2.stage": "integration_blocked",
        "onboardingV2.path": "assisted",
        "onboardingV2.blockers": ["missing_api_credentials"],
        "onboardingV2.lastEventAt": new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setAssistRequested(true);
      toast("Setup assistance requested — we'll be in touch within 1 business day", "success");
    } catch {
      toast("Failed to submit request. Please try again.", "error");
    } finally {
      setRequestingAssist(false);
    }
  }

  async function handleRunSync(backfill = false) {
    if (!firebaseUser) {
      toast("Sign in required to trigger sync", "error");
      return;
    }
    setSyncRunning(true);
    setSyncResult(null);
    try {
      const token = await firebaseUser.getIdToken();

      const res = await fetch(`/api/pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clinicId: user?.clinicId, ...(backfill ? { backfill: true } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(normalizeApiError(res.status, data?.error, "Sync failed"));
      const stages: Array<{ stage: string; ok: boolean; count: number; errors?: string[] }> = data?.stages ?? [];
      const failed = stages.filter((s) => !s.ok);
      if (failed.length) {
        setSyncResult({ ok: false, msg: `${failed.length} stage(s) failed: ${failed.map((s) => s.stage).join(", ")}` });
        toast("Sync completed with errors — see details below", "error");
      } else {
        const totalRecords = stages.reduce((sum, s) => sum + (s.count ?? 0), 0);
        setSyncResult({ ok: true, msg: `Sync complete — ${totalRecords} records processed` });
        toast("Sync complete", "success");
        await refreshClinicProfile();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setSyncResult({ ok: false, msg });
      toast(msg, "error");
    } finally {
      setSyncRunning(false);
    }
  }

  async function handleImportCSV(file: File, fileType: "appointments" | "patients", schemaId?: string) {
    if (!firebaseUser) {
      toast("Sign in required", "error");
      return;
    }
    setCsvUploading(true);
    setCsvResult(null);
    try {
      const token = await firebaseUser.getIdToken();

      const form = new FormData();
      form.append("file", file);
      form.append("fileType", fileType);
      if (schemaId) form.append("schemaId", schemaId);
      const res = await fetch(`/api/pms/import-csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(normalizeApiError(res.status, data?.error, "Import failed"));

      if (data.needsMapping === true) {
        setMappingHeaders(data.headers ?? []);
        setMappingSampleRows(data.sampleRows ?? []);
        setMappingFile(file);
        setMappingFileType(fileType);
        toast("Unknown format — map your columns below", "info");
        return;
      }

      setCsvResult({ ok: true, msg: data.message ?? `Imported ${data.written} records` });
      toast(data.message ?? "Import complete", "success");
      await refreshClinicProfile();
      loadImportHistory();

      if (!pmsConnected) {
        toast("You're live on CSV data — connect your PMS in Settings when you're ready", "info");
        setPmsConnected(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setCsvResult({ ok: false, msg });
      toast(msg, "error");
    } finally {
      setCsvUploading(false);
    }
  }

  function cancelMapping() {
    setMappingHeaders(null);
    setMappingSampleRows([]);
    setMappingFile(null);
  }

  async function loadImportHistory() {
    if (!firebaseUser) return;
    setHistoryLoading(true);
    try {
      const token = await firebaseUser.getIdToken();

      const res = await fetch(`/api/pms/import-history?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.imports) {
        setImportHistory(data.imports as ImportHistoryRecord[]);
      }
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(false);
      setHistoryLoaded(true);
    }
  }

  useEffect(() => {
    if (firebaseUser && !historyLoaded) loadImportHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  return (
    <>
      {/* PMS Connection */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <div className="mb-4">
          <h3 className="font-display text-lg text-navy">PMS Connection</h3>
        </div>

        {pmsConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-success/20 bg-success/5">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                <Link2 size={18} className="text-success" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-navy">
                  {PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.label ?? "PMS"} — Connected
                </p>
                <p className="text-[11px] text-muted">
                  {cp?.pmsLastSyncAt
                    ? `Last synced ${new Date(cp.pmsLastSyncAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                    : "Awaiting first sync"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip content="Pull latest data from your PMS now">
                <button
                  onClick={() => handleRunSync(false)}
                  disabled={syncRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={syncRunning ? "animate-spin" : ""} />
                  {syncRunning ? "Syncing…" : "Sync now"}
                </button>
                </Tooltip>
                <button
                  onClick={handleDisconnectPms}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-danger border border-danger/20 hover:bg-danger/5 transition-colors"
                >
                  <Unplug size={12} />
                  Disconnect
                </button>
              </div>
            </div>

            {syncResult && (
              <div className={`flex items-start gap-2 p-3 rounded-xl border text-[12px] ${syncResult.ok ? "border-success/20 bg-success/5 text-success" : "border-danger/20 bg-danger/5 text-danger"}`}>
                {syncResult.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
                <span>{syncResult.msg}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => handleRunSync(true)}
                disabled={syncRunning}
                className="text-[11px] text-muted hover:text-navy underline underline-offset-2 transition-colors disabled:opacity-50"
              >
                Run full backfill (13 weeks of history)
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                PMS Provider
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {PMS_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPmsProvider(p.id)}
                    className={`relative flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                      pmsProvider === p.id
                        ? "border-blue bg-blue/5 text-blue"
                        : p.comingSoon
                          ? "border-border/50 text-muted/70 cursor-default"
                          : "border-border hover:border-blue/30 text-navy"
                    }`}
                    title={p.comingSoon ? "Coming soon — integration in development" : undefined}
                  >
                    {p.logo ? (
                      <ProviderLogo logo={p.logo} logoDark={p.logoDark} alt={p.label} className="h-7 w-auto max-w-[68px] object-contain" />
                    ) : (
                      <span className="text-lg leading-none">{p.icon}</span>
                    )}
                    <span className="text-[12px] font-semibold leading-tight text-center">{p.label}</span>
                    {pmsProvider === p.id && !p.comingSoon && (
                      <Check size={11} className="absolute top-1.5 right-1.5 text-blue" />
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

            {/* API providers — show API key input */}
            {pmsProvider && PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.hasApi && !PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.comingSoon && (
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  API Key
                </label>
                <input
                  type="password"
                  value={pmsApiKey}
                  onChange={(e) => setPmsApiKey(e.target.value)}
                  placeholder={`Enter your ${PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.label ?? pmsProvider} API key`}
                  className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
                />
                <button
                  onClick={handleTestPms}
                  disabled={!pmsApiKey.trim() || pmsTesting}
                  className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: (!pmsApiKey.trim() && !pmsTesting) ? "#9CA3AF" : brand.success }}
                >
                  {pmsTesting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Link2 size={14} />
                  )}
                  {pmsTesting ? "Testing..." : "Test Connection"}
                </button>
                {!pmsApiKey.trim() && !pmsTesting && (
                  <p className="text-[11px] text-muted mt-1.5">Enter your API key above to test the connection</p>
                )}

                {/* Integration blocked fallback */}
                {pmsTestFailed && (
                  <div className="mt-4 p-4 rounded-xl border border-warn/20 bg-warn/5 space-y-3 animate-fade-in">
                    <p className="text-sm font-medium text-navy">Having trouble connecting?</p>
                    <div className="space-y-2">
                      <a
                        href={pmsProvider === "cliniko" ? "https://developer.cliniko.com/" : "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-[12px] text-blue font-semibold hover:underline"
                      >
                        <ArrowRight size={12} />
                        Where to find your {PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.label} API key
                      </a>

                      {assistRequested ? (
                        <div className="flex items-center gap-2 text-[12px] text-success font-medium">
                          <CheckCircle2 size={13} />
                          Request submitted — we&apos;ll be in touch within 1 business day
                        </div>
                      ) : (
                        <button
                          onClick={handleRequestAssistedSetup}
                          disabled={requestingAssist}
                          className="flex items-center gap-2 text-[12px] text-blue font-semibold hover:underline disabled:opacity-50"
                        >
                          {requestingAssist ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                          Request assisted setup
                        </button>
                      )}

                      <button
                        onClick={() => setImportPanelOpen(true)}
                        className="flex items-center gap-2 text-[12px] text-blue font-semibold hover:underline"
                      >
                        <ArrowRight size={12} />
                        Skip for now and use CSV instead
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Non-API providers — legacy message with CSV import link */}
            {pmsProvider && !PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.hasApi && !PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.comingSoon && !PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.csvBridge && (
              <p className="text-[12px] text-muted italic">
                {PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.label} is a legacy provider which doesn&apos;t support API integrations.{" "}
                <button
                  onClick={() => setImportPanelOpen(true)}
                  className="text-blue font-semibold not-italic hover:underline"
                >
                  Import via CSV instead
                </button>
              </p>
            )}

            {/* Coming soon providers */}
            {pmsProvider && PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.comingSoon && (
              <div className="p-4 rounded-xl border border-warn/20 bg-warn/5">
                <p className="text-sm font-medium text-navy">
                  {PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.label} integration is coming soon
                </p>
                <p className="text-[12px] text-muted mt-1">
                  We&apos;re working on this integration. You&apos;ll be notified when it&apos;s ready.{" "}
                  <button
                    onClick={() => setImportPanelOpen(true)}
                    className="text-blue font-semibold hover:underline"
                  >
                    Import via CSV
                  </button>{" "}in the meantime.
                </p>
              </div>
            )}

            {/* CSV Bridge — active connection card (WriteUpp, TM3, and any csvBridge provider) */}
            {pmsProvider && PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.csvBridge && (
              <div className="p-4 rounded-xl border border-navy/15 bg-navy/5">
                {(() => {
                  const providerLabel = PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.label ?? pmsProvider;
                  const lastImport = importHistory.find((r) => r.provider === providerLabel);
                  return (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: (() => {
                            if (!lastImport) return "#9CA3AF";
                            const hours = (Date.now() - new Date(lastImport.importedAt).getTime()) / 3600000;
                            return hours < 24 ? "#059669" : hours < 168 ? "#D97706" : "#DC2626";
                          })() }} />
                          <p className="text-sm font-semibold text-navy">{providerLabel} CSV Bridge</p>
                        </div>
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-navy/10 text-navy uppercase">Active</span>
                      </div>
                      {lastImport ? (
                        <p className="text-[12px] text-muted mb-3">
                          Last import: <strong className="text-navy">{new Date(lastImport.importedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</strong> &middot; {lastImport.rowsWritten} appointments
                        </p>
                      ) : (
                        <p className="text-[12px] text-muted mb-3">No data imported yet. Upload your first {providerLabel} CSV or set up email auto-import below.</p>
                      )}
                      <EmailIngest clinicId={clinicId} variant="compact" />
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => setImportPanelOpen(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors"
                        >
                          <Upload size={11} /> Upload CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => { setImportPanelOpen(true); setWizardOpen(true); setWizardPms(pmsProvider); setWizardStep(4); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-navy/70 hover:text-navy transition-colors"
                        >
                          Set up auto-import &rarr;
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ─── CSV Import Panel (collapsible, inside PMS card) ───────── */}
        <CsvImportPanel
          open={importPanelOpen}
          onClose={() => setImportPanelOpen(false)}
          clinicId={clinicId}
          wizardOpen={wizardOpen}
          wizardStep={wizardStep}
          wizardPms={wizardPms}
          setWizardOpen={setWizardOpen}
          setWizardStep={setWizardStep}
          setWizardPms={setWizardPms}
          csvUploading={csvUploading}
          csvResult={csvResult}
          onImportCSV={handleImportCSV}
          mappingHeaders={mappingHeaders}
          mappingSampleRows={mappingSampleRows}
          mappingFile={mappingFile}
          mappingFileType={mappingFileType}
          onCancelMapping={cancelMapping}
        />
      </div>

      {/* Import History (Phase 4) */}
      <ImportHistory
        importHistory={importHistory}
        historyLoading={historyLoading}
        historyLoaded={historyLoaded}
        onRefresh={loadImportHistory}
      />
    </>
  );
}
