"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  doc,
  updateDoc,
  collection,
  addDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useClinicians } from "@/hooks/useClinicians";
import PageHeader from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import Tooltip from "@/components/ui/Tooltip";
import { normalizeApiError } from "@/lib/api-errors";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Loader2,
  Save,
} from "lucide-react";
import type { ClinicProfile } from "@/types";
import { brand } from "@/lib/brand";
import SecurityCard from "./_components/SecurityCard";
import ProfileCard from "./_components/ProfileCard";
import ClinicDetailsCard from "./_components/ClinicDetailsCard";
import TargetsCard from "./_components/TargetsCard";
import TeamManagementCard from "./_components/TeamManagementCard";
import GoogleReviewsCard from "./_components/GoogleReviewsCard";
import HepIntegrationCard from "./_components/HepIntegrationCard";
import OnboardingChecklist from "./_components/OnboardingChecklist";
import PmsIntegrationCard from "./_components/PmsIntegrationCard";
import SeatLimitModal, {
  type SeatLimitInfo,
  type SeatLimitPending,
} from "./_components/SeatLimitModal";
import RetriggerTourButton from "./_components/RetriggerTourButton";
import HeidiConnectionCard from "./_components/HeidiConnectionCard";

function fallbackTargets(cp: ClinicProfile | null) {
  return {
    followUpRate: cp?.targets?.followUpRate ?? 4.0,
    hepRate: cp?.targets?.hepRate ?? 80,
    utilisationRate: cp?.targets?.utilisationRate ?? 80,
  };
}

