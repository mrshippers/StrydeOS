"use client";

import { useState } from "react";
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
import DemoBanner from "@/components/ui/DemoBanner";
import { useClinicians } from "@/hooks/useClinicians";
import { useWeeklyStats } from "@/hooks/useWeeklyStats";
import {
  getDemoRevenueByClinician,
  getDemoRevenueByCondition,
  getDemoDnaByDay,
  getDemoDnaBySlot,
  getDemoReferralSources,
  getDemoOutcomeTrends,
  getDemoNps,
  getDemoReviewVelocity,
} from "@/hooks/useDemoIntelligence";
import { formatPence, formatPercent, formatWeekDate } from "@/lib/utils";
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
} from "lucide-react";

type Tab = "revenue" | "dna" | "referrals" | "outcomes" | "reputation";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "revenue", label: "Revenue", icon: PoundSterling },
  { id: "dna", label: "DNA Analysis", icon: AlertTriangle },
  { id: "referrals", label: "Referrals", icon: GitBranch },
  { id: "outcomes", label: "Outcomes", icon: Activity },
  { id: "reputation", label: "Reputation", icon: Star },
];

const BAR_COLORS = ["#1A5CDB", "#0891B2", "#8B5CF6", "#059669", "#F59E0B"];

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
    <div className="bg-white border border-border rounded-xl p-3 shadow-[var(--shadow-elevated)]">
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

