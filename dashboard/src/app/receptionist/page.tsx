"use client";

import { useState, useMemo } from "react";
import {
  Settings,
  Clock,
  CheckCircle,
  Mic,
  BarChart3,
  ChevronDown,
  ChevronUp,
  FileText,
  Voicemail,
  Moon,
  PoundSterling,
  Radio,
} from "lucide-react";
import { SPIRES_AVA_PROMPT } from "@/lib/retell/ava-prompt";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import DemoBanner from "@/components/ui/DemoBanner";
import { formatPercent } from "@/lib/utils";
import { useCallLogs } from "@/hooks/useCallLogs";
import type { VoiceInteraction } from "@/lib/firebase/voiceInteractions";

type View = "dashboard" | "config";

const AVG_APPOINTMENT_VALUE = 85;

// Map Retell outcome → display config
const OUTCOME_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  booked: { bg: "bg-success/10", text: "text-success", label: "Booked" },
  follow_up_required: { bg: "bg-warn/10", text: "text-warn", label: "Cancelled" },
  resolved: { bg: "bg-blue/10", text: "text-blue", label: "Info" },
  voicemail: { bg: "bg-danger/10", text: "text-danger", label: "Missed" },
  escalated: { bg: "bg-purple-100", text: "text-purple-600", label: "Escalated" },
  // Fallback for legacy demo data
  cancelled: { bg: "bg-warn/10", text: "text-warn", label: "Cancelled" },
  info: { bg: "bg-blue/10", text: "text-blue", label: "Info" },
  missed: { bg: "bg-danger/10", text: "text-danger", label: "Missed" },
  transferred: { bg: "bg-purple-100", text: "text-purple-600", label: "Transferred" },
};

function formatTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDuration(secs: number | null): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-xl p-3 shadow-[var(--shadow-elevated)]">
      <p className="text-xs font-semibold text-navy">
        {label}: {payload[0].value} calls
      </p>
    </div>
  );
}

// Build 7-day volume buckets from live call data
function buildVolumeBuckets(calls: VoiceInteraction[]) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts: Record<string, number> = {};
  days.forEach((d) => (counts[d] = 0));

  const weekAgo = Date.now() - 7 * 86_400_000;
  for (const call of calls) {
    if (!call.startTimestamp || call.startTimestamp < weekAgo) continue;
    const day = days[new Date(call.startTimestamp).getDay()];
    counts[day] = (counts[day] ?? 0) + 1;
  }

  // Rotate so today is last
  const todayIdx = new Date().getDay();
  const ordered = [...days.slice(todayIdx + 1), ...days.slice(0, todayIdx + 1)];
  return ordered.map((day) => ({ day, calls: counts[day] ?? 0 }));
}

