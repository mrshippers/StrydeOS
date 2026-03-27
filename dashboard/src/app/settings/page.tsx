"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useClinicians } from "@/hooks/useClinicians";
import dynamic from "next/dynamic";
import PageHeader from "@/components/ui/PageHeader";

const MfaEnrollment = dynamic(
  () => import("@/components/MfaEnrollment").then((mod) => mod.MfaEnrollment),
  {
    loading: () => <div className="animate-pulse bg-navy/10 rounded-xl h-64" />,
    ssr: false,
  }
);
import { getInitials } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import Tooltip from "@/components/ui/Tooltip";
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
  Sparkles,
  RefreshCw,
  XCircle,
  Lock,
  Copy,
  FileText,
  Mail,
  ChevronRight,
  ChevronLeft,
  Upload,
  Shield,
  Info,
} from "lucide-react";
import type { ClinicProfile, PmsProvider, HepProvider } from "@/types";
import type { CanonicalField } from "@/lib/csv-import/types";
import { brand } from "@/lib/brand";
import SecurityCard from "./_components/SecurityCard";
import ClinicDetailsCard from "./_components/ClinicDetailsCard";
import TargetsCard from "./_components/TargetsCard";
import TeamManagementCard from "./_components/TeamManagementCard";

interface PmsProviderOption {
  id: PmsProvider;
  label: string;
  icon: string;
  logo?: string;
  comingSoon: boolean;
  csvBridge?: boolean;
  recentlyAdded?: boolean;
  hasApi?: boolean;
}

const CANONICAL_FIELD_OPTIONS: { value: string; label: string; required?: boolean }[] = [
  { value: "ignore", label: "Ignore" },
  { value: "date", label: "Date *", required: true },
  { value: "time", label: "Time" },
  { value: "endDate", label: "End Date" },
  { value: "endTime", label: "End Time" },
  { value: "patientId", label: "Patient ID" },
  { value: "patientFirst", label: "First Name" },
  { value: "patientLast", label: "Last Name" },
  { value: "patientEmail", label: "Email" },
  { value: "patientPhone", label: "Phone" },
  { value: "patientDob", label: "Date of Birth" },
  { value: "practitioner", label: "Practitioner *", required: true },
  { value: "practitionerId", label: "Practitioner ID" },
  { value: "type", label: "Appointment Type" },
  { value: "status", label: "Status *", required: true },
  { value: "notes", label: "Notes" },
  { value: "price", label: "Price" },
  { value: "duration", label: "Duration" },
];

const REQUIRED_APPT_FIELDS: CanonicalField[] = ["date", "practitioner", "status"];

interface ImportHistoryRecord {
  id: string;
  fileName: string;
  fileType: string;
  schemaId: string;
  provider: string;
  rowsWritten: number;
  rowsSkipped: number;
  importedAt: string;
  importedBy: string;
  warnings?: { type: string; message: string }[];
}

interface OnboardingGuide {
  title: string;
  steps: { heading: string; body?: string }[];
}

const ONBOARDING_PMS_OPTIONS = [
  { id: "writeupp", label: "WriteUpp", icon: "📋", logo: "/integrations/writeupp.svg" },
  { id: "cliniko", label: "Cliniko", icon: "🗂️", logo: "/integrations/cliniko.png" },
  { id: "tm3", label: "TM3", icon: "⚕️", logo: "/integrations/tm3.svg" },
  { id: "jane", label: "Jane App", icon: "🌿", logo: "/integrations/jane.png" },
  { id: "powerdiary", label: "Zanda (Power Diary)", icon: "📓", logo: "/integrations/powerdiary.png" },
  { id: "halaxy", label: "Halaxy", icon: "💙", logo: "/integrations/halaxy.svg" },
  { id: "other", label: "Other / Custom", icon: "📄" },
];

const INGEST_EMAIL_DOMAIN = "ingest.strydeos.com";

const PMS_PROVIDERS: PmsProviderOption[] = [
  { id: "writeupp", label: "WriteUpp", icon: "📋", logo: "/integrations/writeupp.svg", comingSoon: false, hasApi: false },
  { id: "cliniko", label: "Cliniko", icon: "🗂️", logo: "/integrations/cliniko.png", comingSoon: false, hasApi: true },
  { id: "tm3", label: "TM3", icon: "⚕️", logo: "/integrations/tm3.svg", comingSoon: false, csvBridge: true, hasApi: false },
  { id: "jane", label: "Jane App", icon: "🌿", logo: "/integrations/jane.png", comingSoon: true, hasApi: false },
  { id: "powerdiary", label: "Zanda (Power Diary)", icon: "📓", logo: "/integrations/powerdiary.png", comingSoon: false, recentlyAdded: true, hasApi: true },
  { id: "pabau", label: "Pabau", icon: "🏥", logo: "/integrations/pabau.svg", comingSoon: true, hasApi: false },
  { id: "halaxy", label: "Halaxy", icon: "💙", logo: "/integrations/halaxy.svg", comingSoon: false, recentlyAdded: true, hasApi: true },
  { id: "pps", label: "PPS (Rushcliff)", icon: "🩺", logo: "/integrations/pps.svg", comingSoon: true, hasApi: false },
];

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

