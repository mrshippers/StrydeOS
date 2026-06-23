"use client";

import { useRef, useState, type FC } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, AlertTriangle } from "lucide-react";
import type { Patient, Clinician } from "@/types";
import { updatePatient } from "@/lib/queries";
import { isPatientStale } from "@/lib/pulse/patient-edit-guard";
import { useToast } from "@/components/ui/Toast";
import { brand } from "@/lib/brand";
import { GlassCard } from "@/components/ui/GlassCard";

interface Props {
  patient: Patient;
  clinicianMap: Record<string, Clinician>;
  clinicId: string;
  onClose: () => void;
}

export const PatientEditModal: FC<Props> = ({ patient, clinicianMap, clinicId, onClose }) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Capture the record version this editor opened against. The `patient` prop
  // stays live (the board subscribes via onSnapshot), so if a PMS sync or
  // another user writes to this patient while the modal is open, the live
  // updatedAt diverges from this baseline and a blind Save would clobber the
  // fresher server data. See lib/pulse/patient-edit-guard.
  const openedUpdatedAt = useRef(patient.updatedAt);
  const stale = isPatientStale(openedUpdatedAt.current, patient.updatedAt);

  const [name, setName] = useState(patient.name);
  const [email, setEmail] = useState(patient.contact.email ?? "");
  const [phone, setPhone] = useState(patient.contact.phone ?? "");
  const [sessionCount, setSessionCount] = useState(patient.sessionCount);
  const [treatmentLength, setTreatmentLength] = useState(patient.treatmentLength);
  const [clinicianId, setClinicianId] = useState(patient.clinicianId);
  const [lastSessionDate, setLastSessionDate] = useState(patient.lastSessionDate ?? "");
  const [nextSessionDate, setNextSessionDate] = useState(patient.nextSessionDate ?? "");

  // Pull the fresher server values into the editor and re-baseline, so the
  // user can re-apply their intent against current data instead of clobbering it.
  function reloadFromLive() {
    setName(patient.name);
    setEmail(patient.contact.email ?? "");
    setPhone(patient.contact.phone ?? "");
    setSessionCount(patient.sessionCount);
    setTreatmentLength(patient.treatmentLength);
    setClinicianId(patient.clinicianId);
    setLastSessionDate(patient.lastSessionDate ?? "");
    setNextSessionDate(patient.nextSessionDate ?? "");
    openedUpdatedAt.current = patient.updatedAt;
  }

  async function handleSave() {
    if (stale) {
      toast("This patient changed since you opened it — reload before saving", "error");
      return;
    }
    setSaving(true);
    try {
      await updatePatient(clinicId, patient.id, {
        name,
        contact: {
          email: email || undefined,
          phone: phone || undefined,
        },
        sessionCount,
        treatmentLength,
        clinicianId,
        lastSessionDate: lastSessionDate || undefined,
        nextSessionDate: nextSessionDate || undefined,
      });
      toast(`${name} updated`, "success");
      onClose();
    } catch {
      toast("Failed to save changes", "error");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-[8px] border border-border bg-white px-3 py-2 text-sm text-navy outline-none transition-colors focus:border-teal focus:ring-1 focus:ring-teal/30";
  const labelClass = "block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: "rgba(11, 37, 69, 0.5)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      >
        <GlassCard
          variant="primary"
          tint="pulse"
          className="w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[10px] font-bold text-navy dark:text-white"
                style={{ background: brand.teal }}
              >
                {patient.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <h3 className="font-display text-base text-navy">Edit Patient</h3>
                <p className="text-[11px] text-muted">Manual override — bypasses PMS sync</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted hover:text-navy transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Form */}
          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Stale-data guard banner */}
            {stale && (
              <div className="flex items-start gap-2.5 rounded-[8px] border border-warn/30 bg-warn/10 p-3">
                <AlertTriangle size={15} className="text-warn shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-navy">This patient changed while you were editing</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    A PMS sync or another user updated this record. Saving now would overwrite the newer data.
                  </p>
                  <button
                    onClick={reloadFromLive}
                    className="mt-1.5 text-[11px] font-semibold text-teal hover:underline"
                  >
                    Reload latest values
                  </button>
                </div>
              </div>
            )}

            {/* Name */}
            <div>
              <label className={labelClass}>Full Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>

            {/* Contact row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="patient@email.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+44 7..."
                  className={inputClass}
                />
              </div>
            </div>

            {/* Sessions row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Sessions Completed</label>
                <input
                  type="number"
                  min={0}
                  value={sessionCount}
                  onChange={(e) => setSessionCount(Math.max(0, parseInt(e.target.value) || 0))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Treatment length</label>
                <input
                  type="number"
                  min={1}
                  value={treatmentLength}
                  onChange={(e) => setTreatmentLength(Math.max(1, parseInt(e.target.value) || 1))}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Clinician */}
            <div>
              <label className={labelClass}>Assigned Clinician</label>
              <select value={clinicianId} onChange={(e) => setClinicianId(e.target.value)} className={inputClass}>
                {Object.values(clinicianMap).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Date row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Last Session</label>
                <input
                  type="date"
                  value={lastSessionDate}
                  onChange={(e) => setLastSessionDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Next Session</label>
                <input
                  type="date"
                  value={nextSessionDate}
                  onChange={(e) => setNextSessionDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t border-border bg-cloud-light/50">
            <p className="text-[10px] text-muted">Changes override synced data until next PMS sync</p>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-[8px] text-sm font-medium text-muted hover:text-navy transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim() || stale}
                className="btn-primary btn-primary-teal"
                style={{ padding: "8px 16px" }}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </AnimatePresence>
  );
};
