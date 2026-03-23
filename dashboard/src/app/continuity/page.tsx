"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";

import { useAuth } from "@/hooks/useAuth";
import { useClinicians } from "@/hooks/useClinicians";
import { usePatients } from "@/hooks/usePatients";
import { useToast } from "@/components/ui/Toast";
import { useSequences } from "@/hooks/useSequences";
import { useCommsLog } from "@/hooks/useCommsLog";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { SessionThresholdStrip } from "@/components/pulse/SessionThresholdStrip";
import { PatientBoard } from "@/components/pulse/PatientBoard";
import { SequenceCard } from "@/components/pulse/SequenceCard";
import { CustomisePanel } from "@/components/pulse/CustomisePanel";
import { formatPercent, daysSince } from "@/lib/utils";
import {
  Users,
  Mail,
  MessageSquare,
  Send,
  Eye,
  Zap,
  X,
  Smartphone,
  SlidersHorizontal,
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
    <Suspense fallback={<div className="p-8 flex items-center justify-center"><div className="h-6 w-32 skeleton-shimmer rounded-lg" /></div>}>
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
  const { patients, active, churnRisk, postDischarge, sessionAlerts, loading } = usePatients(selectedClinician);
  const { toast } = useToast();
  const clinicianMap = Object.fromEntries(clinicians.map((c) => [c.id, c]));

  const { sequences, toggleSequence, usingDefaults } = useSequences();
  const { user } = useAuth();
  const { commsLog, commsStats, statsBySequence, totalAttributedRevenuePence, isDemo: commsIsDemo } = useCommsLog();
  const { preferences, updatePreferences } = useUserPreferences();
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const patientMap = Object.fromEntries(patients.map((p) => [p.id, p]));

  async function handleSendReminder(patientId: string) {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;

    const to = patient.contact?.phone ?? patient.contact?.email;
    const channel = patient.contact?.phone ? "sms" : "email";
    if (!to) {
      toast(`No contact details for ${patient.name}`, "error");
      return;
    }

    const clinicId = user?.clinicId;
    if (!clinicId) return;

    const REBOOKING_BODY =
      "Hi [Name], we noticed you haven't booked your next appointment yet. You've made great progress — let's keep the momentum going. Reply to this message or call us on [Phone].";

    try {
      const res = await fetch("/api/comms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicId,
          patientId: patient.id,
          patientName: patient.name,
          sequenceType: "rebooking_prompt",
          channel,
          to,
          body: REBOOKING_BODY,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast(`Re-engagement ${channel === "sms" ? "SMS" : "email"} sent to ${patient.name}`, "success");
    } catch {
      toast(`Failed to send to ${patient.name}`, "error");
    }
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-cloud-light rounded-xl p-1 border border-border flex-1">
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
                  ? "bg-white text-navy shadow-[var(--shadow-card)] button-highlight"
                  : "text-muted hover:text-navy"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCustomiseOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-white text-sm font-medium text-muted hover:text-navy transition-colors shadow-[var(--shadow-card)]"
        >
          <SlidersHorizontal size={14} />
          Customise
        </button>
      </div>

      {/* Patient Board */}
      {activeView === "patients" && (
        <div className="animate-fade-in space-y-4">
          {!loading && sessionAlerts.length > 0 && preferences && (
            <SessionThresholdStrip
              patients={sessionAlerts}
              clinicianMap={clinicianMap}
              onSendEarlyIntervention={handleSendReminder}
            />
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-[12px] bg-white border border-border p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full skeleton-shimmer shrink-0" />
                    <div className="flex-1">
                      <div className="h-3.5 w-32 skeleton-shimmer rounded mb-1.5" />
                      <div className="h-2.5 w-24 skeleton-shimmer rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            preferences && (
              <PatientBoard
                patients={patients}
                clinicianMap={clinicianMap}
                clinicId={user?.clinicId ?? null}
                visibleSegments={preferences.visibleSegments}
                visibleMetrics={preferences.visibleMetrics}
                onSendReminder={handleSendReminder}
              />
            )
          )}
        </div>
      )}

      {/* Comms Sequences */}
      {activeView === "sequences" && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-xs text-muted">
            Each sequence triggers automatically based on patient events from your PMS. Toggle on/off per sequence. Timing and channel are configurable per clinic.
          </p>
          {usingDefaults && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-teal/20 bg-teal/5">
              <Zap size={14} className="text-teal shrink-0" />
              <p className="text-xs text-muted">
                These are the default Pulse sequences. They&apos;ll be saved to your clinic once data starts flowing from your PMS.
              </p>
            </div>
          )}
          {sequences
            .filter((seq) => !preferences || preferences.visibleSequenceTypes.includes(seq.sequenceType))
            .map((seq) => {
              const seqStats = statsBySequence[seq.sequenceType] ?? { sent: 0, opened: 0, clicked: 0, rebooked: 0, attributedRevenuePence: 0 };
              return (
                <SequenceCard
                  key={seq.id}
                  definition={seq}
                  stats={seqStats}
                  showRevenue={preferences?.showRevenue ?? false}
                  onToggle={(active) => {
                    toggleSequence(seq.id, active);
                    toast(`${seq.name} ${active ? "enabled" : "disabled"}`, "success");
                  }}
                  onPreview={() => setPreviewSequenceType(seq.sequenceType)}
                />
              );
            })}
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
                          {Boolean((entry as unknown as Record<string, unknown>).triggeredByIntelligence) && (
                            <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#8B5CF612", color: "#8B5CF6" }}>
                              Intelligence
                            </span>
                          )}
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
                              : entry.outcome === "responded"
                                ? "bg-[#0891B2]/10 text-[#0891B2]"
                                : "bg-cloud-dark text-muted"
                          }`}>
                            {entry.outcome === "booked"
                              ? "Rebooked"
                              : entry.outcome === "responded"
                                ? "Responded"
                                : "No action"}
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

      {preferences && (
        <CustomisePanel
          open={customiseOpen}
          onClose={() => setCustomiseOpen(false)}
          preferences={preferences}
          onUpdate={updatePreferences}
        />
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