export default function IntelligencePage() {
  const [activeTab, setActiveTab] = useState<Tab>("revenue");
  const [selectedClinician, setSelectedClinician] = useState("all");
  const { clinicians } = useClinicians();
  const { stats, usedDemo } = useWeeklyStats(selectedClinician);
  const latest = stats.length > 0 ? stats[stats.length - 1] : null;

  const revByClinician = getDemoRevenueByClinician();
  const revByCondition = getDemoRevenueByCondition();
  const dnaByDay = getDemoDnaByDay();
  const dnaBySlot = getDemoDnaBySlot();
  const referrals = getDemoReferralSources();
  const outcomeTrends = getDemoOutcomeTrends();
  const nps = getDemoNps();
  const reviews = getDemoReviewVelocity();

  const totalRevenue = revByClinician.reduce((s, r) => s + r.totalRevenuePence, 0);
  const totalSessions = revByClinician.reduce((s, r) => s + r.sessionsDelivered, 0);
  const avgRevPerSession = totalSessions > 0 ? Math.round(totalRevenue / totalSessions) : 0;
  const totalReferrals = referrals.reduce((s, r) => s + r.patientsReferred, 0);
  const totalConverted = referrals.reduce((s, r) => s + r.convertedToBooking, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Intelligence"
        subtitle="Deep-dive analytics — revenue, DNA patterns, referrals, outcomes, and reputation"
        clinicians={clinicians}
        selectedClinician={selectedClinician}
        onClinicianChange={setSelectedClinician}
      />

      {usedDemo && <DemoBanner />}

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Weekly Revenue"
          value={formatPence(totalRevenue / 6)}
          unit="avg/week"
          status="neutral"
        />
        <StatCard
          label="Rev per Session"
          value={formatPence(avgRevPerSession)}
          status={avgRevPerSession >= 7500 ? "ok" : "warn"}
        />
        <StatCard
          label="NPS Score"
          value={nps.score}
          status={nps.score >= 70 ? "ok" : nps.score >= 50 ? "warn" : "danger"}
          insight={`${nps.totalResponses} responses`}
        />
        <StatCard
          label="Google Reviews"
          value={reviews.totalReviews}
          unit={`${reviews.avgRating} avg`}
          status="ok"
          insight={`${reviews.monthlyVelocity[reviews.monthlyVelocity.length - 1].count} this month`}
        />
        <StatCard
          label="Referral Conv."
          value={formatPercent(totalConverted / totalReferrals)}
          status={totalConverted / totalReferrals >= 0.8 ? "ok" : "warn"}
          insight={`${totalReferrals} referred, ${totalConverted} booked`}
        />
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 bg-cloud-light rounded-xl p-1 border border-border overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === id
                ? "bg-white text-navy shadow-[var(--shadow-card)]"
                : "text-muted hover:text-navy"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === "revenue" && (
          <div className="space-y-6">
            {/* Revenue by clinician */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h3 className="font-display text-lg text-navy mb-1">Revenue by Clinician</h3>
              <p className="text-xs text-muted mb-4">This week&apos;s total revenue attributed per clinician</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revByClinician} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#DDD9D3" vertical={false} />
                  <XAxis dataKey="clinicianName" tick={{ fontSize: 12, fill: "#6B7280" }} tickLine={false} axisLine={{ stroke: "#DDD9D3" }} />
                  <YAxis
                    tickFormatter={(v: number) => `£${(v / 100).toFixed(0)}`}
                    tick={{ fontSize: 11, fill: "#6B7280" }}
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
            </div>

            {/* Revenue by condition */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h3 className="font-display text-lg text-navy mb-1">Revenue by Condition</h3>
              <p className="text-xs text-muted mb-4">Which conditions drive the most revenue across the practice</p>
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
                    <CartesianGrid strokeDasharray="4 4" stroke="#DDD9D3" vertical={false} />
                    <XAxis dataKey="shortDay" tick={{ fontSize: 12, fill: "#6B7280" }} tickLine={false} axisLine={{ stroke: "#DDD9D3" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} width={30} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="dnaCount" name="DNAs" radius={[6, 6, 0, 0]}>
                      {dnaByDay.map((d) => (
                        <Cell key={d.day} fill={d.dnaRate > 0.1 ? "#DC2626" : d.dnaRate > 0 ? "#F59E0B" : "#059669"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* DNA by time slot */}
              <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
                <h3 className="font-display text-lg text-navy mb-1">DNA by Time Slot</h3>
                <p className="text-xs text-muted mb-4">Early morning and late afternoon are highest risk</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dnaBySlot} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#DDD9D3" vertical={false} />
                    <XAxis dataKey="slot" tick={{ fontSize: 10, fill: "#6B7280" }} tickLine={false} axisLine={{ stroke: "#DDD9D3" }} />
                    <YAxis
                      tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      tick={{ fontSize: 11, fill: "#6B7280" }}
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
                        <Cell key={d.slot} fill={d.dnaRate > 0.1 ? "#DC2626" : d.dnaRate > 0 ? "#F59E0B" : "#059669"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* DNA insights */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h3 className="font-display text-lg text-navy mb-3">Insights</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(() => {
                  const worstDay = [...dnaByDay].sort((a, b) => b.dnaRate - a.dnaRate)[0];
                  const worstSlot = [...dnaBySlot].sort((a, b) => b.dnaRate - a.dnaRate)[0];
                  const totalDna = dnaByDay.reduce((s, d) => s + d.dnaCount, 0);
                  return [
                    {
                      icon: AlertTriangle,
                      color: "#DC2626",
                      title: "Highest DNA day",
                      text: `${worstDay.day} at ${formatPercent(worstDay.dnaRate)} — ${worstDay.dnaCount} of ${worstDay.totalAppointments} appointments`,
                    },
                    {
                      icon: AlertTriangle,
                      color: "#F59E0B",
                      title: "Highest DNA slot",
                      text: `${worstSlot.slot} at ${formatPercent(worstSlot.dnaRate)} — consider SMS reminders 2h before`,
                    },
                    {
                      icon: TrendingUp,
                      color: "#059669",
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
            </div>
          </div>
        )}

        {activeTab === "referrals" && (
          <div className="space-y-6">
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h3 className="font-display text-lg text-navy mb-1">Referral Source Attribution</h3>
              <p className="text-xs text-muted mb-4">Where your patients come from and the revenue they generate</p>
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
                      <th className="text-right py-3 px-3 text-xs font-semibold text-muted uppercase tracking-wide">Avg Course</th>
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
                            <span className={`font-semibold ${r.convertedToBooking / r.patientsReferred >= 0.8 ? "text-success" : "text-warn"}`}>
                              {formatPercent(r.convertedToBooking / r.patientsReferred)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-navy">{formatPence(r.totalRevenuePence)}</td>
                          <td className="py-3 px-3 text-right text-muted">{r.avgCourseLength.toFixed(1)} sessions</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Referral insight */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUpRight size={16} className="text-success" />
                  <h4 className="text-sm font-semibold text-navy">Top Revenue Source</h4>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  <span className="font-semibold text-navy">Self-referred (Google)</span> generates the most revenue at {formatPence(4200000)} from 10 patients.
                  Suggests organic SEO and Google Business profile are working.
                </p>
              </div>
              <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Users size={16} className="text-blue" />
                  <h4 className="text-sm font-semibold text-navy">Highest Value per Patient</h4>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  <span className="font-semibold text-navy">Mr. James Chen (Ortho)</span> referrals have the longest avg course (7.0 sessions) and 100% conversion.
                  Post-surgical patients are your highest-value segment.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "outcomes" && (
          <div className="space-y-6">
            {/* Outcome measure trends */}
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
              <h3 className="font-display text-lg text-navy mb-1">Outcome Measure Trends</h3>
              <p className="text-xs text-muted mb-4">Clinic-wide average scores across all active patients</p>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={outcomeTrends[0]?.dataPoints ?? []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#DDD9D3" vertical={false} />
                  <XAxis
                    dataKey="weekStart"
                    tickFormatter={formatWeekDate}
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    tickLine={false}
                    axisLine={{ stroke: "#DDD9D3" }}
                  />
                  <YAxis
                    domain={[0, 10]}
                    tick={{ fontSize: 11, fill: "#6B7280" }}
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
                      {first.avgScore.toFixed(1)} &rarr; {last.avgScore.toFixed(1)} over 6 weeks ({last.patientCount} patients).{" "}
                      {improved ? "Trending in the right direction." : "Needs attention."}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "reputation" && (
          <div className="space-y-6">
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
                      { label: "Promoters (9-10)", count: nps.promoters, color: "#059669" },
                      { label: "Passives (7-8)", count: nps.passives, color: "#F59E0B" },
                      { label: "Detractors (0-6)", count: nps.detractors, color: "#DC2626" },
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
                    <CartesianGrid strokeDasharray="4 4" stroke="#DDD9D3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={{ stroke: "#DDD9D3" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} width={30} />
                    <Line type="monotone" dataKey="score" stroke="#1A5CDB" strokeWidth={2.5} dot={{ r: 3, fill: "#1A5CDB", strokeWidth: 0 }} />
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
                          className={s <= Math.round(reviews.avgRating) ? "text-yellow-400" : "text-gray-200"}
                          fill={s <= Math.round(reviews.avgRating) ? "#FBBF24" : "#E5E7EB"}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted">{reviews.avgRating} average rating</p>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={reviews.monthlyVelocity} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#DDD9D3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={{ stroke: "#DDD9D3" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} width={20} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Reviews" fill="#FBBF24" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted text-center mt-3 italic">
                  Review velocity up {Math.round(((reviews.monthlyVelocity[4].count - reviews.monthlyVelocity[0].count) / reviews.monthlyVelocity[0].count) * 100)}% since October — discharge review prompts are working
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
