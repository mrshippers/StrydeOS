"use client";

import { useState } from "react";
import {
  Phone,
  PhoneIncoming,
  PhoneOff,
  Info,
  Calendar,
  Settings,
  Clock,
  CheckCircle,
  Mic,
  BarChart3,
} from "lucide-react";
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

type View = "dashboard" | "config";

interface DemoCallLog {
  id: string;
  time: string;
  callerPhone: string;
  duration: number;
  outcome: "booked" | "cancelled" | "info" | "missed" | "transferred";
  patientName: string;
  clinicianName?: string;
}

const DEMO_CALLS: DemoCallLog[] = [
  { id: "rc1", time: "09:15", callerPhone: "07912 *** 482", duration: 185, outcome: "booked", patientName: "Sarah Mitchell", clinicianName: "Andrew" },
  { id: "rc2", time: "09:42", callerPhone: "07834 *** 119", duration: 95, outcome: "info", patientName: "Unknown (new enquiry)" },
  { id: "rc3", time: "10:08", callerPhone: "07701 *** 655", duration: 220, outcome: "booked", patientName: "Tom Edwards", clinicianName: "Max" },
  { id: "rc4", time: "11:30", callerPhone: "07456 *** 823", duration: 140, outcome: "cancelled", patientName: "Lisa Wang" },
  { id: "rc5", time: "12:15", callerPhone: "07923 *** 091", duration: 45, outcome: "missed", patientName: "Unknown" },
  { id: "rc6", time: "14:02", callerPhone: "07812 *** 334", duration: 310, outcome: "transferred", patientName: "Mark Jeffries" },
  { id: "rc7", time: "15:20", callerPhone: "07665 *** 712", duration: 175, outcome: "booked", patientName: "Amy Richardson", clinicianName: "Jamal" },
  { id: "rc8", time: "16:45", callerPhone: "07534 *** 208", duration: 120, outcome: "booked", patientName: "David Chen", clinicianName: "Andrew" },
];

const CALL_VOLUME_DATA = [
  { day: "Mon", calls: 12 },
  { day: "Tue", calls: 15 },
  { day: "Wed", calls: 18 },
  { day: "Thu", calls: 14 },
  { day: "Fri", calls: 11 },
  { day: "Sat", calls: 3 },
  { day: "Sun", calls: 1 },
];

const OUTCOME_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  booked: { bg: "bg-success/10", text: "text-success", label: "Booked" },
  cancelled: { bg: "bg-warn/10", text: "text-warn", label: "Cancelled" },
  info: { bg: "bg-blue/10", text: "text-blue", label: "Info" },
  missed: { bg: "bg-danger/10", text: "text-danger", label: "Missed" },
  transferred: { bg: "bg-purple-100", text: "text-purple-600", label: "Transferred" },
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-xl p-3 shadow-[var(--shadow-elevated)]">
      <p className="text-xs font-semibold text-navy">{label}: {payload[0].value} calls</p>
    </div>
  );
}

