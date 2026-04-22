"use client";

import { useState, useCallback, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  Cell,
} from "recharts";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";

import ErrorBanner from "@/components/ui/ErrorBanner";
import { useAuth } from "@/hooks/useAuth";
import { useClinicians } from "@/hooks/useClinicians";
import { useWeeklyStats } from "@/hooks/useWeeklyStats";
import { useIntelligenceData } from "@/hooks/useIntelligenceData";
import { usePatients } from "@/hooks/usePatients";
import { useValueLedger } from "@/hooks/useValueLedger";
import { recordOutcomeScores } from "@/lib/queries";
import { brand } from "@/lib/brand";
import type { OutcomeMeasureType, Patient } from "@/types";
import { formatPence, formatPercent, formatWeekDate } from "@/lib/utils";
import InsightFeed from "@/components/intelligence/InsightFeed";
import KpiProjectionStrip from "@/components/intelligence/KpiProjectionStrip";
import EventsActionedByPulseTile from "@/components/intelligence/EventsActionedByPulseTile";
import {
  PoundSterling,
  TrendingUp,
  Users,
  AlertTriangle,
  Star,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  GitBranch,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Lightbulb,
  Gem,
  Clock,
  UserMinus,
  UserPlus,
  Shield,
  RefreshCw,
} from "lucide-react";

type Tab = "insights" | "revenue" | "dna" | "referrals" | "outcomes" | "reputation" | "value";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "insights", label: "Insights", icon: Lightbulb },
  { id: "revenue", label: "Revenue", icon: PoundSterling },
  { id: "dna", label: "DNA Analysis", icon: AlertTriangle },
  { id: "referrals", label: "Referrals", icon: GitBranch },
  { id: "outcomes", label: "Outcomes", icon: Activity },
  { id: "reputation", label: "Reputation", icon: Star },
  { id: "value", label: "Value", icon: Gem },
];

const BAR_COLORS = [brand.blue, brand.teal, brand.purple, brand.success, brand.warning];

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string; fill?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-cream border border-border rounded-xl p-3 shadow-[var(--shadow-elevated)]">
      <p className="text-xs font-semibold text-navy mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs mb-0.5">
          <div className="w-2 h-2 rounded-full" style={{ background: entry.color || entry.fill }} />
          <span className="text-muted">{entry.name}:</span>
          <span className="font-semibold text-navy">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

const OUTCOME_MEASURES = [
  { key: "nprs", label: "NPRS — Pain", description: "0 = no pain, 10 = worst pain", min: 0, max: 10, lowerIsBetter: true },
  { key: "psfs", label: "PSFS — Function", description: "0 = unable to perform, 10 = fully able", min: 0, max: 10, lowerIsBetter: false },
  { key: "quickdash", label: "QuickDASH — Upper Limb", description: "0 = no disability, 100 = complete disability", min: 0, max: 100, lowerIsBetter: true },
  { key: "odi", label: "ODI — Lumbar Spine", description: "0 = no disability, 100 = complete disability", min: 0, max: 100, lowerIsBetter: true },
  { key: "ndi", label: "NDI — Cervical Spine", description: "0 = no disability, 50 = complete disability", min: 0, max: 50, lowerIsBetter: true },
] as const;

