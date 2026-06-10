"use client";

/**
 * Staff insurance intake review queue.
 *
 * Lives under the protected /compliance prefix (middleware + AuthGuard). Owners,
 * admins and superadmins review captured insurance details and approve (writes
 * to the PMS) or reject. Policy numbers arrive pre-redacted from the API.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, Clock, FileText, Mic, Upload, AlertCircle,
  Plus, Link2, Copy,
} from "lucide-react";
import { brand } from "@/lib/brand";
import MonolithPulse from "@/components/ui/MonolithPulse";
import { ShieldMark } from "@/components/ui/ModuleIcons";

type Status = "pending" | "approved" | "rejected";

interface IntakeRow {
  id: string;
  patientRef: string;
  source: "form" | "voice" | "csv";
  insurerName: string;
  scheme?: string;
  policyNumber: string; // redacted to last 4 by the API
  authorisationCode?: string;
  confidence: number;
  readBackConfirmed?: boolean;
  capturedAt: string;
  reviewStatus: Status;
}

const SOURCE_ICON = { form: FileText, voice: Mic, csv: Upload } as const;

export default function InsuranceReviewPage() {
  const { user, firebaseUser } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Status>("pending");
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [showLinkModal, setShowLinkModal] = useState(false);

  useEffect(() => {
    if (user && !["owner", "admin", "superadmin"].includes(user.role)) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    setError("");
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/insurance/intakes?status=${tab}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRows(data.intakes ?? []);
      } else {
        setError("Could not load the review queue.");
      }
    } catch {
      setError("Could not load the review queue.");
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    if (!firebaseUser) return;
    if (action === "reject" && !confirm("Reject this submission? It will not be written to the PMS.")) return;
    setBusy(id);
    setError("");
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/insurance/intakes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Could not ${action} this submission.`);
      }
    } catch {
      setError(`Could not ${action} this submission.`);
    } finally {
      setBusy(null);
    }
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <MonolithPulse size={48} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue/10 flex items-center justify-center">
            <ShieldCheck size={20} className="text-blue" />
          </div>
          <h1 className="font-display text-[32px] text-navy leading-tight">Insurance Intake</h1>
        </div>
        <button onClick={() => setShowLinkModal(true)} className="btn-primary" style={{ padding: "8px 16px" }}>
          <Plus size={16} /> New intake link
        </button>
      </div>
      <p className="text-sm text-muted mb-6">
        Review insurance details captured from patients. Approving writes them to the patient&apos;s PMS record.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-cloud-light border border-border w-fit">
        {(["pending", "approved", "rejected"] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              tab === s ? "bg-white text-navy shadow-sm" : "text-muted hover:text-navy"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-danger/5 border border-danger/20 p-3 mb-4 flex items-center gap-2">
          <AlertCircle size={15} className="text-danger" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <MonolithPulse />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <span
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl mx-auto mb-4"
            style={{
              background: `${brand.blue}14`,
              boxShadow: `inset 0 0 0 1px ${brand.blue}26`,
            }}
          >
            <ShieldMark color={brand.blue} size={30} />
          </span>
          <h3 className="font-display text-[20px] text-navy mb-2">Nothing {tab}</h3>
          <p className="text-sm text-muted">
            {tab === "pending" ? "New insurance submissions will appear here for review." : `No ${tab} submissions.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const Icon = SOURCE_ICON[row.source] ?? FileText;
            return (
              <div key={row.id} className="rounded-xl bg-white surface-lit border border-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-blue/10 text-blue capitalize">
                        <Icon size={12} /> {row.source}
                      </span>
                      <h3 className="font-semibold text-navy truncate">{row.insurerName}</h3>
                      {row.source === "voice" && (
                        <span className={`text-xs px-2 py-0.5 rounded-md ${row.readBackConfirmed ? "bg-success/10 text-success" : "bg-amber-500/10 text-amber-600"}`}>
                          {row.readBackConfirmed ? "read-back ✓" : "read-back unconfirmed"}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
                      <span>Policy <span className="font-mono text-navy">{row.policyNumber}</span></span>
                      {row.scheme && <span>Scheme <span className="text-navy">{row.scheme}</span></span>}
                      <span>Patient <span className="font-mono text-navy text-xs">{row.patientRef}</span></span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {new Date(row.capturedAt).toLocaleString()}</span>
                      <span>Confidence <span className="text-navy">{Math.round(row.confidence * 100)}%</span></span>
                    </div>
                  </div>

                  {row.reviewStatus === "pending" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => act(row.id, "reject")}
                        disabled={busy === row.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-danger border border-danger/20 bg-danger/5 hover:bg-danger/10 transition-colors disabled:opacity-50"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                      <button
                        onClick={() => act(row.id, "approve")}
                        disabled={busy === row.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-blue hover:bg-blue-bright transition-colors disabled:opacity-50"
                      >
                        {busy === row.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Approve and write
                      </button>
                    </div>
                  )}
                  {row.reviewStatus !== "pending" && (
                    <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg capitalize ${row.reviewStatus === "approved" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                      {row.reviewStatus}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LinkModal
        show={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        getToken={async () => firebaseUser?.getIdToken() ?? null}
      />
    </div>
  );
}

function LinkModal({
  show,
  onClose,
  getToken,
}: {
  show: boolean;
  onClose: () => void;
  getToken: () => Promise<string | null>;
}) {
  const [patientRef, setPatientRef] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [url, setUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  if (!show) return null;

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setGenerating(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/insurance/intake-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patientRef, appointmentId: appointmentId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUrl(data.url);
      } else {
        setErr(data.error ?? "Could not generate a link.");
      }
    } catch {
      setErr("Could not generate a link.");
    } finally {
      setGenerating(false);
    }
  }

  function reset() {
    setPatientRef("");
    setAppointmentId("");
    setUrl("");
    setErr("");
    setCopied(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={reset} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6">
        <h2 className="font-display text-[24px] text-navy mb-1">New intake link</h2>
        <p className="text-sm text-muted mb-4">
          Generate a secure link to send to a patient. They confirm their insurer and policy details before the appointment.
        </p>

        {url ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-cloud-light border border-border p-3 flex items-center gap-2">
              <Link2 size={16} className="text-blue shrink-0" />
              <span className="text-xs text-navy font-mono break-all">{url}</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); }}
                className="btn-primary flex-1 justify-center"
                style={{ padding: "12px 0" }}
              >
                <Copy size={16} /> {copied ? "Copied" : "Copy link"}
              </button>
              <button onClick={reset} className="flex-1 py-3 rounded-xl text-sm font-semibold text-navy border border-border hover:bg-cloud-light transition-colors">
                Done
              </button>
            </div>
            <p className="text-xs text-muted">Link expires in 7 days. Delivery via SMS/email lands with the Pulse rollout.</p>
          </div>
        ) : (
          <form onSubmit={generate} className="space-y-4">
            {err && (
              <div className="rounded-xl bg-danger/5 border border-danger/20 p-3 flex items-center gap-2">
                <AlertCircle size={15} className="text-danger" />
                <p className="text-sm text-danger">{err}</p>
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
              <button type="submit" disabled={generating} className="btn-primary flex-1 justify-center" style={{ padding: "12px 0" }}>
                {generating ? <Loader2 size={16} className="animate-spin" /> : "Generate link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
