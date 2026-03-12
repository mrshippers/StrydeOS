"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import PatientRow from "@/components/ui/PatientRow";
import EmptyState from "@/components/ui/EmptyState";
import DemoBanner from "@/components/ui/DemoBanner";
import { useClinicians } from "@/hooks/useClinicians";
import { usePatients } from "@/hooks/usePatients";
import { useToast } from "@/components/ui/Toast";
import { getDemoCommsSequences } from "@/hooks/useDemoComms";
import { useDemoPatients } from "@/hooks/useDemoData";
import { useCommsLog } from "@/hooks/useCommsLog";
import { formatPercent, daysSince } from "@/lib/utils";
import {
  Users,
  AlertTriangle,
  CheckCircle,
  Mail,
  MessageSquare,
  Send,
  Clock,
  ToggleLeft,
  ToggleRight,
  Eye,
  MousePointer,
  CalendarCheck,
  Zap,
  X,
  Smartphone,
} from "lucide-react";

const SEQUENCE_PREVIEWS: Record<string, { channel: "sms" | "email"; subject?: string; body: string }> = {
  hep_reminder: {
    channel: "sms",
    body: "Hi [Name], just a reminder to complete your home exercises before your next appointment on [Date]. Keeping up with them will really help your progress. Reply STOP to opt out.",
  },
  rebooking_prompt: {
    channel: "sms",
    body: "Hi [Name], we noticed you haven't booked your next appointment yet. You've made great progress — let's keep the momentum going. Book online: [Link] or reply to this message.",
  },
  pre_auth_collection: {
    channel: "email",
    subject: "Insurance authorisation needed before your appointment",
    body: "Dear [Name],\n\nWe've noticed your upcoming appointment is being processed through [Insurer]. To avoid any delays, please ensure you have your pre-authorisation reference number ready.\n\nIf you need help, reply to this email or call us on [Phone].\n\nKind regards,\nThe team at [Clinic]",
  },
  review_prompt: {
    channel: "sms",
    body: "Hi [Name], we hope you're feeling the benefit of your treatment! If you have a moment, we'd really appreciate a review — it helps other patients find us. [Google Review Link] Thank you!",
  },
  reactivation_90d: {
    channel: "email",
    subject: "How are you feeling, [Name]?",
    body: "Dear [Name],\n\nIt's been a while since we've seen you, and we just wanted to check in. If you've had any new symptoms or your old ones have returned, we're here to help.\n\nBook your appointment: [Link]\n\nBest wishes,\nThe team at [Clinic]",
  },
  reactivation_180d: {
    channel: "email",
    subject: "Time for a check-up, [Name]?",
    body: "Dear [Name],\n\nIt's been 6 months since your last visit. Many of our patients find a maintenance session every few months keeps them moving well and prevents recurrence.\n\nIf you'd like to book, click here: [Link]\n\nBest,\nThe team at [Clinic]",
  },
};

type View = "patients" | "sequences" | "log";

export default function ContinuityPageWrapper() {
  return (
    <Suspense fallback={<div className="animate-skeleton p-8 text-center text-muted">Loading...</div>}>
      <ContinuityPage />
    </Suspense>
  );
}