function OutcomeScoreEntry({
  patients,
  clinicId,
  currentUserId,
}: {
  patients: Patient[];
  clinicId: string | null;
  currentUserId: string;
}) {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const activePatientId = selectedPatientId || patients[0]?.id || "";
  const selectedPatient = patients.find((p) => p.id === activePatientId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!clinicId || !activePatientId) return;
    submittingRef.current = true;

    const validKeys = new Set<string>(OUTCOME_MEASURES.map((m) => m.key));
    const entries = Object.entries(scores)
      .filter(([k, v]) => v !== "" && validKeys.has(k))
      .map(([measureType, value]) => ({
        patientId: activePatientId,
        clinicianId: selectedPatient?.clinicianId ?? "",
        measureType: measureType as OutcomeMeasureType,
        score: parseFloat(value),
        recordedAt: new Date(`${sessionDate}T12:00:00`).toISOString(),
        recordedBy: currentUserId,
      }));

    if (entries.length === 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      await recordOutcomeScores(clinicId, entries);
      setSubmitted(true);
      setScores({});
      setTimeout(() => setSubmitted(false), 3000);
    } catch {
      setSaveError("Failed to save scores. Please try again.");
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
      <h3 className="font-display text-lg text-navy mb-1">Record Outcome Scores</h3>
      <p className="text-xs text-muted mb-5">
        Enter standardised outcome measure scores for a patient session. Scores are stored per-session and aggregated at practice level.
      </p>
      {submitted ? (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-success/10 border border-success/20">
          <Activity size={16} className="text-success" />
          <p className="text-sm font-semibold text-success">Outcome scores recorded successfully</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Patient</label>
              <select
                value={activePatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                {patients.length === 0 && <option value="">No patients loaded</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Session date</label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {OUTCOME_MEASURES.map((m) => (
              <div key={m.key} className="rounded-xl border border-border p-3 bg-cloud-light/40">
                <label className="block text-xs font-semibold text-navy mb-0.5">{m.label}</label>
                <p className="text-[10px] text-muted mb-2">{m.description}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={m.min}
                    max={m.max}
                    step={0.1}
                    value={scores[m.key] ?? ""}
                    onChange={(e) => setScores((s) => ({ ...s, [m.key]: e.target.value }))}
                    placeholder="—"
                    className="w-20 px-2 py-1.5 rounded-lg border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-blue/30 text-center"
                  />
                  <span className="text-[11px] text-muted">/ {m.max}</span>
                  {scores[m.key] && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      m.lowerIsBetter
                        ? Number(scores[m.key]) <= m.max * 0.4 ? "bg-success/10 text-success" : Number(scores[m.key]) <= m.max * 0.6 ? "bg-warn/10 text-warn" : "bg-danger/10 text-danger"
                        : Number(scores[m.key]) >= m.max * 0.6 ? "bg-success/10 text-success" : Number(scores[m.key]) >= m.max * 0.4 ? "bg-warn/10 text-warn" : "bg-danger/10 text-danger"
                    }`}>
                      {m.lowerIsBetter
                        ? Number(scores[m.key]) <= m.max * 0.4 ? "Good" : Number(scores[m.key]) <= m.max * 0.6 ? "Moderate" : "Severe"
                        : Number(scores[m.key]) >= m.max * 0.6 ? "Good" : Number(scores[m.key]) >= m.max * 0.4 ? "Moderate" : "Severe"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {saveError && (
            <p className="text-xs text-danger font-medium">{saveError}</p>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-muted">Leave blank for any measures not used this session</p>
            <button
              type="submit"
              disabled={Object.keys(scores).filter((k) => scores[k] !== "").length === 0 || saving}
              className="btn-primary btn-primary-purple"
            >
              {saving ? "Saving…" : "Save Scores"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function MiniSparkline({ data: rawData, color, higherIsBetter }: { data: number[]; color: string; higherIsBetter?: boolean }) {
  const data = rawData.filter((v) => Number.isFinite(v));
  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 72;
  const h = 28;
  const divisor = data.length > 1 ? data.length - 1 : 1;
  const points = data.map((v, i) => {
    const x = (i / divisor) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const lastUp = data.length >= 2 ? data[data.length - 1] >= data[data.length - 2] : true;
  const trending = higherIsBetter ? lastUp : !lastUp;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={trending ? color : brand.danger}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      {data.map((v, i) => {
        const x = (i / divisor) * w;
        const y = h - ((v - min) / range) * h;
        return i === data.length - 1 ? (
          <circle key={i} cx={x} cy={y} r={3} fill={trending ? color : brand.danger} />
        ) : null;
      })}
    </svg>
  );
}

// ─── Value Tab ────────────────────────────────────────────────────────────────


const MODULE_DESCRIPTIONS: Record<string, (s: { callsHandled?: number; bookingsFromAva?: number; patientsReengaged?: number; insightsActedOn?: number }) => string> = {
  ava: (s) => `${s.callsHandled ?? 0} calls handled, ${s.bookingsFromAva ?? 0} bookings`,
  pulse: (s) => `${s.patientsReengaged ?? 0} patients re-engaged`,
  intelligence: (s) => `${s.insightsActedOn ?? 0} insights acted on`,
};

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: `${brand.success}15`, text: brand.success, label: "High" },
  medium: { bg: `${brand.warning}15`, text: brand.warning, label: "Medium" },
  low: { bg: `${brand.muted}15`, text: brand.muted, label: "Low" },
};

const MODULE_DOT_COLORS: Record<string, string> = {
  ava: brand.blue,
  pulse: brand.teal,
  intelligence: brand.purple,
};

function ValueTabContent({ valueLedger }: { valueLedger: ReturnType<typeof useValueLedger> }) {
  const {
    summary,
    totalValueThisMonth,
    roiMultiple,
    netValueThisMonth,
    moduleBreakdown,
    topEvents,
    deepMetrics,
    loading,
  } = valueLedger;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="rounded-[var(--radius-card)] bg-white border border-border h-40" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-[var(--radius-card)] bg-white border border-border h-32" />
          ))}
        </div>
        <div className="rounded-[var(--radius-card)] bg-white border border-border h-64" />
      </div>
    );
  }

  if (!summary && topEvents.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-white p-8 text-center" style={{ borderColor: "rgba(139, 92, 246, 0.2)" }}>
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "rgba(139, 92, 246, 0.08)" }}>
          <Gem size={18} style={{ color: brand.purple }} />
        </div>
        <h3 className="font-display text-base text-navy mb-1">Value attribution starts automatically</h3>
        <p className="text-sm text-muted max-w-md mx-auto mb-3">
          As Ava handles calls, Pulse re-engages patients, and Intelligence surfaces insights,
          each measurable outcome is logged here with a conservative £ estimate.
        </p>
        <p className="text-xs text-muted">
          Data will appear once your first attributed events are recorded — typically within a few days of going live.
        </p>
      </div>
    );
  }

  const isPositiveRoi = netValueThisMonth > 0;

  return (
    <div className="space-y-6">
      {/* ── ROI Hero Card ──────────────────────────────────── */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">This Month</p>
            <h2 className="font-display text-3xl md:text-4xl text-navy leading-tight">
              StrydeOS generated {formatPence(totalValueThisMonth)}
            </h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold"
              style={{
                background: isPositiveRoi ? `${brand.success}12` : `${brand.danger}12`,
                color: isPositiveRoi ? brand.success : brand.danger,
              }}
            >
              <TrendingUp size={14} />
              {roiMultiple.toFixed(1)}&times; your subscription
            </span>
            <span
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold"
              style={{
                background: isPositiveRoi ? `${brand.success}08` : `${brand.danger}08`,
                color: isPositiveRoi ? brand.success : brand.danger,
              }}
            >
              {isPositiveRoi ? "+" : ""}{formatPence(netValueThisMonth)} net value
            </span>
          </div>
        </div>
        {summary && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 pt-4 border-t border-border">
            <span className="text-xs text-muted">{summary.totalEvents} events</span>
            <span className="text-xs text-muted">High-confidence: {formatPence(summary.highConfidenceValuePence)}</span>
            <span className="text-xs text-muted">Subscription: {formatPence(summary.subscriptionCostPence)}/mo</span>
          </div>
        )}
      </div>

      {/* ── Module Breakdown ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {moduleBreakdown.map((mod) => (
          <div
            key={mod.module}
            className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: mod.color }} />
            <h4 className="text-sm font-semibold text-navy mb-1 mt-1">{mod.label}</h4>
            <p className="font-display text-2xl text-navy mb-2">{formatPence(mod.totalPence)}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{mod.eventCount} events</span>
              <span className="text-xs text-muted">
                {summary ? MODULE_DESCRIPTIONS[mod.module]?.({
                  callsHandled: summary.callsHandled,
                  bookingsFromAva: summary.bookingsFromAva,
                  patientsReengaged: summary.patientsReengaged,
                  insightsActedOn: summary.insightsActedOn,
                }) : ""}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Attribution Feed ───────────────────────────────── */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <h3 className="font-display text-lg text-navy mb-1">Attribution Feed</h3>
        <p className="text-xs text-muted mb-4">Recent value events sorted by impact — highest first</p>
        {topEvents.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-cloud-light border border-border text-sm text-muted">
            <Gem size={16} className="shrink-0 text-purple" />
            <span>Attribution events will appear here as Ava, Pulse, and Intelligence generate measurable outcomes.</span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {topEvents.map((evt) => {
              const conf = CONFIDENCE_STYLES[evt.confidence] ?? CONFIDENCE_STYLES.low;
              const dotColor = MODULE_DOT_COLORS[evt.module] ?? brand.muted;
              const ts = new Date(evt.attributedAt);
              const timeStr = ts.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " " + ts.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={evt.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: dotColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-navy truncate">{evt.title}</span>
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: conf.bg, color: conf.text }}
                      >
                        {conf.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">{evt.description}</p>
                    <p className="text-[11px] text-muted mt-0.5">{timeStr}</p>
                  </div>
                  <span className="text-sm font-bold text-navy shrink-0 ml-2">{formatPence(evt.valuePence)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Deep Metrics ───────────────────────────────────── */}
      {deepMetrics && (
        <div className="space-y-4">
          <h3 className="font-display text-lg text-navy">Deep Metrics</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Cost of Empty Chair */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${brand.danger}12` }}>
                  <AlertTriangle size={14} style={{ color: brand.danger }} />
                </div>
                <h4 className="text-sm font-semibold text-navy">Cost of Empty Chair</h4>
              </div>
              <p className="font-display text-2xl text-navy mb-1">{formatPence(deepMetrics.costOfEmptyChairPence)}</p>
              <p className="text-xs text-muted mb-2">per week</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{deepMetrics.dnaSlots} DNAs + {deepMetrics.unfilledSlots} unfilled</span>
                <span className="font-semibold text-danger">{formatPence(deepMetrics.costOfEmptyChairAnnualisedPence)}/yr</span>
              </div>
            </div>

            {/* Net Growth */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${brand.success}12` }}>
                  <UserPlus size={14} style={{ color: brand.success }} />
                </div>
                <h4 className="text-sm font-semibold text-navy">Net Growth</h4>
              </div>
              <p className={`font-display text-2xl ${deepMetrics.netGrowth >= 0 ? "text-success" : "text-danger"}`}>
                {deepMetrics.netGrowth >= 0 ? "+" : ""}{deepMetrics.netGrowth}
              </p>
              <p className="text-xs text-muted mb-2">patients this week</p>
              <div className="flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1"><UserPlus size={11} className="text-success" /> {deepMetrics.newPatients} new</span>
                <span className="flex items-center gap-1"><UserMinus size={11} className="text-muted" /> {deepMetrics.dischargedPatients} discharged</span>
                <span className="flex items-center gap-1"><AlertTriangle size={11} className="text-warning" /> {deepMetrics.ghostPatients} ghost</span>
              </div>
            </div>

            {/* Rebooking Lag */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${brand.warning}12` }}>
                  <Clock size={14} style={{ color: brand.warning }} />
                </div>
                <h4 className="text-sm font-semibold text-navy">Rebooking Lag</h4>
              </div>
              <p className="font-display text-2xl text-navy mb-1">{deepMetrics.avgRebookingLagDays.toFixed(1)} days</p>
              <p className="text-xs text-muted mb-2">avg between sessions (median {deepMetrics.medianRebookingLagDays.toFixed(1)})</p>
              <div className="text-xs">
                <span className={`font-semibold ${deepMetrics.patientsOverThreshold > 0 ? "text-danger" : "text-success"}`}>
                  {deepMetrics.patientsOverThreshold} patients
                </span>
                <span className="text-muted"> over 14-day threshold</span>
              </div>
            </div>

            {/* Discharge Quality */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${brand.teal}12` }}>
                  <Shield size={14} style={{ color: brand.teal }} />
                </div>
                <h4 className="text-sm font-semibold text-navy">Discharge Quality</h4>
              </div>
              <p className="font-display text-2xl text-navy mb-1">{Math.round(deepMetrics.dischargeQualityRate * 100)}%</p>
              <p className="text-xs text-muted mb-2">proper discharge rate</p>
              <div className="flex items-center gap-4 text-xs text-muted">
                <span>{deepMetrics.properDischarges} proper</span>
                <span>{deepMetrics.ghostDischarges} ghost</span>
              </div>
            </div>

            {/* Patient LTV */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${brand.purple}12` }}>
                  <PoundSterling size={14} style={{ color: brand.purple }} />
                </div>
                <h4 className="text-sm font-semibold text-navy">Patient Lifetime Value</h4>
              </div>
              <p className="font-display text-2xl text-navy mb-1">{formatPence(deepMetrics.avgLifetimeValuePence)}</p>
              <p className="text-xs text-muted mb-2">average (median {formatPence(deepMetrics.medianLifetimeValuePence)})</p>
              {(deepMetrics.insuranceLtvPence != null || deepMetrics.selfPayLtvPence != null) && (
                <div className="flex items-center gap-4 text-xs text-muted">
                  {deepMetrics.insuranceLtvPence != null && <span>Insurance: {formatPence(deepMetrics.insuranceLtvPence)}</span>}
                  {deepMetrics.selfPayLtvPence != null && <span>Self-pay: {formatPence(deepMetrics.selfPayLtvPence)}</span>}
                </div>
              )}
            </div>

            {/* Revenue per Delivered Hour */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${brand.blue}12` }}>
                  <BarChart2 size={14} style={{ color: brand.blue }} />
                </div>
                <h4 className="text-sm font-semibold text-navy">Revenue per Hour</h4>
              </div>
              <p className="font-display text-2xl text-navy mb-1">{formatPence(deepMetrics.revenuePerDeliveredHourPence)}</p>
              <p className="text-xs text-muted mb-2">per delivered hour</p>
              {deepMetrics.revenuePerAvailableHourPence != null && (
                <div className="text-xs text-muted">
                  Available hour: {formatPence(deepMetrics.revenuePerAvailableHourPence)}
                </div>
              )}
            </div>
          </div>

          {/* Retention Curve */}
          {deepMetrics.retentionCurve.length > 0 && (
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h4 className="font-display text-lg text-navy mb-1">Retention Curve</h4>
              <p className="text-xs text-muted mb-4">
                Patient drop-off by session — biggest loss at session {deepMetrics.biggestDropoffSession} ({deepMetrics.biggestDropoffPercent.toFixed(0)}% drop)
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={deepMetrics.retentionCurve} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke={brand.border} vertical={false} />
                  <XAxis
                    dataKey="session"
                    tickFormatter={(v: number) => v >= 6 ? "6+" : `S${v}`}
                    tick={{ fontSize: 12, fill: brand.muted }}
                    tickLine={false}
                    axisLine={{ stroke: brand.border }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${Math.round(v)}%`}
                    tick={{ fontSize: 11, fill: brand.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={45}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    formatter={(v: number, name: string) => [
                      name === "percentOfInitial" ? `${v.toFixed(0)}%` : formatPence(v),
                      name === "percentOfInitial" ? "Retained" : "Revenue Lost",
                    ]}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="percentOfInitial" name="Retained %" radius={[6, 6, 0, 0]}>
                    {deepMetrics.retentionCurve.map((step, i) => (
                      <Cell
                        key={i}
                        fill={step.session === deepMetrics.biggestDropoffSession ? brand.danger : brand.teal}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Revenue lost table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-semibold text-muted uppercase tracking-wide">Session</th>
                      <th className="text-right py-2 px-3 font-semibold text-muted uppercase tracking-wide">Patients</th>
                      <th className="text-right py-2 px-3 font-semibold text-muted uppercase tracking-wide">Retained</th>
                      <th className="text-right py-2 px-3 font-semibold text-muted uppercase tracking-wide">Drop-off</th>
                      <th className="text-right py-2 px-3 font-semibold text-muted uppercase tracking-wide">Revenue Lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deepMetrics.retentionCurve.map((step) => (
                      <tr key={step.session} className="border-b border-border/50">
                        <td className="py-2 px-3 font-medium text-navy">{step.session >= 6 ? "6+" : `Session ${step.session}`}</td>
                        <td className="py-2 px-3 text-right text-navy">{step.patientsReached}</td>
                        <td className="py-2 px-3 text-right">
                          <span className={step.percentOfInitial >= 60 ? "text-success font-semibold" : step.percentOfInitial >= 40 ? "text-warning font-semibold" : "text-danger font-semibold"}>
                            {step.percentOfInitial.toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-muted">{step.dropoffFromPrevious.toFixed(0)}%</td>
                        <td className="py-2 px-3 text-right font-semibold text-danger">{formatPence(step.revenueLostPence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function IntelligencePage() {
  const router = useRouter();
  const { user, firebaseUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("insights");
  const [selectedClinician, setSelectedClinician] = useState("all");
  const [expandedClinician, setExpandedClinician] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const { clinicians } = useClinicians();
  const { stats, usedDemo: weeklyUsedDemo, error: weeklyError } = useWeeklyStats(selectedClinician);
  const latest = stats.length > 0 ? stats[stats.length - 1] : null;
  const { patients } = usePatients();
  const valueLedger = useValueLedger(selectedClinician);

  const handleRefreshData = useCallback(async () => {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      if (!firebaseUser) {
        setRefreshResult("Sync failed: sign in required");
        return;
      }
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (data && typeof data === "object" && "error" in data ? (data as { error?: string }).error : null) ?? res.statusText ?? "Unknown error";
        setRefreshResult(`Sync failed: ${message}`);
        return;
      }
      // Pipeline returns ok=true but may still surface stage errors (PMS misconfigured, etc)
      const stages = (data && typeof data === "object" && "stages" in data ? (data as { stages?: Array<{ ok?: boolean; errors?: string[] }> }).stages : undefined) ?? [];
      const stageErrors = stages.flatMap((s) => (s.ok ? [] : (s.errors ?? []))).filter(Boolean);
      if (stageErrors.length > 0) {
        setRefreshResult(`Sync finished with warnings: ${stageErrors[0]}`);
        setTimeout(() => router.refresh(), 2500);
        return;
      }
      setRefreshResult("Data synced — reloading…");
      setTimeout(() => router.refresh(), 1500);
    } catch (e) {
      setRefreshResult(`Sync failed: ${e instanceof Error ? e.message : "Network error"}`);
    } finally {
      setRefreshing(false);
    }
  }, [firebaseUser, router]);

  const {
    revByClinician,
    revByCondition,
    dnaByDay,
    dnaBySlot,
    referrals,
    outcomeTrends,
    nps,
    reviewVelocity: reviews,
    clinicianKpis,
    benchmarks,
    loading: intelligenceLoading,
    usedDemo,
    outcomesDemoFallback,
    reputationDemoFallback,
    error: intelligenceError,
  } = useIntelligenceData(selectedClinician);

  // KPI cards: use LATEST WEEK data, not cumulative totals
  const latestWeekRevenue = latest
    ? (latest.revenuePerSessionPence ?? 0) * (latest.appointmentsTotal ?? 0)
    : 0;
  const latestWeekSessions = latest?.appointmentsTotal ?? 0;
  const avgRevPerSession = latestWeekSessions > 0
    ? Math.round(latestWeekRevenue / latestWeekSessions)
    : 0;
  const totalReferrals = referrals.reduce((s, r) => s + r.patientsReferred, 0);
  const totalConverted = referrals.reduce((s, r) => s + r.convertedToBooking, 0);

  const toggleClinician = useCallback((id: string) => {
    setExpandedClinician((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Intelligence"
        subtitle="Deep-dive analytics — revenue, DNA patterns, referrals, outcomes, and reputation"
        clinicians={clinicians}
        selectedClinician={selectedClinician}
        onClinicianChange={setSelectedClinician}
        accentColor={brand.purple}
      />

      {/* Data freshness bar */}
      {(() => {
        const computedDate = latest?.computedAt ? new Date(latest.computedAt) : null;
        const daysSinceSync = computedDate ? Math.floor((Date.now() - computedDate.getTime()) / 86400000) : null;
        const isStale = daysSinceSync != null && daysSinceSync > 7;
        return (
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-sm ${isStale ? "bg-amber-50 border-amber-200" : "bg-cloud-light border-border"}`}>
        <span className={isStale ? "text-amber-700" : "text-muted"}>
          {isStale && <AlertTriangle size={14} className="inline mr-1.5 -mt-0.5 text-amber-500" />}
          {computedDate
            ? `Last synced: ${computedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} at ${computedDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}${isStale ? ` (${daysSinceSync} days ago — data is stale)` : ""}`
            : "No data synced yet — hit Refresh Data to pull from your PMS"}
          {latest?.weekStart && <span className={`ml-2 ${isStale ? "text-amber-500" : "text-muted/60"}`}>· Week of {latest.weekStart}</span>}
        </span>
        <div className="flex items-center gap-2">
          {refreshResult && (
            <span className={`text-xs ${refreshResult.startsWith("Data synced") ? "text-emerald-600" : "text-red-500"}`}>
              {refreshResult}
            </span>
          )}
          <button
            onClick={handleRefreshData}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple/10 text-purple text-xs font-medium hover:bg-purple/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Syncing…" : "Refresh Data"}
          </button>
        </div>
      </div>
        );
      })()}

      {(intelligenceError || weeklyError) && (
        <ErrorBanner
          message={intelligenceError ?? weeklyError ?? "Failed to load data."}
          onRetry={() => router.refresh()}
        />
      )}

      {/* KPI projection strip — reads from /clinics/{clinicId}/kpis/*.
          Renders nothing until the pipeline has populated the projection. */}
      <KpiProjectionStrip />

      {/* Cross-module coupling tile — reads /clinics/{clinicId}/events filtered
          by consumedBy='pulse' (7d window). Read-only handshake between
          Intelligence (event emitter) and Pulse (event consumer). */}
      <EventsActionedByPulseTile />

      {/* Summary stat cards */}
      <div className="relative grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Ambient radial glow — purple wash behind Intelligence stats */}
        <div
          className="ambient-glow -z-10"
          style={{
            width: "45%",
            height: "130%",
            top: "-15%",
            left: "27%",
            background: "radial-gradient(ellipse at center, rgba(139,92,246,0.06) 0%, transparent 70%)",
          }}
        />
        <StatCard
          label="Weekly Revenue"
          value={formatPence(latestWeekRevenue)}
          unit={latest?.weekStart ? `w/c ${latest.weekStart}` : ""}
          status="neutral"
        />
        <StatCard
          label="Rev per Session"
          value={formatPence(avgRevPerSession)}
          status={avgRevPerSession >= 7500 ? "ok" : "warn"}
        />
        <StatCard
          label="NPS Score"
          value={reputationDemoFallback && !usedDemo ? "—" : nps.score}
          status={reputationDemoFallback && !usedDemo ? "neutral" : nps.score >= 70 ? "ok" : nps.score >= 50 ? "warn" : "danger"}
          insight={reputationDemoFallback && !usedDemo ? "No NPS data yet" : `${nps.totalResponses} responses`}
        />
        <StatCard
          label="Google Reviews"
          value={reputationDemoFallback && !usedDemo ? "—" : reviews.totalReviews}
          unit={reputationDemoFallback && !usedDemo ? "" : `${reviews.avgRating} avg`}
          status={reputationDemoFallback && !usedDemo ? "neutral" : "ok"}
          insight={reputationDemoFallback && !usedDemo ? "Connect your Google Business Profile" : `${reviews.monthlyVelocity.length > 0 ? reviews.monthlyVelocity[reviews.monthlyVelocity.length - 1].count : 0} this month`}
          action={reputationDemoFallback && !usedDemo ? { label: "Connect in Settings", onClick: () => router.push("/settings#reviews") } : undefined}
        />
        <StatCard
          label="Referral Conv."
          value={totalReferrals > 0 ? formatPercent(totalConverted / totalReferrals) : "—"}
          status={totalReferrals > 0 && totalConverted / totalReferrals >= 0.8 ? "ok" : totalReferrals > 0 ? "warn" : "neutral"}
          insight={`${totalReferrals} referred, ${totalConverted} booked`}
        />
      </div>

      {/* Clinician KPI table with sparklines + drill-down */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
        <div className="p-6 pb-0">
          <h3 className="font-display text-lg text-navy mb-1">Clinician Performance</h3>
          <p className="text-xs text-muted mb-4">90-day rolling trends — click a row to see patient-level breakdown</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-cloud-light/50">
                <th className="text-left py-3 px-5 text-xs font-semibold text-muted uppercase tracking-wide">Clinician</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Follow-Up Rate</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">Utilisation</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide">DNA Rate</th>
                <th className="text-right py-3 px-5 text-xs font-semibold text-muted uppercase tracking-wide">Active Pts</th>
              </tr>
            </thead>
            <tbody>
              {clinicianKpis.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted">
                    Per-clinician performance data will appear once metrics are computed from appointment records.
                  </td>
                </tr>
              )}
              {clinicianKpis.map((c) => {
                const isExpanded = expandedClinician === c.clinicianId;
                return (
                  <Fragment key={c.clinicianId}>
                    <tr
                      onClick={() => toggleClinician(c.clinicianId)}
                      className={`border-b border-border/50 cursor-pointer transition-colors ${isExpanded ? "bg-cloud-light/50" : "hover:bg-cloud-light/30"}`}
                    >
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2.5">
                          {isExpanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                          <div className="w-8 h-8 rounded-full bg-navy flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                            {c.clinicianName.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-semibold text-navy">{c.clinicianName}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-4">
                          <span className={`font-semibold text-sm ${c.rebookRate >= 3.5 ? "text-success" : c.rebookRate >= 2.5 ? "text-warn" : "text-danger"}`}>
                            {c.rebookRate.toFixed(1)}x
                          </span>
                          <MiniSparkline data={c.rebookTrend} color={brand.success} higherIsBetter />
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-4">
                          <span className={`font-semibold text-sm ${c.utilisationRate >= 0.85 ? "text-success" : c.utilisationRate >= 0.70 ? "text-warn" : "text-danger"}`}>
                            {Math.round(c.utilisationRate * 100)}%
                          </span>
                          <MiniSparkline data={c.utilisationTrend} color={brand.blue} higherIsBetter />
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-4">
                          <span className={`font-semibold text-sm ${c.dnaRate <= 0.04 ? "text-success" : c.dnaRate <= 0.08 ? "text-warn" : "text-danger"}`}>
                            {Math.round(c.dnaRate * 100)}%
                          </span>
                          <MiniSparkline data={c.dnaTrend} color={brand.danger} higherIsBetter={false} />
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right font-semibold text-navy">{c.activePatients}</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${c.clinicianId}-drill`} className="border-b border-border/50 bg-cloud-light/30">
                        <td colSpan={5} className="px-5 pb-5 pt-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <p className="text-[11px] font-semibold text-blue uppercase tracking-wide mb-2 flex items-center gap-1">
                                <Users size={11} /> Active ({c.drilldown.active.length})
                              </p>
                              <div className="space-y-1.5">
                                {c.drilldown.active.map((p) => (
                                  <div key={p.name} className="flex items-center justify-between text-xs">
                                    <span className="text-navy font-medium">{p.name}</span>
                                    <div className="flex items-center gap-2 text-muted">
                                      <span>{p.sessions}</span>
                                      <span className="text-[10px]">{p.lastSeen} ago</span>
                                    </div>
                                  </div>
                                ))}
                                {c.drilldown.active.length === 0 && <p className="text-xs text-muted">None</p>}
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold text-warn uppercase tracking-wide mb-2 flex items-center gap-1">
                                <AlertTriangle size={11} /> Dropped Off ({c.drilldown.droppedOff.length})
                              </p>
                              <div className="space-y-1.5">
                                {c.drilldown.droppedOff.map((p) => (
                                  <div key={p.name} className="flex items-start justify-between text-xs">
                                    <span className="text-navy font-medium">{p.name}</span>
                                    <span className="text-muted text-[10px] text-right max-w-[120px]">{p.lastSeen} ago</span>
                                  </div>
                                ))}
                                {c.drilldown.droppedOff.length === 0 && <p className="text-xs text-success font-medium">None — great retention</p>}
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2 flex items-center gap-1">
                                <Activity size={11} /> Completed ({c.drilldown.completed.length})
                              </p>
                              <div className="space-y-1.5">
                                {c.drilldown.completed.map((p) => (
                                  <div key={p.name} className="flex items-center justify-between text-xs">
                                    <span className="text-navy font-medium">{p.name}</span>
                                    <span className="text-muted">{p.sessions} sessions</span>
                                  </div>
                                ))}
                                {c.drilldown.completed.length === 0 && <p className="text-xs text-muted">None this period</p>}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Benchmark comparison */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <div className="flex items-center gap-2 mb-1">
          <BarChart2 size={16} className="text-purple" />
          <h3 className="font-display text-lg text-navy">Benchmark Comparison</h3>
        </div>
        <p className="text-xs text-muted mb-5">Your clinic vs. similar UK private physio practices (3–5 clinicians) · anonymised aggregate data</p>
        <div className="space-y-4">
          {benchmarks.map((b) => {
            const hasData = b.yourValue > 0;
            const formatVal = (v: number) =>
              b.unit === "percent" ? `${Math.round(v * 100)}%` :
              b.unit === "pence" ? `£${(v / 100).toFixed(0)}` :
              b.unit === "ratio" ? `${v.toFixed(1)}x` :
              String(v);
            const yourPct = hasData
              ? b.higherIsBetter
                ? Math.min(100, (b.yourValue / b.peerTop25) * 100)
                : Math.min(100, ((b.peerTop25 * 2 - b.yourValue) / (b.peerTop25 * 2 - b.peerTop25)) * 100)
              : 0;
            const peerPct = b.higherIsBetter
              ? Math.min(100, (b.peerMedian / b.peerTop25) * 100)
              : 50;
            const beating = hasData && (b.higherIsBetter ? b.yourValue > b.peerMedian : b.yourValue < b.peerMedian);
            return (
              <div key={b.metric}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-navy">{b.metric}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`font-bold ${!hasData ? "text-muted" : beating ? "text-success" : "text-warn"}`}>
                      You: {hasData ? formatVal(b.yourValue) : "—"}
                    </span>
                    <span className="text-muted">Peers: {formatVal(b.peerMedian)}</span>
                    <span className="text-muted">Top 25%: {formatVal(b.peerTop25)}</span>
                  </div>
                </div>
                <div className="relative h-2.5 bg-cloud-dark rounded-full overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full opacity-25"
                    style={{ width: `${peerPct}%`, background: brand.muted }}
                  />
                  <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${yourPct}%`,
                      background: beating ? brand.success : brand.warning,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted mt-4 italic">Your metrics are live from clinic data. Peer benchmarks are UK private physio baselines — will refine as more practices join StrydeOS.</p>
      </div>

      {/* Tab navigation */}
      <div role="tablist" aria-label="Intelligence views" className="relative flex items-center gap-1 bg-cloud-light rounded-xl p-1 border border-border overflow-x-auto">
        {TABS.filter(t => t.id !== "outcomes" || user?.clinicProfile?.featureFlags?.outcomeTracking).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`tabpanel-${id}`}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all whitespace-nowrap ${
              activeTab === id
                ? "font-semibold shadow-[var(--shadow-card)] tab-active-glow bg-white text-navy"
                : "font-medium text-muted hover:text-ink hover:bg-white/50"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === "insights" && (
          <InsightFeed />
        )}

        {activeTab === "revenue" && (
          <div className="space-y-6">
            {/* Revenue by clinician */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h3 className="font-display text-lg text-navy mb-1">Revenue by Clinician</h3>
              <p className="text-xs text-muted mb-4">Total revenue attributed per clinician across the reporting period</p>
              {revByClinician.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-cloud-light border border-border text-sm text-muted">
                  <PoundSterling size={16} className="shrink-0 text-purple" />
                  <span>Revenue data will appear once per-clinician metrics are computed from your appointment data.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={revByClinician} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke={brand.border} vertical={false} />
                    <XAxis dataKey="clinicianName" tick={{ fontSize: 12, fill: brand.muted }} tickLine={false} axisLine={{ stroke: brand.border }} />
                    <YAxis
                      tickFormatter={(v: number) => `£${(v / 100).toFixed(0)}`}
                      tick={{ fontSize: 11, fill: brand.muted }}
                      tickLine={false}
                      axisLine={false}
                      width={60}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      formatter={(v: number) => [`£${(v / 100).toFixed(0)}`, "Revenue"]}
                    />
                    <Bar dataKey="totalRevenuePence" name="Revenue" radius={[6, 6, 0, 0]}>
                      {revByClinician.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Revenue by condition */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h3 className="font-display text-lg text-navy mb-1">Revenue by Condition</h3>
              <p className="text-xs text-muted mb-4">Which conditions drive the most revenue across the practice</p>
              {revByCondition.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-cloud-light border border-border text-sm text-muted">
                  <Activity size={16} className="shrink-0 text-purple" />
                  <span>Condition data will populate once appointment types are mapped from your PMS sync.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {revByCondition.map((c, i) => {
                    const maxRev = revByCondition[0].totalRevenuePence;
                    const pct = (c.totalRevenuePence / maxRev) * 100;
                    return (
                      <div key={c.condition}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-navy">{c.condition}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted">{c.sessions} sessions</span>
                            <span className="text-sm font-bold text-navy">
                              {formatPence(c.totalRevenuePence)}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-cloud-dark rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "dna" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* DNA by day of week */}
              <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
                <h3 className="font-display text-lg text-navy mb-1">DNA by Day of Week</h3>
                <p className="text-xs text-muted mb-4">Which days see the most no-shows</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dnaByDay} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke={brand.border} vertical={false} />
                    <XAxis dataKey="shortDay" tick={{ fontSize: 12, fill: brand.muted }} tickLine={false} axisLine={{ stroke: brand.border }} />
                    <YAxis tick={{ fontSize: 11, fill: brand.muted }} tickLine={false} axisLine={false} width={30} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="dnaCount" name="DNAs" radius={[6, 6, 0, 0]}>
                      {dnaByDay.map((d) => (
                        <Cell key={d.day} fill={d.dnaRate > 0.1 ? brand.danger : d.dnaRate > 0 ? brand.warning : brand.success} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* DNA by time slot */}
              <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
                <h3 className="font-display text-lg text-navy mb-1">DNA by Time Slot</h3>
                <p className="text-xs text-muted mb-4">DNA rate breakdown by appointment time slot</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dnaBySlot} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke={brand.border} vertical={false} />
                    <XAxis dataKey="slot" tick={{ fontSize: 10, fill: brand.muted }} tickLine={false} axisLine={{ stroke: brand.border }} />
                    <YAxis
                      tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      tick={{ fontSize: 11, fill: brand.muted }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      domain={[0, 0.2]}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      formatter={(v: number) => [`${Math.round(v * 100)}%`, "DNA Rate"]}
                    />
                    <Bar dataKey="dnaRate" name="DNA Rate" radius={[6, 6, 0, 0]}>
                      {dnaBySlot.map((d) => (
                        <Cell key={d.slot} fill={d.dnaRate > 0.1 ? brand.danger : d.dnaRate > 0 ? brand.warning : brand.success} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* DNA insights */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h3 className="font-display text-lg text-navy mb-3">Insights</h3>
              {dnaByDay.length === 0 || dnaByDay.every((d) => d.dnaCount === 0) ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-cloud-light border border-border text-sm text-muted">
                  <AlertTriangle size={16} className="shrink-0 text-purple" />
                  <span>No DNA events recorded in the current period. Insights will appear once appointment data includes no-show events.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(() => {
                    const worstDay = [...dnaByDay].sort((a, b) => b.dnaRate - a.dnaRate)[0];
                    const worstSlot = [...dnaBySlot].sort((a, b) => b.dnaRate - a.dnaRate)[0];
                    const totalDna = dnaByDay.reduce((s, d) => s + d.dnaCount, 0);
                    return [
                      {
                        icon: AlertTriangle,
                        color: brand.danger,
                        title: "Highest DNA day",
                        text: worstDay ? `${worstDay.day} at ${formatPercent(worstDay.dnaRate)} — ${worstDay.dnaCount} of ${worstDay.totalAppointments} appointments` : "No data",
                      },
                      {
                        icon: AlertTriangle,
                        color: brand.warning,
                        title: "Highest DNA slot",
                        text: worstSlot ? `${worstSlot.slot} at ${formatPercent(worstSlot.dnaRate)} — consider SMS reminders 2h before` : "No data",
                      },
                      {
                        icon: TrendingUp,
                        color: brand.success,
                        title: "Weekly total",
                        text: `${totalDna} DNAs this week out of ${dnaByDay.reduce((s, d) => s + d.totalAppointments, 0)} appointments`,
                      },
                    ];
                  })().map((insight) => (
                    <div key={insight.title} className="flex items-start gap-3 p-4 rounded-xl bg-cloud-light border border-border">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${insight.color}15` }}>
                        <insight.icon size={14} style={{ color: insight.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-navy">{insight.title}</p>
                        <p className="text-xs text-muted leading-relaxed">{insight.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "referrals" && (
          <div className="space-y-6">
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h3 className="font-display text-lg text-navy mb-1">Referral Source Attribution</h3>
              <p className="text-xs text-muted mb-4">Where your patients come from and the revenue they generate</p>
              {referrals.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-cloud-light border border-border text-sm text-muted">
                  <GitBranch size={16} className="shrink-0 text-purple" />
                  <span>Referral data will populate once patients have a referral source set in your PMS. This is derived from the patient record.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wide">Source</th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wide">Type</th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wide">Referred</th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wide">Booked</th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wide">Conv. %</th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wide">Revenue</th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wide">Avg treatment length</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals
                        .sort((a, b) => b.totalRevenuePence - a.totalRevenuePence)
                        .map((r) => (
                          <tr key={r.source} className="border-b border-border/50 hover:bg-cloud-light/50 transition-colors">
                            <td className="py-3 px-3 font-medium text-navy">{r.source}</td>
                            <td className="py-3 px-3">
                              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue/10 text-blue">
                                {r.type.replace("_", " ")}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right text-navy">{r.patientsReferred}</td>
                            <td className="py-3 px-3 text-right text-navy">{r.convertedToBooking}</td>
                            <td className="py-3 px-3 text-right">
                              <span className={`font-semibold ${r.patientsReferred > 0 && r.convertedToBooking / r.patientsReferred >= 0.8 ? "text-success" : r.patientsReferred > 0 ? "text-warn" : "text-muted"}`}>
                                {r.patientsReferred > 0 ? formatPercent(r.convertedToBooking / r.patientsReferred) : "—"}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-navy">{formatPence(r.totalRevenuePence)}</td>
                            <td className="py-3 px-3 text-right text-muted">{r.avgTreatmentLength.toFixed(1)} sessions</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Referral insight */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUpRight size={16} className="text-success" />
                  <h4 className="text-sm font-semibold text-navy">Top Revenue Source</h4>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  {referrals.length > 0 ? (
                    <>
                      <span className="font-semibold text-navy">{referrals.sort((a, b) => b.totalRevenuePence - a.totalRevenuePence)[0].source}</span> generates the most revenue at {formatPence(referrals.sort((a, b) => b.totalRevenuePence - a.totalRevenuePence)[0].totalRevenuePence)} from {referrals.sort((a, b) => b.totalRevenuePence - a.totalRevenuePence)[0].patientsReferred} patients.
                    </>
                  ) : (
                    <>Referral data will populate once appointment sources are mapped from your PMS sync.</>
                  )}
                </p>
              </div>
              <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Users size={16} className="text-blue" />
                  <h4 className="text-sm font-semibold text-navy">Highest Value per Patient</h4>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  {referrals.length > 0 ? (() => {
                    const longest = [...referrals].sort((a, b) => b.avgTreatmentLength - a.avgTreatmentLength)[0];
                    return (
                      <>
                        <span className="font-semibold text-navy">{longest.source}</span> referrals have the longest avg treatment ({longest.avgTreatmentLength.toFixed(1)} sessions) and {formatPercent(longest.convertedToBooking / longest.patientsReferred)} conversion.
                      </>
                    );
                  })() : (
                    <>Referral conversion insights will appear once sufficient data is available.</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "outcomes" && (
          <div className="space-y-6">
            {outcomesDemoFallback && !usedDemo && (
              <div
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm"
                style={{ background: "rgba(139, 92, 246, 0.06)", border: "1px solid rgba(139, 92, 246, 0.15)" }}
              >
                <Activity size={14} className="text-purple shrink-0" />
                <span className="text-purple font-medium">
                  Showing sample data
                  <span className="font-normal text-muted ml-1">
                    — connect outcome measures to see real scores
                  </span>
                </span>
              </div>
            )}
            {/* Correlation insight */}
            <div className="rounded-[var(--radius-card)] border border-purple/20 bg-purple/5 p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple/10 flex items-center justify-center shrink-0">
                  <Activity size={16} className="text-purple" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-navy mb-1">Clinical outcomes correlate with revenue</h4>
                  <p className="text-xs text-muted leading-relaxed">
                    Patients who improve <span className="font-semibold text-navy">≥3 points on NPRS</span> are <span className="font-semibold text-success">2.4×</span> more likely to complete their full treatment and <span className="font-semibold text-success">1.8×</span> more likely to leave a Google review.
                    Tracking outcomes turns clinical quality into a measurable revenue signal.
                  </p>
                </div>
              </div>
            </div>

            {/* Per-clinician outcome aggregation */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h3 className="font-display text-lg text-navy mb-1">Average Improvement by Clinician</h3>
              <p className="text-xs text-muted mb-4">NPRS change (lower = better) and PSFS change (higher = better) averaged across completed treatments</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(clinicianKpis.length > 0 ? clinicianKpis.slice(0, 3).map((k, i) => ({
                  name: k.clinicianName,
                  nprsChange: null as number | null,
                  psfsChange: null as number | null,
                  courses: k.activePatients,
                  color: BAR_COLORS[i % BAR_COLORS.length],
                })) : [
                  { name: "—", nprsChange: null as number | null, psfsChange: null as number | null, courses: 0, color: brand.blue },
                ]).map((c) => (
                  <div key={c.name} className="rounded-xl border border-border p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: c.color }}>
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-navy">{c.name}</p>
                        <p className="text-[11px] text-muted">{c.courses} completed treatments</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-2 rounded-lg bg-success/5">
                        <p className="font-display text-xl text-success">{c.nprsChange !== null ? c.nprsChange : "—"}</p>
                        <p className="text-[10px] text-muted">NPRS change</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-blue/5">
                        <p className="font-display text-xl text-blue">{c.psfsChange !== null ? `+${c.psfsChange}` : "—"}</p>
                        <p className="text-[10px] text-muted">PSFS change</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Score entry component */}
            <OutcomeScoreEntry
              patients={patients}
              clinicId={user?.clinicId ?? null}
              currentUserId={user?.uid ?? ""}
            />

            {/* Outcome measure trends */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h3 className="font-display text-lg text-navy mb-1">Outcome Measure Trends</h3>
              <p className="text-xs text-muted mb-4">Clinic-wide average scores across all active patients</p>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={outcomeTrends[0]?.dataPoints ?? []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke={brand.border} vertical={false} />
                  <XAxis
                    dataKey="weekStart"
                    tickFormatter={formatWeekDate}
                    tick={{ fontSize: 11, fill: brand.muted }}
                    tickLine={false}
                    axisLine={{ stroke: brand.border }}
                  />
                  <YAxis
                    domain={[0, 10]}
                    tick={{ fontSize: 11, fill: brand.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  {outcomeTrends.map((ot, i) => (
                    <Line
                      key={ot.measureType}
                      data={ot.dataPoints}
                      type="monotone"
                      dataKey="avgScore"
                      name={ot.shortName}
                      stroke={BAR_COLORS[i % BAR_COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: BAR_COLORS[i % BAR_COLORS.length], strokeWidth: 0 }}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Outcome cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {outcomeTrends.map((ot) => {
                if (ot.dataPoints.length === 0) return null;
                const first = ot.dataPoints[0];
                const last = ot.dataPoints[ot.dataPoints.length - 1];
                const improved = ot.measureType === "nprs"
                  ? last.avgScore < first.avgScore
                  : last.avgScore > first.avgScore;
                const changeAbs = Math.abs(last.avgScore - first.avgScore).toFixed(1);
                return (
                  <div key={ot.measureType} className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-navy">{ot.shortName}</h4>
                      <div className={`flex items-center gap-1 text-xs font-semibold ${improved ? "text-success" : "text-danger"}`}>
                        {improved ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                        {changeAbs} pts
                      </div>
                    </div>
                    <p className="text-xs text-muted">
                      {first.avgScore.toFixed(1)} &rarr; {last.avgScore.toFixed(1)} over 90-day window ({last.patientCount} patients).{" "}
                      {improved ? "Trending in the right direction." : "Needs attention."}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "value" && (
          <ValueTabContent valueLedger={valueLedger} />
        )}

        {activeTab === "reputation" && (
          <div className="space-y-6">
            {reputationDemoFallback && !usedDemo && (
              <div
                className="rounded-[var(--radius-card)] border border-border bg-white p-6 text-center"
                style={{ borderColor: "rgba(139, 92, 246, 0.2)" }}
              >
                <div
                  className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full"
                  style={{ background: "rgba(139, 92, 246, 0.08)" }}
                >
                  <Star size={18} style={{ color: brand.purple }} />
                </div>
                <h3 className="font-display text-base text-navy mb-1">Connect your reputation data</h3>
                <p className="text-sm text-muted max-w-md mx-auto mb-3">
                  Two data sources feed this tab:
                </p>
                <div className="text-left max-w-sm mx-auto space-y-3 mb-4">
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-success/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-success">1</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-navy">NPS — automatic</p>
                      <p className="text-xs text-muted">After each appointment, patients receive a short SMS asking how likely they are to recommend you. Promoters get a Google Review nudge. Detractors trigger an owner alert.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-blue/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-blue">2</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-navy">Google Reviews — needs your Place ID</p>
                      <p className="text-xs text-muted">
                        To pull in your Google Business reviews, paste your Google Place ID into{" "}
                        <button
                          type="button"
                          onClick={() => router.push("/settings#reviews")}
                          className="text-blue hover:underline font-medium"
                        >
                          Settings
                        </button>
                        . Look yours up at{" "}
                        <a
                          href="https://developers.google.com/maps/documentation/places/web-service/place-id"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue hover:underline"
                        >
                          Google&apos;s Place ID Finder
                        </a>
                        {" "}— search your clinic name and copy the ID (starts with <span className="font-mono">ChIJ</span>).
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/settings#reviews")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white bg-purple hover:opacity-90 transition-opacity"
                >
                  <Star size={12} />
                  Connect in Settings
                </button>
                <p className="text-xs text-muted mt-3">
                  NPS data appears once your first patients respond — usually within a week of going live.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* NPS */}
              <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
                <h3 className="font-display text-lg text-navy mb-1">NPS Score</h3>
                <p className="text-xs text-muted mb-4">Net Promoter Score from post-discharge surveys</p>

                <div className="flex items-center gap-6 mb-6">
                  <div className="text-center">
                    <p className="font-display text-5xl text-navy">{nps.score}</p>
                    <p className="text-[11px] text-muted mt-1">NPS</p>
                  </div>
                  <div className="flex-1 space-y-2">
                    {[
                      { label: "Promoters (9-10)", count: nps.promoters, color: brand.success },
                      { label: "Passives (7-8)", count: nps.passives, color: brand.warning },
                      { label: "Detractors (0-6)", count: nps.detractors, color: brand.danger },
                    ].map((seg) => (
                      <div key={seg.label} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ background: seg.color }} />
                        <span className="text-xs text-muted flex-1">{seg.label}</span>
                        <span className="text-xs font-semibold text-navy">{seg.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={nps.trend} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke={brand.border} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: brand.muted }} tickLine={false} axisLine={{ stroke: brand.border }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: brand.muted }} tickLine={false} axisLine={false} width={30} />
                    <Line type="monotone" dataKey="score" stroke={brand.blue} strokeWidth={2.5} dot={{ r: 3, fill: brand.blue, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Google Reviews */}
              <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
                <h3 className="font-display text-lg text-navy mb-1">Google Reviews</h3>
                <p className="text-xs text-muted mb-4">Review count and monthly velocity</p>

                <div className="flex items-center gap-6 mb-6">
                  <div className="text-center">
                    <p className="font-display text-5xl text-navy">{reviews.totalReviews}</p>
                    <p className="text-[11px] text-muted mt-1">total reviews</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={16}
                          className={s <= Math.round(reviews.avgRating) ? "" : "text-muted/60"}
                          style={s <= Math.round(reviews.avgRating) ? { color: brand.warning } : undefined}
                          fill={s <= Math.round(reviews.avgRating) ? brand.warning : brand.border}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted">{reviews.avgRating} average rating</p>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={reviews.monthlyVelocity} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke={brand.border} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: brand.muted }} tickLine={false} axisLine={{ stroke: brand.border }} />
                    <YAxis tick={{ fontSize: 11, fill: brand.muted }} tickLine={false} axisLine={false} width={20} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Reviews" fill={brand.warning} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                {reviews.monthlyVelocity.length >= 5 && reviews.monthlyVelocity[0].count > 0 && (
                  <p className="text-xs text-muted text-center mt-3 italic">
                    Review velocity up {Math.round(((reviews.monthlyVelocity[4].count - reviews.monthlyVelocity[0].count) / reviews.monthlyVelocity[0].count) * 100)}% since {reviews.monthlyVelocity[0].month} — discharge review prompts are working
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