export default function ReceptionistPage() {
  const { calls, isDemo, isLoading, activeCall } = useCallLogs();
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);
  const [digestExpanded, setDigestExpanded] = useState(false);

  // Stats derived from live/demo calls
  const todaysCalls = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return calls.filter(
      (c) => !c.startTimestamp || c.startTimestamp >= todayStart.getTime()
    );
  }, [calls]);

  const totalCalls = todaysCalls.length;
  const booked = todaysCalls.filter((c) => c.outcome === "booked").length;
  const missed = todaysCalls.filter(
    (c) => c.outcome === "voicemail" || c.inVoicemail
  ).length;
  const infoOnly = todaysCalls.filter((c) => c.outcome === "resolved").length;
  const avgDurationSecs =
    totalCalls > 0
      ? Math.round(
          todaysCalls.reduce((s, c) => s + (c.durationSeconds ?? 0), 0) /
            totalCalls
        )
      : 0;
  const revenueCaptured = booked * AVG_APPOINTMENT_VALUE;

  const volumeData = useMemo(() => buildVolumeBuckets(calls), [calls]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Ava"
          subtitle="AI call handling — today's calls, booking outcomes, and 7-day volume"
          accentColor="#1C54F2"
        />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] bg-white border border-border h-24 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Ava"
        subtitle="AI call handling — today's calls, booking outcomes, and 7-day volume"
        accentColor="#1C54F2"
      />

      {isDemo && <DemoBanner />}

      {/* Active call indicator */}
      {activeCall && (
        <div className="rounded-[var(--radius-card)] bg-blue/5 border border-blue/20 p-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue animate-pulse" />
          <Radio size={16} className="text-blue" />
          <span className="text-sm font-medium text-navy">
            Call in progress
          </span>
          {activeCall.callerPhone && (
            <span className="text-sm text-muted">{activeCall.callerPhone}</span>
          )}
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-cloud-light rounded-xl p-1 border border-border w-fit">
        {(
          [
            { id: "dashboard" as const, label: "Call Dashboard", icon: BarChart3 },
            { id: "config" as const, label: "Configuration", icon: Settings },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
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

      {activeView === "dashboard" && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <StatCard label="Total Calls" value={totalCalls} unit="today" status="neutral" />
            <StatCard
              label="Booked"
              value={booked}
              status="ok"
              insight={totalCalls > 0 ? formatPercent(booked / totalCalls) : undefined}
            />
            <StatCard
              label="Missed / VM"
              value={missed}
              status={missed > 2 ? "danger" : missed > 0 ? "warn" : "ok"}
            />
            <StatCard label="Info Only" value={infoOnly} status="neutral" />
            <StatCard
              label="Avg Duration"
              value={formatDuration(avgDurationSecs)}
              unit="min:sec"
              status="neutral"
            />
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 mb-1">
                <PoundSterling size={13} className="text-success" />
                <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                  Revenue Captured
                </span>
              </div>
              <span className="font-display text-2xl text-navy">
                £{revenueCaptured}
              </span>
              <span className="text-[11px] text-muted">
                est. from {booked} bookings · £{AVG_APPOINTMENT_VALUE} avg
              </span>
            </div>
          </div>

          {/* 7-day call volume chart */}
          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
            <h3 className="font-display text-lg text-navy mb-1">7-Day Call Volume</h3>
            <p className="text-xs text-muted mb-4">Calls handled by Ava this week</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={volumeData}
                margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="#E2DFDA"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E2DFDA" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="calls" name="Calls" radius={[6, 6, 0, 0]}>
                  {volumeData.map((d) => (
                    <Cell
                      key={d.day}
                      fill={
                        d.calls > 15
                          ? "#1C54F2"
                          : d.calls > 5
                          ? "#0891B2"
                          : "#E2DFDA"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Today's call log */}
          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <div className="p-6 pb-0">
              <h3 className="font-display text-lg text-navy mb-1">
                Today&apos;s Calls
              </h3>
              <p className="text-xs text-muted mb-4">
                Real-time log of Ava-handled calls
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-cloud-light/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">
                      Time
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">
                      Caller
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">
                      Phone
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">
                      Duration
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">
                      Summary
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">
                      Outcome
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {todaysCalls.map((call) => {
                    const outcomeKey = call.outcome ?? "resolved";
                    const oc =
                      OUTCOME_COLORS[outcomeKey] ?? OUTCOME_COLORS.resolved;
                    const isExpanded = expandedCallId === call.id;
                    const hasTranscript = !!call.transcript;

                    return (
                      <>
                        <tr
                          key={call.id}
                          className={`border-b border-border/50 transition-colors ${
                            hasTranscript
                              ? "cursor-pointer hover:bg-cloud-light/40"
                              : "hover:bg-cloud-light/30"
                          } ${isExpanded ? "bg-cloud-light/40" : ""}`}
                          onClick={() =>
                            hasTranscript &&
                            setExpandedCallId(isExpanded ? null : call.id)
                          }
                        >
                          <td className="py-3 px-4 text-navy font-medium">
                            <div className="flex items-center gap-2">
                              <Clock size={12} className="text-muted" />
                              {call.callStatus === "ongoing" ? (
                                <span className="flex items-center gap-1 text-blue">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue animate-pulse" />
                                  Live
                                </span>
                              ) : (
                                formatTime(call.startTimestamp)
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-navy">
                            <div className="flex items-center gap-2">
                              {call.inVoicemail && (
                                <Voicemail
                                  size={13}
                                  className="text-warn shrink-0"
                                />
                              )}
                              {call.patientId ? (
                                <span className="font-medium">
                                  {call.patientId}
                                </span>
                              ) : (
                                <span className="text-muted italic text-xs">
                                  Unknown caller
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-muted text-xs">
                            {call.callerPhone ?? "—"}
                          </td>
                          <td className="py-3 px-4 text-muted">
                            {formatDuration(call.durationSeconds)}
                          </td>
                          <td className="py-3 px-4 text-muted text-xs max-w-xs truncate">
                            {call.callSummary ??
                              call.reasonForCall ??
                              "—"}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${oc.bg} ${oc.text}`}
                            >
                              {oc.label}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && call.transcript && (
                          <tr
                            key={`${call.id}-transcript`}
                            className="border-b border-border/50 bg-warn/5"
                          >
                            <td colSpan={6} className="px-4 pb-4 pt-2">
                              <div className="flex items-start gap-2.5">
                                {call.inVoicemail ? (
                                  <Voicemail
                                    size={14}
                                    className="text-warn mt-0.5 shrink-0"
                                  />
                                ) : (
                                  <FileText
                                    size={14}
                                    className="text-blue mt-0.5 shrink-0"
                                  />
                                )}
                                <div>
                                  <p className="text-[11px] font-semibold text-muted mb-1 uppercase tracking-wide">
                                    {call.inVoicemail
                                      ? "Voicemail transcript"
                                      : "Call transcript"}
                                  </p>
                                  <p className="text-sm text-navy leading-relaxed italic">
                                    &ldquo;{call.transcript}&rdquo;
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                  {todaysCalls.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-12 text-center text-sm text-muted"
                      >
                        No calls recorded today yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* After-hours digest preview */}
          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <button
              onClick={() => setDigestExpanded((v) => !v)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-cloud-light/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-navy/5 flex items-center justify-center">
                  <Moon size={15} className="text-navy" />
                </div>
                <div>
                  <h3 className="font-display text-base text-navy">
                    After-Hours Digest
                  </h3>
                  <p className="text-[11px] text-muted">
                    Preview of your morning summary · Sent 08:00 daily
                  </p>
                </div>
              </div>
              {digestExpanded ? (
                <ChevronUp size={16} className="text-muted" />
              ) : (
                <ChevronDown size={16} className="text-muted" />
              )}
            </button>
            {digestExpanded && (
              <div className="border-t border-border p-5">
                <div className="rounded-xl border border-border bg-cloud-light p-5 max-w-xl font-mono text-[12px] leading-relaxed text-navy">
                  <p className="font-bold mb-3">
                    Ava Overnight Summary — {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                  {missed > 0 ? (
                    <>
                      <p className="mb-2">
                        Calls received after hours:{" "}
                        <strong>{missed}</strong>
                      </p>
                      {todaysCalls
                        .filter((c) => c.inVoicemail)
                        .map((c) => (
                          <p key={c.id} className="mb-1">
                            • {formatTime(c.startTimestamp)} —{" "}
                            {c.callerPhone ?? "Unknown"} — voicemail.{" "}
                            <em>Needs callback.</em>
                          </p>
                        ))}
                      <p className="mt-2 mb-1">
                        Action required: <strong>{missed} callback{missed !== 1 ? "s" : ""}</strong>
                      </p>
                    </>
                  ) : (
                    <p className="mb-2">No after-hours voicemails overnight.</p>
                  )}
                  <p className="text-muted mt-3">— Ava, StrydeOS</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeView === "config" && (
        <div className="space-y-6">
          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
            <h3 className="font-display text-lg text-navy mb-4">
              Ava Configuration
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                    Voice Provider
                  </label>
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-success/20 bg-success/5">
                    <Mic size={16} className="text-success" />
                    <span className="text-sm font-medium text-navy">
                      Retell AI
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success ml-auto">
                      Connected
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                    Clinic Phone Number
                  </label>
                  <div className="px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy">
                    020 7794 0202
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                    Operating Hours
                  </label>
                  <div className="px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy">
                    24/7 (after-hours calls logged for morning callback)
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                    Webhook Endpoint
                  </label>
                  <div className="px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy font-mono text-xs break-all">
                    /api/webhooks/retell
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-navy">
                  Call Handling Rules
                </h4>
                {[
                  {
                    label: "New patient booking",
                    desc: "Capture name, complaint, insurance, preferred clinician",
                    enabled: true,
                  },
                  {
                    label: "Cancellation recovery",
                    desc: "Offer to rebook before confirming cancellation",
                    enabled: true,
                  },
                  {
                    label: "No-show follow-up",
                    desc: "Automated call within 2h of missed appointment",
                    enabled: true,
                  },
                  {
                    label: "Emergency routing",
                    desc: "Red-flag triage — direct to 999/A&E for urgent symptoms",
                    enabled: true,
                  },
                  {
                    label: "FAQ handling",
                    desc: "Location, parking, pricing, what to bring",
                    enabled: true,
                  },
                ].map((rule) => (
                  <div
                    key={rule.label}
                    className="flex items-start gap-3 p-3 rounded-xl border border-border/50"
                  >
                    <CheckCircle
                      size={16}
                      className="text-success shrink-0 mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-navy">
                        {rule.label}
                      </p>
                      <p className="text-[11px] text-muted">{rule.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Ava system prompt preview */}
          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <button
              onClick={() => setPromptExpanded((v) => !v)}
              className="w-full flex items-center justify-between p-6 text-left hover:bg-cloud-light/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue/10 flex items-center justify-center">
                  <FileText size={15} className="text-blue" />
                </div>
                <div>
                  <h3 className="font-display text-base text-navy">
                    Ava System Prompt
                  </h3>
                  <p className="text-[11px] text-muted">
                    Read-only · Spires Physiotherapy production prompt
                  </p>
                </div>
              </div>
              {promptExpanded ? (
                <ChevronUp size={16} className="text-muted" />
              ) : (
                <ChevronDown size={16} className="text-muted" />
              )}
            </button>
            {promptExpanded && (
              <div className="border-t border-border px-6 pb-6 pt-4">
                <pre className="text-[11px] text-muted leading-relaxed whitespace-pre-wrap font-mono bg-cloud-light rounded-xl p-4 max-h-[480px] overflow-y-auto border border-border/50">
                  {SPIRES_AVA_PROMPT}
                </pre>
                <p className="text-[11px] text-muted mt-3">
                  Spires-specific variables are pre-resolved. For other clinics,
                  use{" "}
                  <code className="text-navy bg-cloud-light px-1 py-0.5 rounded">
                    buildAvaPrompt()
                  </code>{" "}
                  with clinic-level configuration.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
