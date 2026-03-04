"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useClinicians } from "@/hooks/useClinicians";
import PageHeader from "@/components/ui/PageHeader";
import { getInitials } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { normalizeApiError } from "@/lib/api-errors";
import { AnimatePresence, motion } from "motion/react";
import {
  Save,
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  Link2,
  Unplug,
  CheckCircle2,
  Circle,
  ArrowRight,
  AlertTriangle,
  Shield,
  Sparkles,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { ClinicProfile, PmsProvider } from "@/types";

interface PmsProviderOption {
  id: PmsProvider;
  label: string;
  icon: string;
  comingSoon: boolean;
}

const PMS_PROVIDERS: PmsProviderOption[] = [
  { id: "writeupp", label: "WriteUpp", icon: "📋", comingSoon: false },
  { id: "cliniko", label: "Cliniko", icon: "🗂️", comingSoon: false },
  { id: "tm3", label: "TM3", icon: "⚕️", comingSoon: true },
  { id: "jane", label: "Jane App", icon: "🌿", comingSoon: true },
  { id: "powerdiary", label: "Power Diary", icon: "📓", comingSoon: true },
  { id: "pabau", label: "Pabau", icon: "🏥", comingSoon: true },
  { id: "halaxy", label: "Halaxy", icon: "💙", comingSoon: true },
];

function RetriggerTourButton() {
  const { user, refreshClinicProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleRetrigger() {
    if (!user?.uid) return;
    setLoading(true);
    try {
      if (user.uid === "demo") {
        const { clearDemoTourCompleted } = await import("@/components/FirstLoginTour");
        clearDemoTourCompleted();
        setDone(true);
        setTimeout(() => window.location.replace("/dashboard"), 800);
        return;
      }
      if (!db) return;
      await updateDoc(doc(db, "users", user.uid), {
        firstLogin: false,
        tourCompleted: false,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      });
      await refreshClinicProfile();
      setDone(true);
      setTimeout(() => window.location.replace("/dashboard"), 800);
    } catch (err) {
      console.error("[RetriggerTour]", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleRetrigger}
        disabled={loading || done}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-border text-navy bg-white hover:bg-cloud-light transition-all disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : done ? (
          <Check size={14} className="text-success" />
        ) : (
          <Sparkles size={14} />
        )}
        {done ? "Heading to dashboard…" : loading ? "Resetting…" : "Replay welcome tour"}
      </button>
      <p className="text-[11px] text-muted mt-1.5">
        Resets your tour state and redirects to the dashboard so the welcome screen fires again.
      </p>
    </div>
  );
}

function fallbackTargets(cp: ClinicProfile | null) {
  return {
    followUpRate: cp?.targets?.followUpRate ?? 2.9,
    physitrackRate: cp?.targets?.physitrackRate ?? 95,
    utilisationRate: cp?.targets?.utilisationRate ?? 85,
  };
}

export default function SettingsPage() {
  const { user, firebaseUser, refreshClinicProfile } = useAuth();
  const { clinicians } = useClinicians();
  const { toast } = useToast();
  const [promoting, setPromoting] = useState(false);
  const router = useRouter();

  async function handleMakeSuperAdmin() {
    if (!user?.uid || !db) return;
    setPromoting(true);
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { clinicId: "clinic-spires", role: "superadmin" },
        { merge: true }
      );
      await refreshClinicProfile();
      toast("You're now Stryde Super User. Redirecting…", "success");
      router.replace("/admin");
    } catch (err) {
      console.error(err);
      toast("Failed. Deploy Firestore rules first (see below).", "error");
    } finally {
      setPromoting(false);
    }
  }

  const cp = user?.clinicProfile ?? null;

  const [clinicName, setClinicName] = useState("");
  const [timezone, setTimezone] = useState("Europe/London");
  const [followUpTarget, setFollowUpTarget] = useState("2.9");
  const [physitrackTarget, setPhysitrackTarget] = useState("95");
  const [utilisationTarget, setUtilisationTarget] = useState("85");
  const [saving, setSaving] = useState(false);

  const savedValues = useMemo(() => {
    if (!cp) return null;
    const t = fallbackTargets(cp);
    return {
      clinicName: cp.name ?? "",
      timezone: cp.timezone ?? "Europe/London",
      followUpTarget: String(t.followUpRate),
      physitrackTarget: String(t.physitrackRate),
      utilisationTarget: String(t.utilisationRate),
    };
  }, [cp]);

  const isDirty = useMemo(() => {
    if (!savedValues) return false;
    return (
      clinicName !== savedValues.clinicName ||
      timezone !== savedValues.timezone ||
      followUpTarget !== savedValues.followUpTarget ||
      physitrackTarget !== savedValues.physitrackTarget ||
      utilisationTarget !== savedValues.utilisationTarget
    );
  }, [clinicName, timezone, followUpTarget, physitrackTarget, utilisationTarget, savedValues]);

  const { showDialog, confirmLeave, cancelLeave } = useUnsavedChanges({ isDirty });

  const [pmsProvider, setPmsProvider] = useState<string>("");
  const [pmsApiKey, setPmsApiKey] = useState("");
  const [pmsConnected, setPmsConnected] = useState(false);
  const [pmsTesting, setPmsTesting] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [hepProvider, setHepProvider] = useState<string>("");
  const [hepApiKey, setHepApiKey] = useState("");
  const [hepConnected, setHepConnected] = useState(false);
  const [hepTesting, setHepTesting] = useState(false);

  const [addingClinician, setAddingClinician] = useState(false);
  const [newClinicianName, setNewClinicianName] = useState("");
  const [newClinicianRole, setNewClinicianRole] = useState("Physiotherapist");

  // Clinician row expand/edit/delete state
  const [expandedClinicianId, setExpandedClinicianId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<Record<string, string>>({});
  const [sendingInvite, setSendingInvite] = useState<Record<string, boolean>>({});
  const [inviteResult, setInviteResult] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!cp) return;
    setClinicName(cp.name ?? "");
    setTimezone(cp.timezone ?? "Europe/London");
    const t = fallbackTargets(cp);
    setFollowUpTarget(String(t.followUpRate));
    setPhysitrackTarget(String(t.physitrackRate));
    setUtilisationTarget(String(t.utilisationRate));
    setPmsProvider(cp.pmsType ?? "");
    setPmsConnected(cp.onboarding?.pmsConnected ?? false);
    // API key is never read from server (stored in integrations_config only)
  }, [cp]);

  const clinicId = user?.clinicId;

  const handleSaveProfile = useCallback(async () => {
    if (!clinicId || !db) {
      toast("Settings saved (demo mode)", "success");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "clinics", clinicId), {
        name: clinicName,
        timezone,
        targets: {
          followUpRate: parseFloat(followUpTarget),
          physitrackRate: parseFloat(physitrackTarget),
          utilisationRate: parseFloat(utilisationTarget),
        },
        updatedAt: new Date().toISOString(),
      });
      await refreshClinicProfile();
      toast("Settings saved successfully", "success");
    } catch (err) {
      console.error("Failed to save settings:", err);
      toast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  }, [clinicId, clinicName, timezone, followUpTarget, physitrackTarget, utilisationTarget, refreshClinicProfile, toast]);

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
    try {
      const token = await firebaseUser.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const testRes = await fetch(`${base}/api/pms/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: pmsProvider, apiKey: pmsApiKey.trim() }),
      });
      const testData = await testRes.json().catch(() => ({}));
      if (!testRes.ok || !testData.ok) {
        toast(normalizeApiError(testRes.status, testData.error, "Connection failed. Check your API key."), "error");
        setPmsTesting(false);
        return;
      }
      const saveRes = await fetch(`${base}/api/pms/save-config`, {
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
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/pms/disconnect`, {
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

  async function handleRunSync(backfill = false) {
    if (!firebaseUser) {
      toast("Sign in required to trigger sync", "error");
      return;
    }
    setSyncRunning(true);
    setSyncResult(null);
    try {
      const token = await firebaseUser.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/pipeline/run`, {
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

  async function handleImportCSV(file: File, fileType: "appointments" | "patients") {
    if (!firebaseUser) {
      toast("Sign in required", "error");
      return;
    }
    setCsvUploading(true);
    setCsvResult(null);
    try {
      const token = await firebaseUser.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const form = new FormData();
      form.append("file", file);
      form.append("fileType", fileType);
      const res = await fetch(`${base}/api/pms/import-csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(normalizeApiError(res.status, data?.error, "Import failed"));
      setCsvResult({ ok: true, msg: data.message ?? `Imported ${data.written} records` });
      toast(data.message ?? "Import complete", "success");
      await refreshClinicProfile();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setCsvResult({ ok: false, msg });
      toast(msg, "error");
    } finally {
      setCsvUploading(false);
    }
  }

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
      toast("HEP platform connected and key saved securely", "success");
    } catch {
      toast("Connection failed. Check your API key and try again.", "error");
    } finally {
      setHepTesting(false);
    }
  }

  async function handleAddClinician() {
    if (!newClinicianName.trim()) return;
    if (!clinicId || !db) {
      toast("Clinician added (demo mode)", "success");
      setAddingClinician(false);
      setNewClinicianName("");
      return;
    }
    try {
      await addDoc(collection(db, "clinics", clinicId, "clinicians"), {
        name: newClinicianName.trim(),
        role: newClinicianRole,
        active: true,
        createdAt: serverTimestamp(),
      });
      toast(`${newClinicianName.trim()} added`, "success");
      setAddingClinician(false);
      setNewClinicianName("");

      if (cp && !cp.onboarding?.cliniciansConfirmed) {
        const allComplete =
          cp.onboarding?.pmsConnected && cp.onboarding?.targetsSet;
        await updateDoc(doc(db, "clinics", clinicId), {
          "onboarding.cliniciansConfirmed": true,
          ...(allComplete ? { status: "live" as const } : {}),
          updatedAt: new Date().toISOString(),
        });
        await refreshClinicProfile();
      }
    } catch {
      toast("Failed to add clinician", "error");
    }
  }

  async function handleDeactivateClinician(id: string, name: string) {
    if (!clinicId || !db) return;
    try {
      await deleteDoc(doc(db, "clinics", clinicId, "clinicians", id));
      toast(`${name} removed`, "success");
    } catch {
      toast("Failed to remove clinician", "error");
    }
  }

  async function handleConfirmTeam() {
    if (!clinicId || !db) return;
    try {
      const allComplete =
        cp?.onboarding?.pmsConnected && cp?.onboarding?.targetsSet;
      await updateDoc(doc(db, "clinics", clinicId), {
        "onboarding.cliniciansConfirmed": true,
        ...(allComplete ? { status: "live" as const } : {}),
        updatedAt: new Date().toISOString(),
      });
      await refreshClinicProfile();
      toast("Team confirmed", "success");
    } catch {
      toast("Failed to confirm team", "error");
    }
  }

  async function handleSendInvite(clinicianId: string) {
    const email = editingEmail[clinicianId]?.trim();
    if (!email || !firebaseUser) {
      setInviteResult((prev) => ({ ...prev, [clinicianId]: "Enter a valid email first." }));
      return;
    }
    setSendingInvite((prev) => ({ ...prev, [clinicianId]: true }));
    setInviteResult((prev) => ({ ...prev, [clinicianId]: "" }));
    try {
      const token = await firebaseUser.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/clinic/resend-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clinicianId, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setInviteResult((prev) => ({
          ...prev,
          [clinicianId]: data.sent
            ? `Invite sent to ${email}`
            : `Link generated — no email provider configured. Link: ${data.link ?? ""}`,
        }));
      } else {
        setInviteResult((prev) => ({
          ...prev,
          [clinicianId]: normalizeApiError(res.status, data?.error, "Failed to send invite."),
        }));
      }
    } catch {
      setInviteResult((prev) => ({ ...prev, [clinicianId]: "Network error — try again." }));
    } finally {
      setSendingInvite((prev) => ({ ...prev, [clinicianId]: false }));
    }
  }

  const canManageTeam =
    user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";

  const onboarding = cp?.onboarding ?? { pmsConnected: false, cliniciansConfirmed: false, targetsSet: false };
  const onboardingComplete = onboarding.pmsConnected && onboarding.cliniciansConfirmed && onboarding.targetsSet;
  const showOnboarding = cp?.status === "onboarding" && !onboardingComplete;

  async function markTargetsSet() {
    if (!clinicId || !db) return;
    try {
      const allComplete =
        cp?.onboarding?.pmsConnected && cp?.onboarding?.cliniciansConfirmed;
      await updateDoc(doc(db, "clinics", clinicId), {
        "onboarding.targetsSet": true,
        ...(allComplete ? { status: "live" as const } : {}),
        updatedAt: new Date().toISOString(),
      });
      await refreshClinicProfile();
    } catch {
      // silently fail
    }
  }

  async function handleSaveWithOnboarding() {
    await handleSaveProfile();
    if (!onboarding.targetsSet) {
      await markTargetsSet();
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Settings" subtitle="Manage your clinic configuration, targets, and team" />

      {/* Account / one-click Stryde Super User */}
      <div className="rounded-[var(--radius-card)] bg-cloud-light border border-border p-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Account</p>
        <p className="text-xs text-navy mb-1">
          <span className="text-muted">Role:</span> <strong>{user?.role ?? "—"}</strong>
        </p>
        {/* Retrigger tour */}
        <RetriggerTourButton />

        {user?.role !== "superadmin" && (
          <>
            <button
              type="button"
              onClick={handleMakeSuperAdmin}
              disabled={promoting}
              className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "#1A5CDB" }}
            >
              {promoting ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
              {promoting ? "Updating…" : "Make me Stryde Super User"}
            </button>
            <p className="text-[11px] text-muted mt-2">
              Writes your user doc in Firestore and sends you to /admin. If it fails, deploy the updated Firestore rules (see firestore.rules in the repo) in Firebase Console → Firestore → Rules.
            </p>
          </>
        )}
      </div>

      {/* Unsaved changes dialog */}
      <AnimatePresence>
        {showDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[80] flex items-center justify-center px-4"
            style={{ background: "rgba(11, 37, 69, 0.5)", backdropFilter: "blur(4px)" }}
            onClick={cancelLeave}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 4 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-[var(--shadow-elevated)]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-warn/10 flex items-center justify-center">
                  <AlertTriangle size={18} className="text-warn" />
                </div>
                <div>
                  <h3 className="font-display text-lg text-navy">Unsaved changes</h3>
                  <p className="text-xs text-muted">Your changes will be lost if you leave now.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={cancelLeave}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-navy border border-border hover:bg-cloud-light transition-colors"
                >
                  Stay on page
                </button>
                <button
                  onClick={confirmLeave}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors hover:opacity-90"
                  style={{ background: "#DC2626" }}
                >
                  Discard & leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Checklist */}
      {showOnboarding && (
        <div className="rounded-[var(--radius-card)] border-2 border-blue/30 bg-blue/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl bg-blue/10 flex items-center justify-center">
              <ArrowRight size={16} className="text-blue" />
            </div>
            <div>
              <h3 className="font-display text-lg text-navy">Get started</h3>
              <p className="text-xs text-muted">Complete these steps to activate your dashboard</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { key: "pmsConnected", label: "Connect your PMS", desc: "Link WriteUpp or Cliniko to sync patient data", done: onboarding.pmsConnected },
              { key: "cliniciansConfirmed", label: "Confirm your clinicians", desc: "Add or verify the clinicians in your practice", done: onboarding.cliniciansConfirmed },
              { key: "targetsSet", label: "Set your KPI targets", desc: "Define follow-up rate, physitrack, and utilisation targets", done: onboarding.targetsSet },
            ].map((step) => (
              <div
                key={step.key}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  step.done
                    ? "border-success/20 bg-success/5"
                    : "border-border bg-white"
                }`}
              >
                {step.done ? (
                  <CheckCircle2 size={18} className="text-success shrink-0" />
                ) : (
                  <Circle size={18} className="text-muted/40 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${step.done ? "text-success" : "text-navy"}`}>
                    {step.label}
                  </p>
                  <p className="text-[11px] text-muted">{step.desc}</p>
                </div>
                {step.done && (
                  <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">
                    Done
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Clinic Details */}
        <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
          <h3 className="font-display text-lg text-navy mb-4">Clinic Details</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Clinic Name
              </label>
              <input
                type="text"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
              >
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Europe/Dublin">Europe/Dublin</option>
                <option value="America/New_York">US Eastern</option>
                <option value="Australia/Sydney">Australia/Sydney</option>
              </select>
            </div>
          </div>
        </div>

        {/* KPI Targets */}
        <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
          <h3 className="font-display text-lg text-navy mb-4">KPI Targets</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Follow-Up Rate Target (sessions per patient)
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="10"
                value={followUpTarget}
                onChange={(e) => setFollowUpTarget(e.target.value)}
                className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Physitrack Rate Target (%)
              </label>
              <input
                type="number"
                step="1"
                min="50"
                max="100"
                value={physitrackTarget}
                onChange={(e) => setPhysitrackTarget(e.target.value)}
                className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Utilisation Rate Target (%)
              </label>
              <input
                type="number"
                step="1"
                min="50"
                max="100"
                value={utilisationTarget}
                onChange={(e) => setUtilisationTarget(e.target.value)}
                className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
              />
            </div>
          </div>

          <button
            onClick={handleSaveWithOnboarding}
            disabled={saving}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
            style={{ background: "#1A5CDB" }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving..." : "Save Targets"}
          </button>
        </div>
      </div>

      {/* PMS Connection */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <h3 className="font-display text-lg text-navy mb-4">PMS Connection</h3>

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
                <button
                  onClick={() => handleRunSync(false)}
                  disabled={syncRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors disabled:opacity-50"
                  title="Pull latest data from your PMS now"
                >
                  <RefreshCw size={12} className={syncRunning ? "animate-spin" : ""} />
                  {syncRunning ? "Syncing…" : "Sync now"}
                </button>
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
                          ? "border-border/50 text-muted/50 cursor-default"
                          : "border-border hover:border-blue/30 text-navy"
                    }`}
                    title={p.comingSoon ? "Coming soon — integration in development" : undefined}
                  >
                    <span className="text-lg leading-none">{p.icon}</span>
                    <span className="text-[12px] font-semibold leading-tight text-center">{p.label}</span>
                    {pmsProvider === p.id && !p.comingSoon && (
                      <Check size={11} className="absolute top-1.5 right-1.5 text-blue" />
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

            {pmsProvider && !PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.comingSoon && (
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
                  className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#059669" }}
                >
                  {pmsTesting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Link2 size={14} />
                  )}
                  {pmsTesting ? "Testing..." : "Test Connection"}
                </button>
              </div>
            )}

            {pmsProvider && PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.comingSoon && (
              <div className="p-4 rounded-xl border border-warn/20 bg-warn/5">
                <p className="text-sm font-medium text-navy">
                  {PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.label} integration is coming soon
                </p>
                <p className="text-[12px] text-muted mt-1">
                  We&apos;re building the API adapter for this provider. You&apos;ll be notified when it&apos;s ready.
                  In the meantime, contact support to discuss early access.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CSV Import — WriteUpp / any PMS */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-display text-lg text-navy">Import from CSV</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue/10 text-blue">WriteUpp &amp; others</span>
        </div>
        <p className="text-[12px] text-muted mb-5">
          No API? No problem. Export your appointment or patient data from WriteUpp (Tools → Data Export → Appointments → Export to CSV) and drop it here. Data populates instantly.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(["appointments", "patients"] as const).map((type) => (
            <label
              key={type}
              className={`relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
                csvUploading ? "opacity-50 pointer-events-none" : "border-border hover:border-blue/40 hover:bg-blue/2"
              }`}
            >
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                disabled={csvUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportCSV(f, type);
                  e.target.value = "";
                }}
              />
              <div className="w-10 h-10 rounded-xl bg-cloud-light flex items-center justify-center">
                {csvUploading ? <Loader2 size={18} className="animate-spin text-blue" /> : <ArrowRight size={18} className="text-navy rotate-90" />}
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-navy capitalize">{type} CSV</p>
                <p className="text-[11px] text-muted mt-0.5">
                  {type === "appointments" ? "Appointments + auto-recomputes metrics" : "Patient demographics"}
                </p>
              </div>
            </label>
          ))}
        </div>

        {csvResult && (
          <div className={`flex items-start gap-2 mt-4 p-3 rounded-xl border text-[12px] ${csvResult.ok ? "border-success/20 bg-success/5 text-success" : "border-danger/20 bg-danger/5 text-danger"}`}>
            {csvResult.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
            <span>{csvResult.msg}</span>
          </div>
        )}

        <p className="text-[11px] text-muted mt-4">
          WriteUpp: Menu (top-left) → Tools → Data Export → Appointments tab → Export to CSV.
          Repeat monthly or whenever you want fresh data. Uploading again merges — it won&apos;t create duplicates.
        </p>
      </div>

      {/* HEP Integration */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <h3 className="font-display text-lg text-navy mb-4">HEP Integration</h3>

        {hepConnected ? (
          <div className="flex items-center gap-4 p-4 rounded-xl border border-success/20 bg-success/5">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
              <Link2 size={18} className="text-success" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-navy">
                {hepProvider === "physitrack" ? "Physitrack" : "HEP Platform"} — Connected
              </p>
              <p className="text-[11px] text-muted">
                Exercise compliance data syncs automatically with the pipeline
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                HEP Provider
              </label>
              <div className="flex gap-3">
                {(["physitrack"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setHepProvider(p)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                      hepProvider === p
                        ? "border-blue bg-blue/5 text-blue"
                        : "border-border hover:border-blue/30 text-navy"
                    }`}
                  >
                    Physitrack
                    {hepProvider === p && <Check size={14} />}
                  </button>
                ))}
              </div>
            </div>

            {hepProvider && (
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  API Key
                </label>
                <input
                  type="password"
                  value={hepApiKey}
                  onChange={(e) => setHepApiKey(e.target.value)}
                  placeholder="Enter your Physitrack API key"
                  className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
                />
                <button
                  onClick={handleTestHep}
                  disabled={!hepApiKey.trim() || hepTesting}
                  className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#059669" }}
                >
                  {hepTesting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Link2 size={14} />
                  )}
                  {hepTesting ? "Testing..." : "Test Connection"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compatible Data Sources */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <h3 className="font-display text-lg text-navy mb-1">Compatible Data Sources</h3>
        <p className="text-xs text-muted mb-5">
          These tools enrich StrydeOS Intelligence with clinical data. They are not PMS integrations — they layer additional signals into your analytics.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Heidi */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0 text-lg">
                🎙️
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
                <div className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-warn inline-block" />
                  Connects via webhook · Documentation bridge in development
                </div>
              </div>
            </div>
          </div>

          {/* TM3 — elevated from PMS list */}
          <div className="rounded-xl border border-warn/30 bg-warn/5 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-warn/10 flex items-center justify-center shrink-0 text-lg">
                ⚕️
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-navy">TM3 (Blue Zinc)</p>
                  <span className="text-[9px] font-semibold text-warn uppercase tracking-wide px-2 py-0.5 rounded-full bg-warn/10 border border-warn/20">
                    Coming soon
                  </span>
                </div>
                <p className="text-[11px] text-muted mb-2 leading-relaxed">
                  Full PMS integration for TM3 clinics. TM3 dominates UK MSK and insurance-funded practices. API access is being scoped — CSV bridge available as interim.
                </p>
                <button
                  onClick={() => {}}
                  className="text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors"
                >
                  Join the waitlist →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clinic Management */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="font-display text-lg text-navy">Clinic Management</h3>
            {cp?.name && (
              <p className="text-[12px] text-muted italic mt-0.5">{cp.name} team</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showOnboarding && clinicians.length > 0 && !onboarding.cliniciansConfirmed && (
              <button
                onClick={handleConfirmTeam}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white transition-all hover:opacity-90"
                style={{ background: "#059669" }}
              >
                <CheckCircle2 size={12} />
                Confirm team
              </button>
            )}
            {canManageTeam && (
              <button
                onClick={() => setAddingClinician(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors"
              >
                <Plus size={12} />
                Add Clinician
              </button>
            )}
          </div>
        </div>

        {addingClinician && (
          <div className="mb-4 mt-4 p-4 rounded-xl border border-blue/20 bg-blue/5 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newClinicianName}
                  onChange={(e) => setNewClinicianName(e.target.value)}
                  placeholder="Full name"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  Role
                </label>
                <select
                  value={newClinicianRole}
                  onChange={(e) => setNewClinicianRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
                >
                  <option>Physiotherapist</option>
                  <option>Senior Physiotherapist</option>
                  <option>Sports Therapist</option>
                  <option>Practice Owner</option>
                  <option>Admin</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddClinician}
                disabled={!newClinicianName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "#1A5CDB" }}
              >
                <Check size={12} />
                Add
              </button>
              <button
                onClick={() => { setAddingClinician(false); setNewClinicianName(""); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-muted hover:text-navy transition-colors"
              >
                <X size={12} />
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2 mt-4">
          {clinicians.map((c) => {
            const isExpanded = expandedClinicianId === c.id;
            const isConfirmingDelete = confirmDeleteId === c.id;

            return (
              <div key={c.id} className="rounded-xl border border-border/50 overflow-hidden">
                {/* Row header — click to expand */}
                <button
                  onClick={() => {
                    setExpandedClinicianId(isExpanded ? null : c.id);
                    setConfirmDeleteId(null);
                    setInviteResult((prev) => ({ ...prev, [c.id]: "" }));
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cloud-light/50 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-navy flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                    {getInitials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy">{c.name}</p>
                    <p className="text-[11px] text-muted">{c.role}</p>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      c.active ? "bg-success/10 text-success" : "bg-muted/10 text-muted"
                    }`}
                  >
                    {c.active ? "Active" : "Inactive"}
                  </span>
                  <div
                    className={`transition-transform duration-200 text-muted shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </button>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="border-t border-border/50 px-4 py-4 bg-cloud-light/30 animate-fade-in space-y-4">

                    {/* Send invite email */}
                    <div>
                      <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">
                        Invite / Re-invite
                      </p>
                      <p className="text-[12px] text-muted mb-2">
                        Enter this clinician&apos;s email address to send them a login invite link directly in-app — no need to contact support.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={editingEmail[c.id] ?? ""}
                          onChange={(e) =>
                            setEditingEmail((prev) => ({ ...prev, [c.id]: e.target.value }))
                          }
                          placeholder="clinician@example.com"
                          className="flex-1 px-3 py-2 rounded-lg border border-border bg-white text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSendInvite(c.id);
                          }}
                        />
                        <button
                          onClick={() => handleSendInvite(c.id)}
                          disabled={!editingEmail[c.id]?.trim() || sendingInvite[c.id]}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 shrink-0"
                          style={{ background: "#1A5CDB" }}
                        >
                          {sendingInvite[c.id] ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <ArrowRight size={12} />
                          )}
                          {sendingInvite[c.id] ? "Sending…" : "Send invite"}
                        </button>
                      </div>
                      {inviteResult[c.id] && (
                        <p
                          className={`text-[11px] mt-2 ${
                            inviteResult[c.id].startsWith("Invite sent") ||
                            inviteResult[c.id].startsWith("Link generated")
                              ? "text-success"
                              : "text-danger"
                          }`}
                        >
                          {inviteResult[c.id]}
                        </p>
                      )}
                    </div>

                    {/* Remove clinician */}
                    {canManageTeam && (
                      <div className="pt-2 border-t border-border/30">
                        {!isConfirmingDelete ? (
                          <button
                            onClick={() => setConfirmDeleteId(c.id)}
                            className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-danger transition-colors"
                          >
                            <Trash2 size={13} />
                            Remove {c.name.split(" ")[0]} from team
                          </button>
                        ) : (
                          <div className="flex items-center gap-3 p-3 rounded-xl border border-danger/20 bg-danger/5 animate-fade-in">
                            <p className="text-[12px] text-navy flex-1">
                              Remove <strong>{c.name}</strong> permanently?
                            </p>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-muted border border-border hover:bg-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                handleDeactivateClinician(c.id, c.name);
                                setConfirmDeleteId(null);
                                setExpandedClinicianId(null);
                              }}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:opacity-90"
                              style={{ background: "#DC2626" }}
                            >
                              Yes, remove
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
