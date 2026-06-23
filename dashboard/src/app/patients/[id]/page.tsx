"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import StatCard from "@/components/ui/StatCard";

import { usePatients } from "@/hooks/usePatients";
import { useCommsLog } from "@/hooks/useCommsLog";
import { useClinicians } from "@/hooks/useClinicians";
import { LifecycleStateBadge } from "@/components/pulse/LifecycleStateBadge";
import { RiskScoreBadge } from "@/components/pulse/RiskScoreBadge";
import { RiskFactorPanel } from "@/components/pulse/RiskFactorPanel";
import type { Patient } from "@/types";
import type { CommsLogEntry } from "@/types";
import { getInitials, daysSince, formatPercent } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  Activity,
  Mail,
  MessageSquare,
  Shield,
  Clipboard,
  Clock,
  CheckCircle,
  AlertTriangle,
  Star,
  RotateCcw,
  Inbox,
} from "lucide-react";

// ─── Timeline model ───────────────────────────────────────────────────────────
// Every event is derived from a REAL data point on the patient record or a real
// comms_log entry. Nothing is fabricated — no invented NPRS scores, no fake
// session notes. Undated facts (HEP linked, insured) live in the stat row, not
// the timeline, so the timeline only ever shows things that genuinely happened
// on a known date.

interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  detail: string;
  icon: React.ElementType;
  color: string;
}

const SEQ_LABEL = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// daysSince() expects a date-only string (it appends "T00:00:00"); comms_log and
// lifecycle timestamps are full ISO, so normalise everything to YYYY-MM-DD.
const dateOnly = (s: string) => s.split("T")[0];

