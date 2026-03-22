"use client";

import { useState, type FC } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import type { Patient, Clinician } from "@/types";
import { updatePatient } from "@/lib/queries";
import { useToast } from "@/components/ui/Toast";
import { brand } from "@/lib/brand";

interface Props {
  patient: Patient;
  clinicianMap: Record<string, Clinician>;
  clinicId: string;
  onClose: () => void;
}

export const PatientEditModal: FC<Props> = ({ patient, clinicianMap, clinicId, onClose }) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(patient.name);
  const [email, setEmail] = useState(patient.contact.email ?? "");
  const [phone, setPhone] = useState(patient.contact.phone ?? "");
  const [sessionCount, setSessionCount] = useState(patient.sessionCount);
  const [courseLength, setCourseLength] = useState(patient.courseLength);
  const [clinicianId, setClinicianId] = useState(patient.clinicianId);
  const [lastSessionDate, setLastSessionDate] = useState(patient.lastSessionDate ?? "");
  const [nextSessionDate, setNextSessionDate] = useState(patient.nextSessionDate ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      await updatePatient(clinicId, patient.id, {
        name,
        contact: {
          email: email || undefined,
          phone: phone || undefined,
        },
        sessionCount,
        courseLength,
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
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-lg rounded-[16px] bg-white shadow-[var(--shadow-elevated)] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[10px] font-bold text-white"
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
                <label className={labelClass}>Course Length</label>
                <input
                  type="number"
                  min={1}
                  value={courseLength}
                  onChange={(e) => setCourseLength(Math.max(1, parseInt(e.target.value) || 1))}
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
                disabled={saving || !name.trim()}
                className="px-4 py-2 rounded-[8px] text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: brand.teal }}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