function RetriggerTourButton() {
  const { user, refreshClinicProfile } = useAuth();
  const router = useRouter();
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
        setTimeout(() => router.push("/dashboard"), 800);
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
      setTimeout(() => router.push("/dashboard"), 800);
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
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-blue/30 text-blue bg-blue/5 hover:bg-blue/10 transition-all disabled:opacity-50"
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
      <p className="text-[11px] text-muted-strong mt-1.5">
        Resets your tour state and redirects to the dashboard so the welcome screen fires again.
      </p>
    </div>
  );
}

function fallbackTargets(cp: ClinicProfile | null) {
  return {
    followUpRate: cp?.targets?.followUpRate ?? 4.0,
    hepRate: cp?.targets?.hepRate ?? 80,
    utilisationRate: cp?.targets?.utilisationRate ?? 80,
  };
}

/* ─── Heidi Connection Card ───────────────────────────────────────────────── */
function HeidiConnectionCard() {
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

export default function SettingsPage() {
  const { user, firebaseUser, refreshClinicProfile } = useAuth();
  const { clinicians } = useClinicians();
  const { toast } = useToast();

  const router = useRouter();

  const cp = user?.clinicProfile ?? null;

  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [clinicName, setClinicName] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");
  const [clinicPhone, setClinicPhone] = useState("");
  const [sessionPrice, setSessionPrice] = useState("");
  const [parkingInfo, setParkingInfo] = useState("");
  const [clinicWebsite, setClinicWebsite] = useState("");
  const [timezone, setTimezone] = useState("Europe/London");
  const [followUpTarget, setFollowUpTarget] = useState("4.0");
  const [hepTarget, setHepTarget] = useState("80");
  const [utilisationTarget, setUtilisationTarget] = useState("80");
  const [saving, setSaving] = useState(false);

  const savedValues = useMemo(() => {
    if (!cp) return null;
    const t = fallbackTargets(cp);
    return {
      clinicName: cp.name ?? "",
      clinicAddress: cp.address ?? "",
      clinicPhone: cp.phone ?? "",
      sessionPrice: cp.sessionPricePence ? String(cp.sessionPricePence / 100) : "",
      parkingInfo: cp.parkingInfo ?? "",
      clinicWebsite: cp.website ?? "",
      timezone: cp.timezone ?? "Europe/London",
      followUpTarget: String(t.followUpRate),
      hepTarget: String(t.hepRate),
      utilisationTarget: String(t.utilisationRate),
    };
  }, [cp]);

  const isDirty = useMemo(() => {
    if (!savedValues) return false;
    return (
      clinicName !== savedValues.clinicName ||
      clinicAddress !== savedValues.clinicAddress ||
      clinicPhone !== savedValues.clinicPhone ||
      sessionPrice !== savedValues.sessionPrice ||
      parkingInfo !== savedValues.parkingInfo ||
      clinicWebsite !== savedValues.clinicWebsite ||
      timezone !== savedValues.timezone ||
      followUpTarget !== savedValues.followUpTarget ||
      hepTarget !== savedValues.hepTarget ||
      utilisationTarget !== savedValues.utilisationTarget
    );
  }, [clinicName, clinicAddress, clinicPhone, sessionPrice, parkingInfo, clinicWebsite, timezone, followUpTarget, hepTarget, utilisationTarget, savedValues]);

  const { showDialog, confirmLeave, cancelLeave } = useUnsavedChanges({ isDirty });

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

  // Column mapping state (Phase 2)
  const [mappingHeaders, setMappingHeaders] = useState<string[] | null>(null);
  const [mappingSampleRows, setMappingSampleRows] = useState<Record<string, string>[]>([]);
  const [mappingFile, setMappingFile] = useState<File | null>(null);
  const [mappingFileType, setMappingFileType] = useState<"appointments" | "patients">("appointments");
  const [mappingValues, setMappingValues] = useState<Record<string, string>>({});
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingSchemaName, setMappingSchemaName] = useState("");

  // Import history state (Phase 4)
  const [importHistory, setImportHistory] = useState<ImportHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Ingest email copy state (Phase 3)
  const [ingestCopied, setIngestCopied] = useState(false);

  // Onboarding wizard state (Phase 5)
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardPms, setWizardPms] = useState<string>("");
  const [wizardGuide, setWizardGuide] = useState<OnboardingGuide | null>(null);
  const [wizardGuideLoading, setWizardGuideLoading] = useState(false);
  const [tm3Platform, setTm3Platform] = useState<"cloud" | "desktop">("cloud");

  const [hepProvider, setHepProvider] = useState<string>("");
  const [hepApiKey, setHepApiKey] = useState("");
  const [hepConnected, setHepConnected] = useState(false);
  const [hepTesting, setHepTesting] = useState(false);

  const [addingClinician, setAddingClinician] = useState(false);
  const [submittingClinician, setSubmittingClinician] = useState(false);
  const [newClinicianName, setNewClinicianName] = useState("");
  const [newClinicianEmail, setNewClinicianEmail] = useState("");
  const [newClinicianRole, setNewClinicianRole] = useState("Physiotherapist");
  const [newClinicianAuthRole, setNewClinicianAuthRole] = useState<"clinician" | "admin">("clinician");

  // Clinician row expand/edit/delete state
  const [expandedClinicianId, setExpandedClinicianId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<Record<string, string>>({});
  const [sendingInvite, setSendingInvite] = useState<Record<string, boolean>>({});
  const [inviteResult, setInviteResult] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!cp) return;
    setClinicName(cp.name ?? "");
    setClinicAddress(cp.address ?? "");
    setClinicPhone(cp.phone ?? "");
    setSessionPrice(cp.sessionPricePence ? String(cp.sessionPricePence / 100) : "");
    setParkingInfo(cp.parkingInfo ?? "");
    setClinicWebsite(cp.website ?? "");
    setTimezone(cp.timezone ?? "Europe/London");
    const t = fallbackTargets(cp);
    setFollowUpTarget(String(t.followUpRate));
    setHepTarget(String(t.hepRate));
    setUtilisationTarget(String(t.utilisationRate));
    setPmsProvider(cp.pmsType ?? "");
    // Only treat PMS as connected if the flag is true AND there's evidence of
    // actual credentials — either a sync has run or the V2 stage reached
    // api_connected+.  This prevents a false "Connected" state when the user
    // skipped the PMS step during onboarding (which previously set the flag
    // without saving credentials).
    const pmsFlag = cp.onboarding?.pmsConnected ?? false;
    const pmsVerified =
      !!cp.pmsLastSyncAt ||
      ["api_connected", "first_value_reached", "activation_complete"].includes(
        cp.onboardingV2?.stage ?? ""
      );
    setPmsConnected(pmsFlag && pmsVerified);
    setHepProvider(cp.hepType ?? "");
    setHepConnected(!!cp.hepConnectedAt);
    // API keys are never read from server (stored in integrations_config only)
  }, [cp]);

  useEffect(() => {
    if (!user) return;
    setProfileFirstName(user.firstName ?? "");
    setProfileLastName(user.lastName ?? "");
  }, [user]);

  const clinicId = user?.clinicId;

  async function handleSaveUserProfile() {
    if (!firebaseUser?.uid || !db) return;
    const trimFirst = profileFirstName.trim();
    const trimLast = profileLastName.trim();
    if (!trimFirst || !trimLast) {
      toast("Please enter both your first and last name", "error");
      return;
    }
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, "users", firebaseUser.uid), {
        firstName: trimFirst,
        lastName: trimLast,
        updatedAt: new Date().toISOString(),
      });
      await refreshClinicProfile();
      toast("Profile updated", "success");
    } catch {
      toast("Failed to update profile", "error");
    } finally {
      setSavingProfile(false);
    }
  }

  const handleSaveProfile = useCallback(async () => {
    if (!clinicId || !db) {
      toast("Settings saved (demo mode)", "success");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "clinics", clinicId), {
        name: clinicName,
        address: clinicAddress || null,
        phone: clinicPhone || null,
        sessionPricePence: sessionPrice ? Math.round(parseFloat(sessionPrice) * 100) : null,
        parkingInfo: parkingInfo || null,
        website: clinicWebsite || null,
        timezone,
        targets: {
          followUpRate: parseFloat(followUpTarget),
          hepRate: parseFloat(hepTarget),
          utilisationRate: parseFloat(utilisationTarget),
        },
        // Mirror shared fields to ava.config so Ava receptionist page stays in sync
        "ava.config.phone": clinicPhone || null,
        "ava.config.address": clinicAddress || null,
        "ava.config.ia_price": sessionPrice || null,
        "ava.config.parking_info": parkingInfo || null,
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
  }, [clinicId, clinicName, clinicAddress, clinicPhone, sessionPrice, parkingInfo, clinicWebsite, timezone, followUpTarget, hepTarget, utilisationTarget, refreshClinicProfile, toast]);

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
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const testRes = await fetch(`${base}/api/pms/test-connection`, {
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

  async function handleImportCSV(file: File, fileType: "appointments" | "patients", schemaId?: string) {
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
      if (schemaId) form.append("schemaId", schemaId);
      const res = await fetch(`${base}/api/pms/import-csv`, {
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
        const initial: Record<string, string> = {};
        for (const h of data.headers ?? []) initial[h] = "ignore";
        setMappingValues(initial);
        setMappingSchemaName("");
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
    setMappingValues({});
    setMappingSchemaName("");
  }

  async function handleSaveMapping() {
    if (!firebaseUser || !mappingFile || !mappingHeaders) return;

    const fieldMap: Record<string, string> = {};
    for (const [header, value] of Object.entries(mappingValues)) {
      if (value !== "ignore") fieldMap[header] = value;
    }

    const mapped = new Set(Object.values(fieldMap));
    const missingRequired = REQUIRED_APPT_FIELDS.filter((f) => !mapped.has(f));
    if (mappingFileType === "appointments" && missingRequired.length > 0) {
      toast(`Required fields not mapped: ${missingRequired.join(", ")}`, "error");
      return;
    }

    setMappingSaving(true);
    try {
      const token = await firebaseUser.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";

      const schemaRes = await fetch(`${base}/api/pms/csv-schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: mappingSchemaName.trim() || undefined,
          fileType: mappingFileType,
          fieldMap,
        }),
      });
      const schemaData = await schemaRes.json().catch(() => ({}));
      if (!schemaRes.ok) throw new Error(schemaData?.error ?? "Failed to save mapping");

      await handleImportCSV(mappingFile, mappingFileType, schemaData.schemaId);
      cancelMapping();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save mapping";
      toast(msg, "error");
    } finally {
      setMappingSaving(false);
    }
  }

  async function loadImportHistory() {
    if (!firebaseUser) return;
    setHistoryLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/pms/import-history?limit=20`, {
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

  async function copyIngestEmail() {
    if (!clinicId) return;
    const email = `import-${clinicId}@${INGEST_EMAIL_DOMAIN}`;
    await navigator.clipboard.writeText(email);
    setIngestCopied(true);
    toast("Import email copied", "success");
    setTimeout(() => setIngestCopied(false), 2000);
  }

  async function loadOnboardingGuide(pmsId: string) {
    setWizardGuideLoading(true);
    setWizardGuide(null);

    // TM3 has no API — hardcoded guide, no Firestore lookup
    if (pmsId === "tm3") {
      setWizardGuide(null); // handled inline by TM3-specific wizard UI
      setWizardGuideLoading(false);
      return;
    }

    try {
      const { getDoc, doc: firestoreDoc } = await import("firebase/firestore");
      if (!db) return;
      const snap = await getDoc(firestoreDoc(db, "onboarding_guides", pmsId));
      if (snap.exists()) {
        setWizardGuide(snap.data() as OnboardingGuide);
      } else {
        setWizardGuide({
          title: `${ONBOARDING_PMS_OPTIONS.find((p) => p.id === pmsId)?.label ?? "Your PMS"} Export Guide`,
          steps: [
            { heading: "Export your data", body: "Look for a Data Export, Reports, or CSV Export option in your PMS. Export your Appointments data as a CSV file." },
            { heading: "Upload to StrydeOS", body: "Drag and drop the exported CSV into the upload zone below." },
          ],
        });
      }
    } catch {
      setWizardGuide({
        title: "Export Guide",
        steps: [{ heading: "Export your data as CSV from your PMS and upload it below." }],
      });
    } finally {
      setWizardGuideLoading(false);
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
      await refreshClinicProfile();
      toast("HEP platform connected and key saved securely", "success");
    } catch {
      toast("Connection failed. Check your API key and try again.", "error");
    } finally {
      setHepTesting(false);
    }
  }

  async function handleAddClinician() {
    if (!newClinicianName.trim() || !newClinicianEmail.trim() || submittingClinician) return;
    if (!clinicId || !db || !firebaseUser) {
      toast("Clinician added (demo mode)", "success");
      setAddingClinician(false);
      setNewClinicianName("");
      setNewClinicianEmail("");
      return;
    }
    setSubmittingClinician(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/clinicians/add", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newClinicianName.trim(),
          email: newClinicianEmail.trim(),
          role: newClinicianRole,
          authRole: newClinicianAuthRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = res.status === 403 && data.currentCount != null
          ? `${data.error} (${data.currentCount}/${data.limit} seats used)`
          : data.error ?? "Failed to add clinician";
        toast(msg, "error");
        return;
      }
      const inviteNote = data.emailSent
        ? ` — invite sent to ${newClinicianEmail.trim()}`
        : " — invite link generated (configure RESEND_API_KEY to send emails)";
      toast(`${newClinicianName.trim()} added${inviteNote}`, "success");
      setAddingClinician(false);
      setNewClinicianName("");
      setNewClinicianEmail("");
      setNewClinicianAuthRole("clinician");

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
    } finally {
      setSubmittingClinician(false);
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
    if (!onboarding.targetsSet && savedValues) {
      const targetsModified =
        followUpTarget !== savedValues.followUpTarget ||
        hepTarget !== savedValues.hepTarget ||
        utilisationTarget !== savedValues.utilisationTarget;
      if (targetsModified) {
        await markTargetsSet();
      }
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Settings" subtitle={canManageTeam ? "Manage your clinic configuration, targets, and team" : "Manage your account"} />

      {/* Retrigger tour */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-4">
        <RetriggerTourButton />
      </div>

      {/* Your Profile */}
      <div id="profile-section" className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <h3 className="font-display text-lg text-navy mb-1">Your Profile</h3>
        <p className="text-xs text-muted mb-4">How your name appears across StrydeOS</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-navy/60 uppercase tracking-wider mb-1.5">First name</label>
            <input
              type="text"
              value={profileFirstName}
              onChange={(e) => setProfileFirstName(e.target.value)}
              placeholder="First name"
              className="w-full px-3 py-2 rounded-xl border border-border text-sm text-navy focus:border-blue focus:ring-1 focus:ring-blue/20 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-navy/60 uppercase tracking-wider mb-1.5">Last name</label>
            <input
              type="text"
              value={profileLastName}
              onChange={(e) => setProfileLastName(e.target.value)}
              placeholder="Last name"
              className="w-full px-3 py-2 rounded-xl border border-border text-sm text-navy focus:border-blue focus:ring-1 focus:ring-blue/20 outline-none transition-colors"
            />
          </div>
        </div>
        {(profileFirstName !== (user?.firstName ?? "") || profileLastName !== (user?.lastName ?? "")) && (
          <div className="flex justify-end mt-4">
            <button
              onClick={handleSaveUserProfile}
              disabled={savingProfile}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: brand.blue }}
            >
              {savingProfile ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save profile
            </button>
          </div>
        )}
      </div>

      {/* Security: Password + MFA */}
      <SecurityCard />

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
                  style={{ background: brand.danger }}
                >
                  Discard & leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Checklist — owner/admin only */}
      {canManageTeam && showOnboarding && (
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
                  <Circle size={18} className="text-muted/70 shrink-0" />
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

      {canManageTeam && (<>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClinicDetailsCard
          clinicName={clinicName} setClinicName={setClinicName}
          clinicAddress={clinicAddress} setClinicAddress={setClinicAddress}
          clinicPhone={clinicPhone} setClinicPhone={setClinicPhone}
          sessionPrice={sessionPrice} setSessionPrice={setSessionPrice}
          clinicWebsite={clinicWebsite} setClinicWebsite={setClinicWebsite}
          parkingInfo={parkingInfo} setParkingInfo={setParkingInfo}
          timezone={timezone} setTimezone={setTimezone}
        />
        <TargetsCard
          followUpTarget={followUpTarget} setFollowUpTarget={setFollowUpTarget}
          hepTarget={hepTarget} setHepTarget={setHepTarget}
          utilisationTarget={utilisationTarget} setUtilisationTarget={setUtilisationTarget}
        />
      </div>

      {/* Save button — saves clinic details + KPI targets together */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveWithOnboarding}
          disabled={saving || !isDirty}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
          style={{ background: brand.blue }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
      </>)}

      {/* ─── Owner/Admin-only sections ────────────────────────────── */}
      {canManageTeam && (<>

      {/* PMS Connection */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg text-navy">PMS Connection</h3>
          {!pmsConnected && (
            <button
              onClick={() => setImportPanelOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                importPanelOpen
                  ? "text-white bg-blue"
                  : "text-blue border border-blue/20 hover:bg-blue/5"
              }`}
            >
              <Upload size={12} />
              Import
            </button>
          )}
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
                      <img src={p.logo} alt={p.label} className="h-7 w-auto max-w-[68px] object-contain" />
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

            {/* TM3 CSV Bridge — active connection card */}
            {pmsProvider && PMS_PROVIDERS.find((p) => p.id === pmsProvider)?.csvBridge && (
              <div className="p-4 rounded-xl border border-navy/15 bg-navy/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: (() => {
                      const lastImport = importHistory.find((r) => r.provider === "TM3");
                      if (!lastImport) return "#9CA3AF";
                      const hours = (Date.now() - new Date(lastImport.importedAt).getTime()) / 3600000;
                      return hours < 24 ? "#059669" : hours < 168 ? "#D97706" : "#DC2626";
                    })() }} />
                    <p className="text-sm font-semibold text-navy">TM3 CSV Bridge</p>
                  </div>
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-navy/10 text-navy uppercase">Active</span>
                </div>
                {(() => {
                  const lastImport = importHistory.find((r) => r.provider === "TM3");
                  if (lastImport) {
                    const d = new Date(lastImport.importedAt);
                    return (
                      <p className="text-[12px] text-muted mb-3">
                        Last import: <strong className="text-navy">{d.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</strong> &middot; {lastImport.rowsWritten} appointments
                      </p>
                    );
                  }
                  return <p className="text-[12px] text-muted mb-3">No data imported yet. Upload your first TM3 CSV or set up auto-import below.</p>;
                })()}
                {clinicId && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-white">
                    <Mail size={12} className="text-blue shrink-0" />
                    <code className="text-[11px] text-navy flex-1 break-all">import-{clinicId}@{INGEST_EMAIL_DOMAIN}</code>
                    <button onClick={copyIngestEmail} className="shrink-0 text-blue hover:text-blue-bright transition-colors">
                      {ingestCopied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => setImportPanelOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors"
                  >
                    <Upload size={11} /> Upload CSV
                  </button>
                  <button
                    onClick={() => { setImportPanelOpen(true); setWizardOpen(true); setWizardPms("tm3"); setWizardStep(4); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-navy/70 hover:text-navy transition-colors"
                  >
                    Set up auto-import &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── CSV Import Panel (collapsible, inside PMS card) ───────── */}
        <AnimatePresence>
          {importPanelOpen && (
            <motion.div
              id="csv-import-section"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="p-5 rounded-xl border border-blue/15 bg-blue/[0.02]">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-navy">Import from CSV</h4>
                    <Tooltip content="Export your appointment or patient data from your PMS as a CSV file, then upload it here. StrydeOS auto-detects the format from WriteUpp, Cliniko, TM3, Jane App, and custom layouts. Uploading again merges — it won't create duplicates." side="bottom">
                      <Info size={13} className="text-muted/60 hover:text-muted cursor-help transition-colors" />
                    </Tooltip>
                  </div>
                  <div className="flex items-center gap-2">
                    {!wizardOpen && (
                      <button
                        onClick={() => { setWizardOpen(true); setWizardStep(0); setWizardPms(""); }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-white bg-blue hover:bg-blue-bright shadow-sm hover:shadow-md transition-all"
                      >
                        <Sparkles size={12} />
                        Setup wizard
                      </button>
                    )}
                    <button
                      onClick={() => setImportPanelOpen(false)}
                      className="text-muted hover:text-navy transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

        {/* ── Onboarding Wizard (Phase 5) ─────────────────────────────── */}
        {wizardOpen && (
          <div className="mt-4 mb-5 p-5 rounded-xl border border-blue/20 bg-blue/5 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-navy">
                Step {wizardStep + 1} of 5 — Data Import Setup
              </p>
              <button onClick={() => setWizardOpen(false)} className="text-muted hover:text-navy transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Step 0: Select PMS */}
            {wizardStep === 0 && (
              <div>
                <p className="text-sm font-medium text-navy mb-3">Which PMS do you use?</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ONBOARDING_PMS_OPTIONS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setWizardPms(p.id); loadOnboardingGuide(p.id); setWizardStep(1); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        wizardPms === p.id ? "border-blue bg-blue/10 text-blue" : "border-border hover:border-blue/30 text-navy"
                      }`}
                    >
                      {p.logo ? (
                        <img src={p.logo} alt="" className="h-5 w-auto max-w-[52px] object-contain shrink-0" />
                      ) : (
                        <span className="shrink-0">{p.icon}</span>
                      )}
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1: PMS-specific guide */}
            {wizardStep === 1 && (
              <div>
                {wizardPms === "tm3" ? (
                  <div>
                    <p className="text-sm font-medium text-navy mb-3">Export appointments from TM3</p>
                    <div className="flex gap-1 mb-4">
                      {(["cloud", "desktop"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setTm3Platform(p)}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                            tm3Platform === p ? "bg-navy text-white" : "bg-cloud-light text-muted hover:text-navy"
                          }`}
                        >
                          TM3 {p === "cloud" ? "Cloud" : "Desktop"}
                        </button>
                      ))}
                    </div>
                    <ol className="space-y-3">
                      {(tm3Platform === "cloud" ? [
                        { heading: "Go to Reports", body: "In TM3 Cloud, navigate to Reports and select Appointment Report." },
                        { heading: "Set your date range", body: "For your first import, select the last 90 days. For recurring imports, the last 7 days." },
                        { heading: "Select columns", body: "Include: Therapist, Date, Time, End Time, Type, Status, Client Ref, Amount, Forename, Surname." },
                        { heading: "Export as CSV", body: "Click Export and save the file. You\u2019ll upload it in the next step." },
                      ] : [
                        { heading: "Open Reports", body: "In TM3 Desktop, go to Reports and select Diary Export or Appointment Report." },
                        { heading: "Set your date range", body: "For your first import, cover the last 90 days. For recurring, the last 7 days." },
                        { heading: "Select all appointment columns", body: "Ensure Therapist, Date, Time, Type, Status, Client Ref, and Amount are included." },
                        { heading: "Export to CSV", body: "Save the exported file. You\u2019ll upload it in the next step." },
                      ]).map((step, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-navy/10 text-navy text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-navy">{step.heading}</p>
                            <p className="text-[12px] text-muted mt-0.5">{step.body}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : wizardGuideLoading ? (
                  <div className="flex items-center gap-2 text-muted text-sm py-4">
                    <Loader2 size={14} className="animate-spin" /> Loading guide...
                  </div>
                ) : wizardGuide ? (
                  <div>
                    <p className="text-sm font-medium text-navy mb-3">{wizardGuide.title}</p>
                    <ol className="space-y-3">
                      {wizardGuide.steps.map((step, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-blue/10 text-blue text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-navy">{step.heading}</p>
                            {step.body && <p className="text-[12px] text-muted mt-0.5">{step.body}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                <div className="flex items-center gap-2 mt-4">
                  <button onClick={() => setWizardStep(0)} className="flex items-center gap-1 text-[12px] text-muted hover:text-navy transition-colors">
                    <ChevronLeft size={14} /> Back
                  </button>
                  <button
                    onClick={() => setWizardStep(2)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white transition-all hover:opacity-90"
                    style={{ background: brand.blue }}
                  >
                    I have my CSV <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Upload (uses existing drag-drop below) */}
            {wizardStep === 2 && (
              <div>
                <p className="text-sm font-medium text-navy mb-2">Upload your CSV file below</p>
                <p className="text-[12px] text-muted mb-3">Drag and drop your exported CSV into one of the upload zones. StrydeOS will auto-detect the format.</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setWizardStep(1)} className="flex items-center gap-1 text-[12px] text-muted hover:text-navy transition-colors">
                    <ChevronLeft size={14} /> Back
                  </button>
                  <span className="text-[11px] text-muted">Upload a file below to continue</span>
                </div>
              </div>
            )}

            {/* Step 3: Confirm mapping */}
            {wizardStep === 3 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={16} className="text-success" />
                  <p className="text-sm font-medium text-navy">
                    {csvResult?.ok ? "Import complete" : mappingHeaders ? "Manual mapping required" : "Upload your CSV above"}
                  </p>
                </div>
                {csvResult?.ok && (
                  <p className="text-[12px] text-muted mb-3">{csvResult.msg}</p>
                )}
                <div className="flex items-center gap-2">
                  <button onClick={() => setWizardStep(2)} className="flex items-center gap-1 text-[12px] text-muted hover:text-navy transition-colors">
                    <ChevronLeft size={14} /> Back
                  </button>
                  {csvResult?.ok && (
                    <button
                      onClick={() => setWizardStep(4)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white transition-all hover:opacity-90"
                      style={{ background: brand.blue }}
                    >
                      Next: recurring <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Set up recurring */}
            {wizardStep === 4 && (
              <div>
                <p className="text-sm font-medium text-navy mb-2">Set up recurring imports</p>
                {wizardPms === "tm3" ? (
                  <div className="text-[12px] text-muted mb-3 space-y-2">
                    <p>TM3 Cloud supports <strong className="text-navy">Scheduled Reports</strong>. Set one up to email your appointment CSV weekly to the address below — then StrydeOS imports automatically. Zero ongoing effort.</p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px]">
                      <li>In TM3 Cloud, go to <strong className="text-navy">Reports &rarr; Scheduled Reports</strong></li>
                      <li>Create a new schedule for the Appointment Report</li>
                      <li>Set frequency to <strong className="text-navy">weekly</strong> (e.g. every Monday)</li>
                      <li>Set the email recipient to your ingest address below</li>
                    </ol>
                  </div>
                ) : (
                  <p className="text-[12px] text-muted mb-3">
                    For hands-free data import, point your PMS email export to your clinic&apos;s unique ingest address. Every CSV attachment sent here is imported automatically.
                  </p>
                )}
                {clinicId && (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-cloud-light">
                    <Mail size={14} className="text-blue shrink-0" />
                    <code className="text-[12px] text-navy flex-1 break-all">import-{clinicId}@{INGEST_EMAIL_DOMAIN}</code>
                    <button onClick={copyIngestEmail} className="shrink-0 text-blue hover:text-blue-bright transition-colors">
                      {ingestCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-4">
                  <button onClick={() => setWizardStep(3)} className="flex items-center gap-1 text-[12px] text-muted hover:text-navy transition-colors">
                    <ChevronLeft size={14} /> Back
                  </button>
                  <button
                    onClick={() => { setWizardOpen(false); toast("Setup complete", "success"); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white transition-all hover:opacity-90"
                    style={{ background: brand.success }}
                  >
                    <Check size={14} /> Done
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-[12px] text-muted mb-5">
          Export your appointment or patient data from any PMS as CSV and drop it here. Format is auto-detected. Data populates instantly.
        </p>

        {/* ── Column Mapping Screen (Phase 2) ──────────────────────────── */}
        {mappingHeaders && mappingHeaders.length > 0 ? (
          <div className="animate-fade-in">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-navy">Map your CSV columns</p>
                <p className="text-[11px] text-muted mt-0.5">
                  We couldn&apos;t auto-detect the format. Map each column to a StrydeOS field. Fields marked * are required for appointments.
                </p>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                Mapping name (optional)
              </label>
              <input
                type="text"
                value={mappingSchemaName}
                onChange={(e) => setMappingSchemaName(e.target.value)}
                placeholder="e.g. My PMS Export"
                className="w-full max-w-xs px-3 py-2 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
              />
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto rounded-xl border border-border mb-4">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-cloud-light">
                    {mappingHeaders.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-navy whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappingSampleRows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {mappingHeaders.map((h) => (
                        <td key={h} className="px-3 py-1.5 text-muted whitespace-nowrap max-w-[200px] truncate">
                          {row[h] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              {mappingHeaders.map((h) => (
                <div key={h}>
                  <label className="block text-[11px] font-medium text-muted mb-1 truncate" title={h}>
                    {h}
                  </label>
                  <select
                    value={mappingValues[h] ?? "ignore"}
                    onChange={(e) => setMappingValues((prev) => ({ ...prev, [h]: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
                  >
                    {CANONICAL_FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveMapping}
                disabled={mappingSaving}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: brand.blue }}
              >
                {mappingSaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {mappingSaving ? "Saving..." : "Save mapping & import"}
              </button>
              <button
                onClick={cancelMapping}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold text-muted hover:text-navy transition-colors"
              >
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Standard drag-drop upload */}
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
                      if (f) {
                        handleImportCSV(f, type);
                        if (wizardOpen && wizardStep === 2) setWizardStep(3);
                      }
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
          </>
        )}

        {/* ── Email Ingest Address (Phase 3) ────────────────────────────── */}
        {clinicId && !wizardOpen && (
          <div className="mt-5 p-4 rounded-xl border border-border bg-cloud-light/50">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue/10 flex items-center justify-center shrink-0">
                <Mail size={14} className="text-blue" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-xs font-semibold text-navy">Email-to-Import</p>
                  <Tooltip content="Your clinic has a unique email address. Any CSV file sent as an attachment to this address is automatically imported into StrydeOS — no manual upload needed. Set your PMS to email scheduled reports here for hands-free data sync." side="bottom">
                    <Info size={11} className="text-muted/60 hover:text-muted cursor-help transition-colors" />
                  </Tooltip>
                </div>
                <p className="text-[11px] text-muted mb-2">
                  Forward PMS exports or set up scheduled email delivery to this address. CSV attachments are imported automatically.
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-[11px] text-navy bg-white px-2 py-1 rounded border border-border break-all">
                    import-{clinicId}@{INGEST_EMAIL_DOMAIN}
                  </code>
                  <button
                    onClick={copyIngestEmail}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-blue border border-blue/20 hover:bg-blue/5 transition-colors"
                  >
                    {ingestCopied ? <Check size={12} /> : <Copy size={12} />}
                    {ingestCopied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted mt-4">
          Supports WriteUpp, Cliniko, TM3, Jane App, and custom formats.
          Uploading again merges — it won&apos;t create duplicates.
        </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Import History (Phase 4) */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg text-navy">Import History</h3>
          <button
            onClick={loadImportHistory}
            disabled={historyLoading}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted hover:text-navy transition-colors"
          >
            <RefreshCw size={12} className={historyLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {importHistory.length === 0 ? (
          <div className="text-center py-8">
            <FileText size={24} className="mx-auto text-muted/70 mb-2" />
            <p className="text-sm text-muted">{historyLoaded ? "No imports yet" : "Loading..."}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {importHistory.map((rec) => (
              <div key={rec.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:bg-cloud-light/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={14} className="text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy truncate">{rec.fileName}</p>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue/10 text-blue uppercase shrink-0">
                      {rec.provider || rec.schemaId}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">
                    {rec.rowsWritten} written · {rec.rowsSkipped} skipped
                    {rec.fileType === "appointments" && " · Metrics recomputed"}
                    {rec.warnings && rec.warnings.length > 0 && ` · ${rec.warnings.length} warning(s)`}
                  </p>
                </div>
                <p className="text-[10px] text-muted shrink-0">
                  {new Date(rec.importedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HEP Integration */}
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

      {/* Compatible Data Sources */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <h3 className="font-display text-lg text-navy mb-1">Compatible Data Sources</h3>
        <p className="text-xs text-muted mb-5">
          These tools enrich StrydeOS Intelligence with clinical data. They are not PMS integrations — they layer additional signals into your analytics.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Heidi */}
          <HeidiConnectionCard />

          {/* TM3 — elevated from PMS list */}
          <div className="rounded-xl border border-warn/30 bg-warn/5 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-warn/20 flex items-center justify-center shrink-0 p-1.5">
                <img src="/integrations/tm3.svg" alt="TM3" className="w-full h-full object-contain" />
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
                <a
                  href="mailto:hello@strydeos.com?subject=TM3%20Integration%20Waitlist&body=Hi%20StrydeOS%20team%2C%0A%0AI%27d%20like%20to%20join%20the%20waitlist%20for%20the%20TM3%20integration.%0A%0AClinic%20name%3A%20%0ATMS%20version%3A%20Cloud%20%2F%20Desktop%0A%0AThanks"
                  className="text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors"
                >
                  Join the waitlist →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clinic Management */}
      <TeamManagementCard
        clinicProfile={cp}
        clinicians={clinicians}
        canManageTeam={canManageTeam}
        showOnboarding={showOnboarding}
        onboarding={onboarding}
        addingClinician={addingClinician}
        setAddingClinician={setAddingClinician}
        newClinicianName={newClinicianName}
        setNewClinicianName={setNewClinicianName}
        newClinicianEmail={newClinicianEmail}
        setNewClinicianEmail={setNewClinicianEmail}
        newClinicianRole={newClinicianRole}
        setNewClinicianRole={setNewClinicianRole}
        newClinicianAuthRole={newClinicianAuthRole}
        setNewClinicianAuthRole={setNewClinicianAuthRole}
        submittingClinician={submittingClinician}
        expandedClinicianId={expandedClinicianId}
        setExpandedClinicianId={setExpandedClinicianId}
        confirmDeleteId={confirmDeleteId}
        setConfirmDeleteId={setConfirmDeleteId}
        editingEmail={editingEmail}
        setEditingEmail={setEditingEmail}
        sendingInvite={sendingInvite}
        inviteResult={inviteResult}
        setInviteResult={setInviteResult}
        handleAddClinician={handleAddClinician}
        handleDeactivateClinician={handleDeactivateClinician}
        handleConfirmTeam={handleConfirmTeam}
        handleSendInvite={handleSendInvite}
      />

      </>)}
      {/* ─── End owner/admin-only sections ──────────────────────────── */}
    </div>
  );
}