function ContinuityPage() {
  const searchParams = useSearchParams();
  const initialClinician = searchParams.get("clinician") ?? "all";
  const [selectedClinician, setSelectedClinician] = useState(initialClinician);
  const [activeView, setActiveView] = useState<View>("patients");
  const [previewSequenceType, setPreviewSequenceType] = useState<string | null>(null);
  const { clinicians } = useClinicians();
  const { active, churnRisk, postDischarge, loading } = usePatients(selectedClinician);
  const { toast } = useToast();
  const clinicianMap = Object.fromEntries(clinicians.map((c) => [c.id, c]));

  const sequences = getDemoCommsSequences();
  const { commsLog, commsStats } = useCommsLog();
  const allPatients = useDemoPatients();
  const patientMap = Object.fromEntries(allPatients.map((p) => [p.id, p]));

  function handleSendReminder(patientId: string) {
    const patient = [...active, ...churnRisk, ...postDischarge].find((p) => p.id === patientId);
    toast(patient ? `Reminder sent to ${patient.name}` : "Reminder sent", "success");
  }

  const channelIcon = (ch: string) =>
    ch === "sms" ? <MessageSquare size={12} /> : <Mail size={12} />;

  const previewData = previewSequenceType ? SEQUENCE_PREVIEWS[previewSequenceType] : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Pulse"
        subtitle="Track patient journeys, manage comms sequences, and reduce drop-off"
        clinicians={clinicians}
        selectedClinician={selectedClinician}
        onClinicianChange={setSelectedClinician}
        accentColor="#0891B2"
      />

      <DemoBanner />

      {/* Comms summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Sent"
          value={commsStats.totalSent}
          unit="messages"
          status="neutral"
        />
        <StatCard
          label="Open Rate"
          value={formatPercent(commsStats.openRate)}
          status={commsStats.openRate >= 0.7 ? "ok" : commsStats.openRate >= 0.5 ? "warn" : "danger"}
        />
        <StatCard
          label="Click Rate"
          value={formatPercent(commsStats.clickRate)}
          status={commsStats.clickRate >= 0.5 ? "ok" : commsStats.clickRate >= 0.3 ? "warn" : "danger"}
        />
        <StatCard
          label="Rebook Conv."
          value={formatPercent(commsStats.conversionToRebook)}
          status={commsStats.conversionToRebook >= 0.08 ? "ok" : "warn"}
          insight="From rebooking prompts"
        />
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 bg-cloud-light rounded-xl p-1 border border-border">
        {([
          { id: "patients" as const, label: "Patient Board", icon: Users },
          { id: "sequences" as const, label: "Comms Sequences", icon: Zap },
          { id: "log" as const, label: "Send Log", icon: Send },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeView === id
                ? "bg-white text-navy shadow-[var(--shadow-card)]"
                : "text-muted hover:text-navy"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Patient Board */}
      {activeView === "patients" && (
        <div className="animate-fade-in space-y-5">
          {/* At-Risk Alert Panel — shown when churn risks exist */}
          {!loading && churnRisk.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-[var(--radius-card)] border border-warn/30 bg-warn/5 p-5"
            >
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={16} className="text-warn" />
                <h3 className="text-sm font-semibold text-warn">
                  {churnRisk.length} patient{churnRisk.length !== 1 ? "s" : ""} at risk of dropping off
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {churnRisk.map((p) => {
                  const daysSinceLast = p.lastSessionDate ? daysSince(p.lastSessionDate) : 0;
                  const clinician = clinicianMap[p.clinicianId];
                  const urgency = daysSinceLast > 21 ? "danger" : "warn";
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25 }}
                      className={`rounded-xl border p-4 bg-white flex items-start justify-between gap-3 ${
                        urgency === "danger" ? "border-danger/30" : "border-warn/30"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${
                          urgency === "danger" ? "bg-danger" : "bg-warn"
                        }`}>
                          {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-navy truncate">{p.name}</p>
                          {clinician && <p className="text-[11px] text-muted truncate">{clinician.name}</p>}
                          <p className={`text-[11px] font-medium mt-0.5 ${urgency === "danger" ? "text-danger" : "text-warn"}`}>
                            Last seen {daysSinceLast}d ago · {p.sessionCount}/{p.courseLength} sessions
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSendReminder(p.id)}
                        className="text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors whitespace-nowrap shrink-0"
                      >
                        Re-engage →
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue" />
              <span className="text-muted">
                <span className="font-semibold text-navy">{active.length}</span> active
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-warn" />
              <span className="text-muted">
                <span className="font-semibold text-navy">{churnRisk.length}</span> churn risks
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-muted" />
              <span className="text-muted">
                <span className="font-semibold text-navy">{postDischarge.length}</span> post-discharge
              </span>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-3">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="rounded-xl bg-white border border-border p-4 animate-skeleton">
                      <div className="h-3 w-24 bg-cloud-dark rounded mb-3" />
                      <div className="h-2 w-32 bg-cloud-dark rounded" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Users size={14} className="text-blue" />
                  <h3 className="text-sm font-semibold text-navy">Active</h3>
                </div>
                {active.length > 0 ? (
                  <div className="space-y-3">
                    {active.map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.04 }}
                      >
                        <PatientRow patient={p} clinician={clinicianMap[p.clinicianId]} onSendReminder={handleSendReminder} />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <EmptyState module="pulse" heading="No active patients" subtext="All patients are either at risk or post-discharge." />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={14} className="text-warn" />
                  <h3 className="text-sm font-semibold text-warn">Churn Risk</h3>
                </div>
                {churnRisk.length > 0 ? (
                  <div className="space-y-3">
                    {churnRisk.map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.04 }}
                      >
                        <PatientRow patient={p} clinician={clinicianMap[p.clinicianId]} onSendReminder={handleSendReminder} />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <EmptyState module="pulse" heading="No churn risks" subtext="All patients with 2+ sessions have active rebookings." />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={14} className="text-muted" />
                  <h3 className="text-sm font-semibold text-muted">Post-Discharge</h3>
                </div>
                {postDischarge.length > 0 ? (
                  <div className="space-y-3">
                    {postDischarge.map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.04 }}
                      >
                        <PatientRow patient={p} clinician={clinicianMap[p.clinicianId]} />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <EmptyState module="pulse" heading="No recent discharges" subtext="Post-discharge patients within the last 90 days will appear here." />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comms Sequences */}
      {activeView === "sequences" && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-xs text-muted">
            Each sequence triggers automatically based on patient events from your PMS. Toggle on/off per sequence. Timing and channel are configurable per clinic.
          </p>
          {sequences.map((seq) => (
            <div
              key={seq.type}
              className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5 transition-all hover:shadow-[var(--shadow-elevated)]"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue/10 flex items-center justify-center shrink-0">
                    {seq.channel === "sms" ? <MessageSquare size={16} className="text-blue" /> : <Mail size={16} className="text-blue" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-navy">{seq.name}</h4>
                    <p className="text-xs text-muted">{seq.description}</p>
                    {SEQUENCE_PREVIEWS[seq.type] && (
                      <button
                        onClick={() => setPreviewSequenceType(seq.type)}
                        className="text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors mt-1"
                      >
                        Preview message →
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toast(`${seq.name} ${seq.enabled ? "disabled" : "enabled"} (demo)`, "success")}
                  className="shrink-0"
                >
                  {seq.enabled ? (
                    <ToggleRight size={28} className="text-success" />
                  ) : (
                    <ToggleLeft size={28} className="text-muted" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1.5 mb-3">
                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue/10 text-blue">
                  {channelIcon(seq.channel)}
                  {seq.channel.toUpperCase()}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cloud-dark text-muted">
                  <Clock size={10} />
                  {seq.delayHours < 24 ? `${seq.delayHours}h delay` : `${Math.round(seq.delayHours / 24)}d delay`}
                </span>
              </div>

              {seq.sent > 0 && (
                <div className="grid grid-cols-4 gap-3 pt-3 border-t border-border/50">
                  <div className="text-center">
                    <p className="font-display text-lg text-navy">{seq.sent}</p>
                    <p className="text-[10px] text-muted flex items-center justify-center gap-1"><Send size={9} /> Sent</p>
                  </div>
                  <div className="text-center">
                    <p className="font-display text-lg text-navy">{seq.opened}</p>
                    <p className="text-[10px] text-muted flex items-center justify-center gap-1"><Eye size={9} /> Opened</p>
                  </div>
                  <div className="text-center">
                    <p className="font-display text-lg text-navy">{seq.clicked}</p>
                    <p className="text-[10px] text-muted flex items-center justify-center gap-1"><MousePointer size={9} /> Clicked</p>
                  </div>
                  <div className="text-center">
                    <p className="font-display text-lg text-navy">{seq.rebooked}</p>
                    <p className="text-[10px] text-muted flex items-center justify-center gap-1"><CalendarCheck size={9} /> Rebooked</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Send Log */}
      {activeView === "log" && (
        <div className="animate-fade-in">
          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-cloud-light/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Patient</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Sequence</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Channel</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Sent</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Opened</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {commsLog.map((entry) => {
                    const patient = patientMap[entry.patientId];
                    const sentDate = new Date(entry.sentAt);
                    const daysAgo = daysSince(sentDate.toISOString().split("T")[0]);
                    return (
                      <tr key={entry.id} className="border-b border-border/50 hover:bg-cloud-light/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-navy">{patient?.name ?? entry.patientId}</td>
                        <td className="py-3 px-4">
                          <span className="text-xs font-medium text-muted">
                            {entry.sequenceType.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue/10 text-blue w-fit">
                            {channelIcon(entry.channel)}
                            {entry.channel.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted">{daysAgo}d ago</td>
                        <td className="py-3 px-4">
                          {entry.openedAt ? (
                            <Eye size={14} className="text-success" />
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            entry.outcome === "booked"
                              ? "bg-success/10 text-success"
                              : "bg-cloud-dark text-muted"
                          }`}>
                            {entry.outcome === "booked" ? "Rebooked" : "No action"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Channel preview modal */}
      <AnimatePresence>
        {previewData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: "rgba(11, 37, 69, 0.5)", backdropFilter: "blur(4px)" }}
            onClick={() => setPreviewSequenceType(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md rounded-2xl bg-white shadow-[var(--shadow-elevated)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-border">
                <div className="flex items-center gap-2.5">
                  {previewData.channel === "sms" ? (
                    <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                      <Smartphone size={15} className="text-success" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-blue/10 flex items-center justify-center">
                      <Mail size={15} className="text-blue" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-display text-base text-navy">Message Preview</h3>
                    <p className="text-[11px] text-muted">
                      {previewData.channel === "sms" ? "SMS · Sent via Twilio" : "Email · Sent via Resend"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewSequenceType(null)}
                  className="text-muted hover:text-navy transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5">
                {previewData.channel === "email" && previewData.subject && (
                  <div className="mb-3 pb-3 border-b border-border">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Subject</p>
                    <p className="text-sm text-navy font-medium">{previewData.subject}</p>
                  </div>
                )}

                {previewData.channel === "sms" ? (
                  <div className="flex justify-end">
                    <div
                      className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed text-white"
                      style={{ background: "#1C54F2" }}
                    >
                      {previewData.body}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-cloud-light p-4 text-[13px] leading-relaxed text-navy whitespace-pre-line">
                    {previewData.body}
                  </div>
                )}

                <p className="text-[11px] text-muted mt-4">
                  Template variables in <span className="font-mono text-navy bg-cloud-dark px-1 rounded">[brackets]</span> are resolved with real patient data at send time.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