export default function SettingsPage() {
  const { user, firebaseUser, refreshClinicProfile } = useAuth();
  const { clinicians } = useClinicians();
  const { toast } = useToast();

  const cp = user?.clinicProfile ?? null;


  // Clinic-level Heidi integration status — gates the per-clinician opt-in
  // toggle in Clinic Management. Subscribes separately so it stays live when
  // the user connects Heidi in the Integrations section on the same page.
  const [clinicHeidiConnected, setClinicHeidiConnected] = useState(false);
  useEffect(() => {
    if (!user?.clinicId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getDoc, doc: fbDoc } = await import("firebase/firestore");
        const { db: clientDb } = await import("@/lib/firebase");
        if (!clientDb) return;
        const snap = await getDoc(
          fbDoc(clientDb, "clinics", user.clinicId, "integrations_config", "heidi"),
        );
        if (cancelled) return;
        const data = snap.exists() ? snap.data() : null;
        setClinicHeidiConnected(!!data?.enabled && !!data?.apiKey);
      } catch {
        if (!cancelled) setClinicHeidiConnected(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.clinicId]);

  const [clinicName, setClinicName] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");
  const [clinicPhone, setClinicPhone] = useState("");
  const [receptionPhone, setReceptionPhone] = useState("");
  const [sessionPrice, setSessionPrice] = useState("");
  const [parkingInfo, setParkingInfo] = useState("");
  const [clinicWebsite, setClinicWebsite] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
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
      receptionPhone: cp.receptionPhone ?? "",
      sessionPrice: cp.sessionPricePence ? String(cp.sessionPricePence / 100) : "",
      parkingInfo: cp.parkingInfo ?? "",
      clinicWebsite: cp.website ?? "",
      bookingUrl: cp.bookingUrl ?? "",
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
      receptionPhone !== savedValues.receptionPhone ||
      sessionPrice !== savedValues.sessionPrice ||
      parkingInfo !== savedValues.parkingInfo ||
      clinicWebsite !== savedValues.clinicWebsite ||
      bookingUrl !== savedValues.bookingUrl ||
      timezone !== savedValues.timezone ||
      followUpTarget !== savedValues.followUpTarget ||
      hepTarget !== savedValues.hepTarget ||
      utilisationTarget !== savedValues.utilisationTarget
    );
  }, [clinicName, clinicAddress, clinicPhone, receptionPhone, sessionPrice, parkingInfo, clinicWebsite, bookingUrl, timezone, followUpTarget, hepTarget, utilisationTarget, savedValues]);

  const { showDialog, confirmLeave, cancelLeave } = useUnsavedChanges({ isDirty });

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

  // Seat-limit upgrade modal (shown when /api/clinicians/add returns 403 for seat cap)
  const [seatModalOpen, setSeatModalOpen] = useState(false);
  const [seatLimitInfo, setSeatLimitInfo] = useState<SeatLimitInfo | null>(null);
  const [seatLimitPending, setSeatLimitPending] = useState<SeatLimitPending | null>(null);

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
    setReceptionPhone(cp.receptionPhone ?? "");
    setSessionPrice(cp.sessionPricePence ? String(cp.sessionPricePence / 100) : "");
    setParkingInfo(cp.parkingInfo ?? "");
    setClinicWebsite(cp.website ?? "");
    setBookingUrl(cp.bookingUrl ?? "");
    setTimezone(cp.timezone ?? "Europe/London");
    const t = fallbackTargets(cp);
    setFollowUpTarget(String(t.followUpRate));
    setHepTarget(String(t.hepRate));
    setUtilisationTarget(String(t.utilisationRate));
    setHepProvider(cp.hepType ?? "");
    setHepConnected(!!cp.hepConnectedAt);
    // API keys are never read from server (stored in integrations_config only)
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
        address: clinicAddress || null,
        phone: clinicPhone || null,
        receptionPhone: receptionPhone || null,
        sessionPricePence: sessionPrice ? Math.round(parseFloat(sessionPrice) * 100) : null,
        parkingInfo: parkingInfo || null,
        website: clinicWebsite || null,
        bookingUrl: bookingUrl || null,
        timezone,
        // Dot-notation so updateDoc merges into targets (preserves weeklyCapacitySlots etc.)
        "targets.followUpRate": parseFloat(followUpTarget),
        "targets.hepRate": parseFloat(hepTarget),
        "targets.utilisationRate": parseFloat(utilisationTarget),
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
  }, [clinicId, clinicName, clinicAddress, clinicPhone, receptionPhone, sessionPrice, parkingInfo, clinicWebsite, bookingUrl, timezone, followUpTarget, hepTarget, utilisationTarget, refreshClinicProfile, toast]);

  async function submitAddClinician(): Promise<{
    ok: boolean;
    seatLimitReached?: boolean;
    seatInfo?: SeatLimitInfo;
    error?: string;
    emailSent?: boolean;
  }> {
    if (!clinicId || !db || !firebaseUser) {
      return { ok: false, error: "Not signed in" };
    }
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
    const data = await res.json().catch(() => ({}));

    if (res.status === 403 && data?.seatLimitReached) {
      return {
        ok: false,
        seatLimitReached: true,
        seatInfo: {
          currentCount: data.currentCount,
          limit: data.limit,
          tierLimit: data.tierLimit,
          extraSeats: data.extraSeats,
          canPurchaseSeat: data.canPurchaseSeat,
          tier: data.tier,
        },
        error: data.error,
      };
    }
    if (!res.ok) {
      return { ok: false, error: data?.error ?? "Failed to add clinician" };
    }
    return { ok: true, emailSent: !!data.emailSent };
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
      const result = await submitAddClinician();
      if (!result.ok) {
        if (result.seatLimitReached && result.seatInfo) {
          // Surface the upgrade modal instead of a toast
          setSeatLimitInfo(result.seatInfo);
          setSeatLimitPending({
            name: newClinicianName.trim(),
            email: newClinicianEmail.trim(),
            role: newClinicianRole,
            authRole: newClinicianAuthRole,
          });
          setSeatModalOpen(true);
          return;
        }
        toast(result.error ?? "Failed to add clinician", "error");
        return;
      }

      const inviteNote = result.emailSent
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

  async function handlePurchaseExtraSeat(): Promise<{ ok: boolean; error?: string }> {
    if (!firebaseUser) return { ok: false, error: "Not signed in" };
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/billing/seats", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quantity: 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data?.error ?? "Couldn't purchase extra seat" };
      }

      // Seat purchased — now retry the add-clinician request
      const retry = await submitAddClinician();
      if (!retry.ok) {
        return { ok: false, error: retry.error ?? "Seat purchased, but adding clinician failed. Try again from Settings." };
      }

      const inviteNote = retry.emailSent
        ? ` — invite sent to ${newClinicianEmail.trim()}`
        : " — invite link generated";
      toast(`Seat added. ${newClinicianName.trim()} added${inviteNote}`, "success");
      setAddingClinician(false);
      setNewClinicianName("");
      setNewClinicianEmail("");
      setNewClinicianAuthRole("clinician");
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { ok: false, error: msg };
    }
  }

  async function handleDeactivateClinician(id: string, name: string) {
    if (!clinicId || !db) return;
    try {
      await updateDoc(doc(db, "clinics", clinicId, "clinicians", id), {
        active: false,
        deactivatedAt: new Date().toISOString(),
      });
      toast(`${name} removed from team`, "success");
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
      
      const res = await fetch(`/api/clinic/resend-invite`, {
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
            : "Invite created — configure RESEND_API_KEY to send invite emails automatically.",
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

      <ProfileCard />

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

      {canManageTeam && showOnboarding && (
        <OnboardingChecklist
          pmsConnected={onboarding.pmsConnected}
          cliniciansConfirmed={onboarding.cliniciansConfirmed}
          targetsSet={onboarding.targetsSet}
        />
      )}

      {canManageTeam && (<>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClinicDetailsCard
          clinicName={clinicName} setClinicName={setClinicName}
          clinicAddress={clinicAddress} setClinicAddress={setClinicAddress}
          clinicPhone={clinicPhone} setClinicPhone={setClinicPhone}
          receptionPhone={receptionPhone} setReceptionPhone={setReceptionPhone}
          sessionPrice={sessionPrice} setSessionPrice={setSessionPrice}
          clinicWebsite={clinicWebsite} setClinicWebsite={setClinicWebsite}
          bookingUrl={bookingUrl} setBookingUrl={setBookingUrl}
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
          className="btn-primary"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
      </>)}

      {/* ─── Owner/Admin-only sections ────────────────────────────── */}
      {canManageTeam && (<>

      <PmsIntegrationCard cp={cp} />

      <HepIntegrationCard
        hepProvider={hepProvider}
        setHepProvider={setHepProvider}
        hepApiKey={hepApiKey}
        setHepApiKey={setHepApiKey}
        hepConnected={hepConnected}
        setHepConnected={setHepConnected}
        hepTesting={hepTesting}
        setHepTesting={setHepTesting}
      />

      {/* Compatible Data Sources */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <h3 className="font-display text-lg text-navy mb-1">Compatible Data Sources</h3>
        <p className="text-xs text-muted mb-5">
          These tools enrich StrydeOS Intelligence with clinical data. They are not PMS integrations — they layer additional signals into your analytics.
        </p>
        <div id="reviews" className="grid grid-cols-1 sm:grid-cols-2 gap-4 scroll-mt-24">
          {/* Heidi */}
          <HeidiConnectionCard />

          {/* Google Reviews — Place ID + optional per-clinic API key */}
          <GoogleReviewsCard />

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
        clinicHeidiConnected={clinicHeidiConnected}
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

      <SeatLimitModal
        open={seatModalOpen}
        seatInfo={seatLimitInfo}
        pending={seatLimitPending}
        canBuy={
          !!seatLimitInfo?.canPurchaseSeat &&
          (user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin")
        }
        onPurchaseSeat={handlePurchaseExtraSeat}
        onClose={() => setSeatModalOpen(false)}
      />

      </>)}
      {/* ─── End owner/admin-only sections ──────────────────────────── */}
    </div>
  );
}