function buildTimeline(patient: Patient, comms: CommsLogEntry[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (patient.nextSessionDate) {
    events.push({
      id: "next-session",
      date: dateOnly(patient.nextSessionDate),
      title: "Next session booked",
      detail: "Upcoming appointment in the diary.",
      icon: CalendarClock,
      color: "#1C54F2",
    });
  }

  if (patient.lastSessionDate) {
    events.push({
      id: "last-session",
      date: dateOnly(patient.lastSessionDate),
      title: "Last session attended",
      detail: `Session ${patient.sessionCount} of ${patient.treatmentLength}.`,
      icon: CheckCircle,
      color: "#059669",
    });
  }

  if (patient.lifecycleUpdatedAt && patient.lifecycleState) {
    events.push({
      id: "lifecycle",
      date: dateOnly(patient.lifecycleUpdatedAt),
      title: `Lifecycle → ${patient.lifecycleState.replace(/_/g, " ").toLowerCase()}`,
      detail: "Risk engine reclassified this patient on the last pipeline run.",
      icon: Activity,
      color: "#0891B2",
    });
  }

  for (const c of comms) {
    const parts: string[] = [`Via ${c.channel.toUpperCase()}`];
    if (c.stepNumber) parts.push(`step ${c.stepNumber}`);
    if (c.openedAt) parts.push("opened");
    if (c.outcome === "booked") parts.push("patient rebooked");
    else if (c.outcome === "responded") parts.push("patient replied");
    else if (c.outcome === "unsubscribed") parts.push("opted out");
    else if (c.outcome === "send_failed") parts.push("delivery failed");
    if (c.outcome === "responded" && c.npsScore != null) parts.push(`NPS ${c.npsScore}/10`);

    events.push({
      id: c.id,
      date: dateOnly(c.sentAt),
      title: `${SEQ_LABEL(c.sequenceType)} sent`,
      detail: parts.join(" · "),
      icon: c.outcome === "responded" && c.npsScore != null
        ? Star
        : c.channel === "sms"
          ? MessageSquare
          : Mail,
      color: c.outcome === "send_failed" ? "#DC2626" : "#0891B2",
    });
  }

  return events.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

// ─── Timeline card ────────────────────────────────────────────────────────────

function TimelineCard({ timeline }: { timeline: TimelineEvent[] }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-white surface-lit border border-border shadow-[var(--shadow-card)] p-6">
      <h3 className="font-display text-lg text-navy mb-4">Activity Timeline</h3>

      {timeline.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-11 h-11 rounded-full bg-cloud-dark/60 flex items-center justify-center mb-3">
            <Inbox size={18} className="text-muted" />
          </div>
          <p className="text-sm font-medium text-navy">No activity yet</p>
          <p className="text-xs text-muted mt-1 max-w-xs">
            Sessions, lifecycle changes and Pulse comms will appear here as soon
            as they happen for this patient.
          </p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[15px] top-1 bottom-1 w-px bg-gradient-to-b from-teal/40 via-border to-transparent" />
          <div className="space-y-5">
            {timeline.map((event, i) => {
              const Icon = event.icon;
              return (
                <div
                  key={event.id}
                  className="flex gap-4 relative animate-fade-in"
                  style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 relative z-10 ring-4 ring-white"
                    style={{ background: `${event.color}15` }}
                  >
                    <Icon size={14} style={{ color: event.color }} />
                  </div>
                  <div className="flex-1 pb-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
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
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { patients, loading } = usePatients();
  const { commsLog } = useCommsLog();
  const { clinicians } = useClinicians();

  const patient = useMemo(() => patients.find((p) => p.id === id), [patients, id]);
  const clinician = clinicians.find((c) => c.id === patient?.clinicianId);
  const patientComms = useMemo(
    () => commsLog.filter((c) => c.patientId === id),
    [commsLog, id],
  );
  const timeline = useMemo(
    () => (patient ? buildTimeline(patient, patientComms) : []),
    [patient, patientComms],
  );

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading && !patient) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-4 w-28 bg-cloud-dark/60 rounded" />
        <div className="h-28 bg-cloud-dark/40 rounded-[var(--radius-card)]" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-cloud-dark/40 rounded-[var(--radius-card)]" />
          ))}
        </div>
        <div className="h-64 bg-cloud-dark/40 rounded-[var(--radius-card)]" />
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-cloud-dark/60 flex items-center justify-center mb-4">
          <AlertTriangle size={20} className="text-muted" />
        </div>
        <p className="text-navy font-medium">Patient not found</p>
        <p className="text-xs text-muted mt-1 max-w-xs">
          This patient is not in your caseload, or the record no longer exists.
        </p>
        <Link href="/continuity" className="text-teal text-sm mt-3 inline-flex items-center gap-1.5">
          <ArrowLeft size={13} /> Back to Pulse
        </Link>
      </div>
    );
  }

  const progress = Math.round((patient.sessionCount / patient.treatmentLength) * 100);
  const lastGap = patient.lastSessionDate ? daysSince(patient.lastSessionDate) : null;

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
      <div className="relative rounded-[var(--radius-card)] bg-white surface-lit border border-border shadow-[var(--shadow-card)] p-6 overflow-hidden">
        {/* Pulse-teal atmosphere */}
        <div
          className="pointer-events-none absolute -top-16 -right-12 w-56 h-56 rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #0891B2 0%, transparent 70%)" }}
        />
        <div className="flex items-start gap-4 relative">
          <div className="w-14 h-14 rounded-full bg-navy flex items-center justify-center text-lg font-bold text-white shrink-0 ring-2 ring-teal/20">
            {getInitials(patient.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display text-2xl text-navy">{patient.name}</h1>
              {patient.lifecycleState && <LifecycleStateBadge state={patient.lifecycleState} />}
              {typeof patient.riskScore === "number" && (
                <RiskScoreBadge score={patient.riskScore} size="sm" />
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
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
          value={lastGap != null ? `${lastGap}d` : "—"}
          unit="ago"
          status={lastGap != null && lastGap > 14 ? "danger" : "ok"}
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

      {/* Two-column: risk composite + course progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk composite */}
        <div className="rounded-[var(--radius-card)] bg-white surface-lit border border-border shadow-[var(--shadow-card)] p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-navy">Dropout Risk</h3>
            {typeof patient.riskScore === "number"
              ? <RiskScoreBadge score={patient.riskScore} />
              : <span className="text-[10px] text-muted">Not scored yet</span>}
          </div>
          {patient.riskFactors ? (
            <RiskFactorPanel factors={patient.riskFactors} />
          ) : (
            <p className="text-xs text-muted mt-2">
              Risk factors populate on the next pipeline run once this patient has
              attendance and HEP signals.
            </p>
          )}
        </div>

        {/* Course progress */}
        <div className="rounded-[var(--radius-card)] bg-white surface-lit border border-border shadow-[var(--shadow-card)] p-5">
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
          <div className="flex flex-wrap gap-1.5 mt-3">
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
          {patient.hepProgramId && (
            <div className="flex items-center gap-1.5 mt-4 text-[11px] text-muted">
              <Clipboard size={12} className="text-blue" />
              HEP programme linked
            </div>
          )}
          {patient.nextSessionDate ? (
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted">
              <Calendar size={12} className="text-success" />
              Next session in {daysSince(patient.nextSessionDate)} days
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-warn">
              <RotateCcw size={12} />
              No next session booked
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <TimelineCard timeline={timeline} />
    </div>
  );
}
