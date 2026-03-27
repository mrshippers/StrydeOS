"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { Shield, Plus, Download, Trash2, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { SarRequest } from "@/types";

export default function CompliancePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<SarRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (user && !["owner", "admin", "superadmin"].includes(user.role)) {
      router.push("/dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    try {
      const res = await fetch("/api/compliance/sar");
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error("[SAR load error]", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(requestId: string) {
    setProcessing(requestId);
    try {
      const res = await fetch(`/api/compliance/sar/${requestId}/export`, {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sar-export-${requestId}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        await loadRequests();
      }
    } catch (err) {
      console.error("[SAR export error]", err);
    } finally {
      setProcessing(null);
    }
  }

  async function handleDelete(requestId: string) {
    if (!confirm("Mark patient data for deletion? This action cannot be undone after the 30-day grace period.")) {
      return;
    }

    setProcessing(requestId);
    try {
      const res = await fetch(`/api/compliance/sar/${requestId}/delete`, {
        method: "POST",
      });

      if (res.ok) {
        await loadRequests();
        alert("Patient data marked for deletion. 30-day grace period started.");
      }
    } catch (err) {
      console.error("[SAR delete error]", err);
    } finally {
      setProcessing(null);
    }
  }

  function getStatusIcon(status: SarRequest["status"]) {
    switch (status) {
      case "pending":
        return <Clock size={16} className="text-muted" />;
      case "in_progress":
        return <Loader2 size={16} className="text-blue animate-spin" />;
      case "completed":
        return <CheckCircle2 size={16} className="text-success" />;
      case "rejected":
        return <AlertCircle size={16} className="text-danger" />;
    }
  }

  function getStatusColor(status: SarRequest["status"]) {
    switch (status) {
      case "pending":
        return "bg-muted/10 text-muted border-muted/20";
      case "in_progress":
        return "bg-blue/10 text-blue border-blue/20";
      case "completed":
        return "bg-success/10 text-success border-success/20";
      case "rejected":
        return "bg-danger/10 text-danger border-danger/20";
    }
  }

  function getTypeLabel(type: SarRequest["type"]) {
    switch (type) {
      case "access":
        return "Data Access";
      case "correction":
        return "Data Correction";
      case "deletion":
        return "Data Deletion";
    }
  }

  if (!user || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cloud-dancer">
        <Loader2 size={24} className="animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cloud-dancer">
      <div className="max-w-6xl mx-auto px-6 pt-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue/10 flex items-center justify-center">
                <Shield size={20} className="text-blue" />
              </div>
              <h1 className="font-display text-[32px] text-navy leading-tight">Compliance</h1>
            </div>
            <p className="text-sm text-muted">Subject Access Requests and data privacy management</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary" style={{ padding: "8px 16px" }}
          >
            <Plus size={16} />
            New Request
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-8">
        {requests.length === 0 && !loading ? (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-xl bg-muted/10 flex items-center justify-center mx-auto mb-4">
              <Shield size={28} className="text-muted" />
            </div>
            <h3 className="font-display text-[20px] text-navy mb-2">No requests yet</h3>
            <p className="text-sm text-muted mb-6">Subject Access Requests will appear here</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary mx-auto" style={{ padding: "8px 16px" }}
            >
              <Plus size={16} />
              Create First Request
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div
                key={request.id}
                className="rounded-xl bg-white border border-border p-6 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-navy">{getTypeLabel(request.type)}</h3>
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border ${getStatusColor(request.status)}`}>
                        {getStatusIcon(request.status)}
                        {request.status}
                      </div>
                    </div>
                    <p className="text-sm text-muted mb-1">
                      Requested by: <span className="text-navy font-medium">{request.requestedBy}</span>
                    </p>
                    {request.patientId && (
                      <p className="text-sm text-muted">
                        Patient ID: <span className="text-navy font-mono text-xs">{request.patientId}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {request.type === "access" && request.status !== "completed" && (
                      <button
                        onClick={() => handleExport(request.id)}
                        disabled={processing === request.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-blue border border-blue/20 bg-blue/5 hover:bg-blue/10 transition-colors disabled:opacity-50"
                      >
                        {processing === request.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <>
                            <Download size={14} />
                            Export
                          </>
                        )}
                      </button>
                    )}
                    {request.type === "deletion" && request.status !== "completed" && (
                      <button
                        onClick={() => handleDelete(request.id)}
                        disabled={processing === request.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-danger border border-danger/20 bg-danger/5 hover:bg-danger/10 transition-colors disabled:opacity-50"
                      >
                        {processing === request.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <>
                            <Trash2 size={14} />
                            Delete
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-cloud-light border border-border">
                  <p className="text-sm text-navy">{request.description}</p>
                </div>

                <div className="flex items-center gap-6 mt-4 text-xs text-muted">
                  <span>Created: {new Date(request.createdAt).toLocaleDateString()}</span>
                  <span>Deadline: {new Date(request.responseDeadline).toLocaleDateString()}</span>
                  {request.completedAt && (
                    <span className="text-success">
                      Completed: {new Date(request.completedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateSarModal
        show={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          loadRequests();
        }}
      />
    </div>
  );
}

function CreateSarModal({
  show,
  onClose,
  onSuccess,
}: {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<"access" | "correction" | "deletion">("access");
  const [requestedBy, setRequestedBy] = useState("");
  const [patientId, setPatientId] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/compliance/sar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          requestedBy,
          patientId: patientId || undefined,
          description,
        }),
      });

      if (res.ok) {
        onSuccess();
        setType("access");
        setRequestedBy("");
        setPatientId("");
        setDescription("");
      }
    } catch (err) {
      console.error("[SAR create error]", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <h2 className="font-display text-[24px] text-navy mb-4">New SAR</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">
                      Request Type
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as "access" | "correction" | "deletion")}
                      required
                      className="w-full px-4 py-3 rounded-xl text-sm text-navy border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                    >
                      <option value="access">Data Access</option>
                      <option value="correction">Data Correction</option>
                      <option value="deletion">Data Deletion</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">
                      Requested By (Email)
                    </label>
                    <input
                      type="email"
                      value={requestedBy}
                      onChange={(e) => setRequestedBy(e.target.value)}
                      required
                      placeholder="patient@example.com"
                      className="w-full px-4 py-3 rounded-xl text-sm text-navy placeholder-muted border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">
                      Patient ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      placeholder="If known"
                      className="w-full px-4 py-3 rounded-xl text-sm text-navy placeholder-muted border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                      rows={4}
                      placeholder="Describe the request..."
                      className="w-full px-4 py-3 rounded-xl text-sm text-navy placeholder-muted border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold text-navy border border-border hover:bg-cloud-light transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="btn-primary flex-1 justify-center" style={{ padding: "12px 0" }}
                    >
                      {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Create Request"}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