export default function ReceptionistPage() {
  const [isConnected] = useState(true);
  const [activeView, setActiveView] = useState<View>("dashboard");

  const totalCalls = DEMO_CALLS.length;
  const booked = DEMO_CALLS.filter((c) => c.outcome === "booked").length;
  const missed = DEMO_CALLS.filter((c) => c.outcome === "missed").length;
  const infoOnly = DEMO_CALLS.filter((c) => c.outcome === "info").length;
  const avgDuration = Math.round(DEMO_CALLS.reduce((s, c) => s + c.duration, 0) / totalCalls);

  if (!isConnected) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Receptionist" subtitle="AI call handling, booking stats, and call intelligence" />
        <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue/10 flex items-center justify-center mx-auto mb-5">
            <Phone size={28} className="text-blue" />
          </div>
          <h2 className="font-display text-2xl text-navy mb-2">StrydeOS Receptionist isn&apos;t connected yet</h2>
          <p className="text-sm text-muted max-w-lg mx-auto mb-8 leading-relaxed">
            Once connected, this page will show real-time call logs, booking outcomes, and 7-day call volume trends.
          </p>
          <div className="rounded-xl bg-cloud-light border border-border p-6 max-w-md mx-auto text-left">
            <h3 className="text-sm font-semibold text-navy mb-3">To get started:</h3>
            <ol className="space-y-2 text-sm text-muted">
              <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue/10 text-blue text-[11px] font-bold flex items-center justify-center shrink-0">1</span>Contact your StrydeOS account manager</li>
              <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue/10 text-blue text-[11px] font-bold flex items-center justify-center shrink-0">2</span>Provide your clinic phone number and PMS credentials</li>
              <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue/10 text-blue text-[11px] font-bold flex items-center justify-center shrink-0">3</span>We&apos;ll configure call routing and test within 48 hours</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Receptionist" subtitle="AI call handling — today&apos;s calls, booking outcomes, and 7-day volume" />
      <DemoBanner />

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-cloud-light rounded-xl p-1 border border-border w-fit">
        {([
          { id: "dashboard" as const, label: "Call Dashboard", icon: BarChart3 },
          { id: "config" as const, label: "Configuration", icon: Settings },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeView === id ? "bg-white text-navy shadow-[var(--shadow-card)]" : "text-muted hover:text-navy"
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Total Calls" value={totalCalls} unit="today" status="neutral" />
            <StatCard label="Booked" value={booked} status="ok" insight={formatPercent(booked / totalCalls)} />
            <StatCard label="Missed" value={missed} status={missed > 2 ? "danger" : missed > 0 ? "warn" : "ok"} />
            <StatCard label="Info Only" value={infoOnly} status="neutral" />
            <StatCard label="Avg Duration" value={`${Math.floor(avgDuration / 60)}:${String(avgDuration % 60).padStart(2, "0")}`} unit="min:sec" status="neutral" />
          </div>

          {/* 7-day call volume chart */}
          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
            <h3 className="font-display text-lg text-navy mb-1">7-Day Call Volume</h3>
            <p className="text-xs text-muted mb-4">Calls handled by your AI receptionist this week</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={CALL_VOLUME_DATA} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#DDD9D3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#6B7280" }} tickLine={false} axisLine={{ stroke: "#DDD9D3" }} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} width={30} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="calls" name="Calls" radius={[6, 6, 0, 0]}>
                  {CALL_VOLUME_DATA.map((d) => (
                    <Cell key={d.day} fill={d.calls > 15 ? "#1A5CDB" : d.calls > 5 ? "#0891B2" : "#DDD9D3"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Today's call log */}
          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <div className="p-6 pb-0">
              <h3 className="font-display text-lg text-navy mb-1">Today&apos;s Calls</h3>
              <p className="text-xs text-muted mb-4">Real-time log of AI-handled calls</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-cloud-light/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Time</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Patient</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Phone</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Duration</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Clinician</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {DEMO_CALLS.map((call) => {
                    const oc = OUTCOME_COLORS[call.outcome];
                    const mins = Math.floor(call.duration / 60);
                    const secs = call.duration % 60;
                    return (
                      <tr key={call.id} className="border-b border-border/50 hover:bg-cloud-light/30 transition-colors">
                        <td className="py-3 px-4 text-navy font-medium flex items-center gap-2">
                          <Clock size={12} className="text-muted" />
                          {call.time}
                        </td>
                        <td className="py-3 px-4 text-navy">{call.patientName}</td>
                        <td className="py-3 px-4 text-muted text-xs">{call.callerPhone}</td>
                        <td className="py-3 px-4 text-muted">{mins}:{String(secs).padStart(2, "0")}</td>
                        <td className="py-3 px-4 text-navy">{call.clinicianName ?? "—"}</td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${oc.bg} ${oc.text}`}>
                            {oc.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeView === "config" && (
        <div className="space-y-6">
          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
            <h3 className="font-display text-lg text-navy mb-4">Voice Agent Configuration</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Voice Provider</label>
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-success/20 bg-success/5">
                    <Mic size={16} className="text-success" />
                    <span className="text-sm font-medium text-navy">Retell AI</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success ml-auto">Connected</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Clinic Phone Number</label>
                  <div className="px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy">020 7794 0202</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Operating Hours</label>
                  <div className="px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy">24/7 (after-hours calls logged for morning callback)</div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-navy">Call Handling Rules</h4>
                {[
                  { label: "New patient booking", desc: "Capture name, complaint, insurance, preferred clinician", enabled: true },
                  { label: "Cancellation recovery", desc: "Attempt to rebook before confirming cancellation", enabled: true },
                  { label: "No-show follow-up", desc: "Automated call within 2h of missed appointment", enabled: true },
                  { label: "Emergency routing", desc: "Transfer to on-call clinician for urgent keywords", enabled: true },
                  { label: "FAQ handling", desc: "Parking, location, what to bring, insurance questions", enabled: true },
                ].map((rule) => (
                  <div key={rule.label} className="flex items-start gap-3 p-3 rounded-xl border border-border/50">
                    <CheckCircle size={16} className="text-success shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-navy">{rule.label}</p>
                      <p className="text-[11px] text-muted">{rule.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
