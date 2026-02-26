"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import PatientRow from "@/components/ui/PatientRow";
import EmptyState from "@/components/ui/EmptyState";
import DemoBanner from "@/components/ui/DemoBanner";
import { useClinicians } from "@/hooks/useClinicians";
import { usePatients } from "@/hooks/usePatients";
import { useToast } from "@/components/ui/Toast";
import {
  getDemoCommsSequences,
  getDemoCommsLog,
  getDemoCommsStats,
} from "@/hooks/useDemoComms";
import { useDemoPatients } from "@/hooks/useDemoData";
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
} from "lucide-react";

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
  const { clinicians } = useClinicians();
  const { active, churnRisk, postDischarge, loading } = usePatients(selectedClinician);
  const { toast } = useToast();
  const clinicianMap = Object.fromEntries(clinicians.map((c) => [c.id, c]));

  const sequences = getDemoCommsSequences();
  const commsLog = getDemoCommsLog();
  const commsStats = getDemoCommsStats();
  const allPatients = useDemoPatients();
  const patientMap = Object.fromEntries(allPatients.map((p) => [p.id, p]));

  function handleSendReminder(patientId: string) {
    const patient = [...active, ...churnRisk, ...postDischarge].find((p) => p.id === patientId);
    toast(patient ? `Reminder sent to ${patient.name}` : "Reminder sent", "success");
  }

  const channelIcon = (ch: string) =>
    ch === "sms" ? <MessageSquare size={12} /> : <Mail size={12} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Patient Continuity"
        subtitle="Track patient journeys, manage comms sequences, and reduce drop-off"
        clinicians={clinicians}
        selectedClinician={selectedClinician}
        onClinicianChange={setSelectedClinician}
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
        <div className="animate-fade-in">
          <div className="flex items-center gap-6 text-sm mb-4">
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
                    {active.map((p) => (
                      <PatientRow key={p.id} patient={p} clinician={clinicianMap[p.clinicianId]} onSendReminder={handleSendReminder} />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<Users size={24} />} heading="No active patients" subtext="All patients are either at risk or post-discharge." />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={14} className="text-warn" />
                  <h3 className="text-sm font-semibold text-warn">Churn Risk</h3>
                </div>
                {churnRisk.length > 0 ? (
                  <div className="space-y-3">
                    {churnRisk.map((p) => (
                      <PatientRow key={p.id} patient={p} clinician={clinicianMap[p.clinicianId]} onSendReminder={handleSendReminder} />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<AlertTriangle size={24} />} heading="No churn risks" subtext="All patients with 2+ sessions have active rebookings." />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={14} className="text-muted" />
                  <h3 className="text-sm font-semibold text-muted">Post-Discharge</h3>
                </div>
                {postDischarge.length > 0 ? (
                  <div className="space-y-3">
                    {postDischarge.map((p) => (
                      <PatientRow key={p.id} patient={p} clinician={clinicianMap[p.clinicianId]} />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<CheckCircle size={24} />} heading="No recent discharges" subtext="Post-discharge patients within the last 6 weeks will appear here." />
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
    </div>
  );
}
