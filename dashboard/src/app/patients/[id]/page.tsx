"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";

import { useDemoPatients } from "@/hooks/useDemoData";
import { useClinicians } from "@/hooks/useClinicians";
import { getDemoCommsLog } from "@/hooks/useDemoComms";
import { getInitials, daysSince, formatPercent } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  Activity,
  Mail,
  MessageSquare,
  Shield,
  Clipboard,
  Clock,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

interface TimelineEvent {
  id: string;
  type: "session" | "comms" | "outcome" | "hep" | "insurance";
  date: string;
  title: string;
  detail: string;
  icon: React.ElementType;
  color: string;
}

function buildTimeline(patientId: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const commsLog = getDemoCommsLog().filter((c) => c.patientId === patientId);

  events.push({
    id: "s1",
    type: "session",
    date: "2026-02-17",
    title: "Session completed",
    detail: "Follow-up session. NPRS 3/10 (was 5/10). Progressing well.",
    icon: CheckCircle,
    color: "#059669",
  });

  events.push({
    id: "h1",
    type: "hep",
    date: "2026-02-17",
    title: "HEP programme updated",
    detail: "6 exercises assigned. Phase 2 - strengthening.",
    icon: Clipboard,
    color: "#1C54F2",
  });

  events.push({
    id: "o1",
    type: "outcome",
    date: "2026-02-17",
    title: "NPRS recorded",
    detail: "Score: 3/10 (improved from 5/10 at initial assessment)",
    icon: Activity,
    color: "#8B5CF6",
  });

  for (const c of commsLog) {
    events.push({
      id: c.id,
      type: "comms",
      date: c.sentAt.split("T")[0],
      title: `${c.sequenceType.replace(/_/g, " ")} sent`,
      detail: `Via ${c.channel.toUpperCase()}${c.openedAt ? " — opened" : ""}${c.outcome === "booked" ? " — patient rebooked" : ""}${c.outcome === "responded" && c.npsScore != null ? ` — NPS: ${c.npsScore}/10` : ""}`,
      icon: c.channel === "sms" ? MessageSquare : Mail,
      color: "#0891B2",
    });
  }

  events.push({
    id: "s0",
    type: "session",
    date: "2026-02-10",
    title: "Session completed",
    detail: "Follow-up. Manual therapy + exercise review. Progressing.",
    icon: CheckCircle,
    color: "#059669",
  });

  events.push({
    id: "ia",
    type: "session",
    date: "2026-02-03",
    title: "Initial assessment",
    detail: "Low back pain. NPRS 5/10. 6-session treatment planned.",
    icon: Calendar,
    color: "#1C54F2",
  });

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const patients = useDemoPatients();
  const { clinicians } = useClinicians();
  const patient = patients.find((p) => p.id === id);
  const clinician = clinicians.find((c) => c.id === patient?.clinicianId);
  const timeline = useMemo(() => buildTimeline(id), [id]);

  if (!patient) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted">Patient not found</p>
        <Link href="/continuity" className="text-blue text-sm mt-2 inline-block">
          Back to Pulse
        </Link>
      </div>
    );
  }

  const progress = Math.round((patient.sessionCount / patient.treatmentLength) * 100);

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        href="/continuity"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Pulse
      </Link>

      {/* Patient header */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-navy flex items-center justify-center text-lg font-bold text-white shrink-0">
            {getInitials(patient.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl text-navy">{patient.name}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {clinician && (
                <span className="text-sm text-muted">
                  Treating clinician: <span className="font-medium text-navy">{clinician.name}</span>
                </span>
              )}
              {patient.insuranceFlag && (
                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue/10 text-blue">
                  <Shield size={10} />
                  {patient.insurerName ?? "Insured"}
                </span>
              )}
              {patient.churnRisk && (
                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warn/10 text-warn border border-warn/20">
                  <AlertTriangle size={10} />
                  Churn risk
                </span>
              )}
              {patient.discharged && (
                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success">
                  <CheckCircle size={10} />
                  Discharged
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Treatment Progress"
          value={formatPercent(progress / 100)}
          unit={`${patient.sessionCount}/${patient.treatmentLength}`}
          status={progress >= 80 ? "ok" : progress >= 50 ? "warn" : "neutral"}
        />
        <StatCard
          label="Last Session"
          value={patient.lastSessionDate ? `${daysSince(patient.lastSessionDate)}d` : "—"}
          unit="ago"
          status={patient.lastSessionDate && daysSince(patient.lastSessionDate) > 14 ? "danger" : "ok"}
        />
        <StatCard
          label="Next Session"
          value={patient.nextSessionDate ? `${daysSince(patient.nextSessionDate)}d` : "None"}
          unit={patient.nextSessionDate ? "" : "booked"}
          status={patient.nextSessionDate ? "ok" : "warn"}
        />
        <StatCard
          label="Pre-Auth"
          value={patient.preAuthStatus.replace("_", " ")}
          status={patient.preAuthStatus === "confirmed" ? "ok" : patient.preAuthStatus === "pending" ? "warn" : "neutral"}
        />
        <StatCard
          label="HEP Status"
          value={patient.hepProgramId ? "Active" : "None"}
          status={patient.hepProgramId ? "ok" : "warn"}
          insight={patient.hepProgramId ? "HEP programme linked" : "No programme assigned"}
        />
      </div>

      {/* Course progress bar */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-navy">Treatment Progress</h3>
          <span className="text-sm font-bold text-navy">{progress}%</span>
        </div>
        <div className="h-3 bg-cloud-dark rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progress}%`,
              background: progress >= 80 ? "#059669" : progress >= 50 ? "#1C54F2" : "#F59E0B",
            }}
          />
        </div>
        <div className="flex justify-between mt-2">
          {Array.from({ length: patient.treatmentLength }, (_, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                i < patient.sessionCount
                  ? "bg-success text-white"
                  : "bg-cloud-dark text-muted"
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <h3 className="font-display text-lg text-navy mb-4">Activity Timeline</h3>
        <div className="relative">
          <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />
          <div className="space-y-5">
            {timeline.map((event) => {
              const Icon = event.icon;
              return (
                <div key={event.id} className="flex gap-4 relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 relative z-10"
                    style={{ background: `${event.color}15` }}
                  >
                    <Icon size={14} style={{ color: event.color }} />
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-navy">{event.title}</span>
                      <span className="text-[10px] text-muted flex items-center gap-1">
                        <Clock size={9} />
                        {daysSince(event.date)}d ago
                      </span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">{event.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
