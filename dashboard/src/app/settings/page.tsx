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
} from "lucide-react";
import type { ClinicProfile } from "@/types";

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

  const [addingClinician, setAddingClinician] = useState(false);
  const [newClinicianName, setNewClinicianName] = useState("");
  const [newClinicianRole, setNewClinicianRole] = useState("Physiotherapist");

  useEffect(() => {
    if (!cp) return;
    setClinicName(cp.name ?? "");
    setTimezone(cp.timezone ?? "Europe/London");
    const t = fallbackTargets(cp);
    setFollowUpTarget(String(t.followUpRate));
    setPhysitrackTarget(String(t.physitrackRate));
    setUtilisationTarget(String(t.utilisationRate));
    setPmsProvider(cp.pmsType === "writeupp" || cp.pmsType === "cliniko" ? cp.pmsType : "");
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
        toast(testData.error ?? "Connection failed. Check your API key.", "error");
        setPmsTesting(false);
        return;
      }
      const saveRes = await fetch(`${base}/api/pms/save-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: pmsProvider, apiKey: pmsApiKey.trim() }),
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
      if (!res.ok) throw new Error("Disconnect failed");
      setPmsConnected(false);
      setPmsApiKey("");
      setPmsProvider("");
      await refreshClinicProfile();
      toast("PMS disconnected", "success");
    } catch {
      toast("Failed to disconnect", "error");
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
          <div className="flex items-center gap-4 p-4 rounded-xl border border-success/20 bg-success/5">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
              <Link2 size={18} className="text-success" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-navy">
                {pmsProvider === "writeupp" ? "WriteUpp" : pmsProvider === "cliniko" ? "Cliniko" : "PMS"} — Connected
              </p>
              <p className="text-[11px] text-muted">
                {cp?.pmsLastSyncAt
                  ? `Last synced ${new Date(cp.pmsLastSyncAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                  : "Awaiting first sync"}
              </p>
            </div>
            <button
              onClick={handleDisconnectPms}
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
                PMS Provider
              </label>
              <div className="flex gap-3">
                {(["writeupp", "cliniko"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPmsProvider(p)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                      pmsProvider === p
                        ? "border-blue bg-blue/5 text-blue"
                        : "border-border hover:border-blue/30 text-navy"
                    }`}
                  >
                    {p === "writeupp" ? "📋" : "🗂️"}
                    {p === "writeupp" ? "WriteUpp" : "Cliniko"}
                    {pmsProvider === p && <Check size={14} />}
                  </button>
                ))}
              </div>
            </div>

            {pmsProvider && (
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  API Key
                </label>
                <input
                  type="password"
                  value={pmsApiKey}
                  onChange={(e) => setPmsApiKey(e.target.value)}
                  placeholder={`Enter your ${pmsProvider === "writeupp" ? "WriteUpp" : "Cliniko"} API key`}
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
          </div>
        )}
      </div>

      {/* Clinician Management */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg text-navy">Clinician Management</h3>
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
            <button
              onClick={() => setAddingClinician(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors"
            >
              <Plus size={12} />
              Add Clinician
            </button>
          </div>
        </div>

        {addingClinician && (
          <div className="mb-4 p-4 rounded-xl border border-blue/20 bg-blue/5 animate-fade-in">
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

        <div className="space-y-2">
          {clinicians.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 hover:bg-cloud-light/50 transition-colors group"
            >
              <div className="w-9 h-9 rounded-full bg-navy flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {getInitials(c.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-navy">{c.name}</p>
                <p className="text-[11px] text-muted">{c.role}</p>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  c.active
                    ? "bg-success/10 text-success"
                    : "bg-muted/10 text-muted"
                }`}
              >
                {c.active ? "Active" : "Inactive"}
              </span>
              <button
                onClick={() => handleDeactivateClinician(c.id, c.name)}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-danger/10 text-muted hover:text-danger transition-all"
                title={`Remove ${c.name}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
