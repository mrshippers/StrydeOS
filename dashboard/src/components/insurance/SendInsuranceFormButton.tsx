"use client";

/**
 * Manual failsafe to send the insurance intake form to a patient.
 * Renders only for owner/admin/superadmin. Calls /api/insurance/send-one.
 */

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Send, Loader2, CheckCircle2, Copy, AlertCircle } from "lucide-react";

interface SendResult {
  url?: string;
  emailed?: boolean;
  texted?: boolean;
  email?: string | null;
  error?: string;
  suppressed?: boolean;
  reason?: "already_submitted" | "recently_sent";
  lastSentAt?: string | null;
}

export default function SendInsuranceFormButton({ className }: { className?: string }) {
  const { user, firebaseUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [patientRef, setPatientRef] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [copied, setCopied] = useState(false);

  if (!user || !["owner", "admin", "superadmin"].includes(user.role)) return null;

  async function send(force: boolean) {
    if (!firebaseUser) return;
    setSending(true);
    setResult(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/insurance/send-one", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patientRef, appointmentId: appointmentId || undefined, force }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.suppressed) {
        setResult({ suppressed: true, reason: data.reason, lastSentAt: data.lastSentAt ?? null });
      } else {
        setResult(res.ok ? data : { error: data.error ?? "Could not send." });
      }
    } catch {
      setResult({ error: "Network error." });
    } finally {
      setSending(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void send(false);
  }

  function reset() {
    setPatientRef("");
    setAppointmentId("");
    setResult(null);
    setCopied(false);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-teal border border-teal/20 hover:bg-teal/5 transition-colors"}
      >
        <Send size={12} /> Send insurance form
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={reset} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6 animate-fade-in">
            <h2 className="font-display text-[22px] text-navy mb-1">Send insurance form</h2>
            <p className="text-sm text-muted mb-4">
              Generate a secure link and email it to the patient ahead of their appointment.
            </p>

            {result?.url ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-success/5 border border-success/20 p-3 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-success shrink-0" />
                  <p className="text-sm text-navy">
                    {result.emailed
                      ? `Emailed to ${result.email}`
                      : result.email
                        ? "Link created (email could not be sent)"
                        : "Link created — patient has no email on file, copy the link below"}
                  </p>
                </div>
                <div className="rounded-xl bg-cloud-light border border-border p-3">
                  <span className="text-xs font-mono text-navy break-all">{result.url}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { navigator.clipboard?.writeText(result.url!); setCopied(true); }}
                    className="btn-primary flex-1 justify-center" style={{ padding: "12px 0" }}
                  >
                    <Copy size={16} /> {copied ? "Copied" : "Copy link"}
                  </button>
                  <button onClick={reset} className="flex-1 py-3 rounded-xl text-sm font-semibold text-navy border border-border hover:bg-cloud-light transition-colors">
                    Done
                  </button>
                </div>
              </div>
            ) : result?.suppressed ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-navy">
                    {result.reason === "already_submitted"
                      ? "This patient has already completed the insurance form recently"
                      : "A secure link was already sent to this patient recently"}
                    {result.lastSentAt ? ` (${new Date(result.lastSentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})` : ""}
                    . Avoid sending again unless they asked.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={reset} className="flex-1 py-3 rounded-xl text-sm font-semibold text-navy border border-border hover:bg-cloud-light transition-colors">
                    Cancel
                  </button>
                  <button onClick={() => void send(true)} disabled={sending} className="btn-primary flex-1 justify-center" style={{ padding: "12px 0" }}>
                    {sending ? <Loader2 size={16} className="animate-spin" /> : "Send anyway"}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {result?.error && (
                  <div className="rounded-xl bg-danger/5 border border-danger/20 p-3 flex items-center gap-2">
                    <AlertCircle size={15} className="text-danger" />
                    <p className="text-sm text-danger">{result.error}</p>
                  </div>
                )}
                <label className="block">
                  <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">Patient PMS ID</span>
                  <input value={patientRef} onChange={(e) => setPatientRef(e.target.value)} required placeholder="Cliniko patient id" className="form-input font-mono" />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">Appointment ID (optional)</span>
                  <input value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} placeholder="Optional" className="form-input font-mono" />
                </label>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={reset} className="flex-1 py-3 rounded-xl text-sm font-semibold text-navy border border-border hover:bg-cloud-light transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={sending || !patientRef.trim()} className="btn-primary flex-1 justify-center" style={{ padding: "12px 0" }}>
                    {sending ? <Loader2 size={16} className="animate-spin" /> : "Generate & send"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
