"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import PageHeader from "@/components/ui/PageHeader";
import {
  Activity,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import type {
  ClinicIntegrationHealth,
  ProviderHealthStats,
  IntegrationHealthStatus,
} from "@/app/api/admin/integration-health/route";

const PROVIDER_LABELS: Record<string, string> = {
  writeupp: "WriteUpp",
  cliniko: "Cliniko",
  halaxy: "Halaxy",
  powerdiary: "Zanda",
  physitrack: "Physitrack",
  google_reviews: "Google Reviews",
  rehab_my_patient: "Rehab My Patient",
  wibbi: "Wibbi",
};

function formatProvider(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatLastSync(lastSuccessAt: string | null, lastFailureAt: string | null): string {
  const a = lastSuccessAt ? new Date(lastSuccessAt).getTime() : 0;
  const b = lastFailureAt ? new Date(lastFailureAt).getTime() : 0;
  const latest = Math.max(a, b);
  if (latest === 0) return "—";
  const diffMs = Date.now() - latest;
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  if (diffM < 60) return `${diffM} min ago`;
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function statusBadge(status: IntegrationHealthStatus) {
  const styles = {
    healthy: "bg-success/10 text-success",
    degraded: "bg-warn/10 text-warn",
    down: "bg-danger/10 text-danger",
  };
  const icons = {
    healthy: <CheckCircle2 size={12} className="shrink-0" />,
    degraded: <AlertTriangle size={12} className="shrink-0" />,
    down: <XCircle size={12} className="shrink-0" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full ${styles[status]}`}
    >
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function IntegrationHealthPage() {
  const { user, firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ clinics: ClinicIntegrationHealth[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedClinicId, setExpandedClinicId] = useState<string | null>(null);
  const [providerSectionOpen, setProviderSectionOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && user && user.role !== "superadmin") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  const fetchHealth = useCallback(async () => {
    if (!firebaseUser || user?.uid === "demo") {
      setData({ clinics: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(
        `${base}/api/admin/integration-health?days=${days}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, user?.uid, days]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const isDemo = user?.uid === "demo";

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-muted" />
      </div>
    );
  }

  const clinics = data?.clinics ?? [];
  const totalIntegrations = clinics.reduce(
    (sum, c) => sum + Object.keys(c.integrations).length,
    0
  );
  let totalSyncs = 0;
  let totalOk = 0;
  let degradedCount = 0;
  let downCount = 0;
  for (const c of clinics) {
    for (const stat of Object.values(c.integrations)) {
      totalSyncs += stat.totalSyncs;
      totalOk += stat.successfulSyncs;
      if (stat.status === "degraded") degradedCount++;
      if (stat.status === "down") downCount++;
    }
  }
  const overallSuccessRate =
    totalSyncs > 0 ? Math.round((totalOk / totalSyncs) * 1000) / 10 : 100;

  const providerAggregate: Record<string, { clinics: number; totalSyncs: number; ok: number; totalDuration: number }> = {};
  for (const c of clinics) {
    for (const [provider, stat] of Object.entries(c.integrations)) {
      if (!providerAggregate[provider]) {
        providerAggregate[provider] = { clinics: 0, totalSyncs: 0, ok: 0, totalDuration: 0 };
      }
      providerAggregate[provider].clinics += 1;
      providerAggregate[provider].totalSyncs += stat.totalSyncs;
      providerAggregate[provider].ok += stat.successfulSyncs;
      providerAggregate[provider].totalDuration += stat.avgDurationMs * stat.totalSyncs;
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Integration Health"
          subtitle="PMS and HEP sync reliability across all clinics"
        />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-cloud-light p-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  days === d
                    ? "bg-white text-navy shadow-sm button-highlight"
                    : "text-muted hover:text-navy"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchHealth()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {isDemo && (
        <div className="rounded-[var(--radius-card)] border border-warn/20 bg-warn/5 px-4 py-3 text-sm text-warn flex items-center gap-2">
          <AlertTriangle size={14} />
          Sign in as a real superadmin account to view integration health data.
        </div>
      )}

      {error && (
        <div className="rounded-[var(--radius-card)] border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger flex items-center gap-2">
          <XCircle size={14} />
          {error}
        </div>
      )}

      {!isDemo && !error && !loading && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={14} className="text-blue" />
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                  Integrations
                </span>
              </div>
              <p className="font-display text-[28px] text-navy leading-none">
                {totalIntegrations}
              </p>
              <p className="text-[11px] text-muted mt-1">monitored</p>
            </div>
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={14} className="text-success" />
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                  Success rate
                </span>
              </div>
              <p className="font-display text-[28px] text-navy leading-none">
                {overallSuccessRate}%
              </p>
              <p className="text-[11px] text-muted mt-1">last {days}d</p>
            </div>
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-warn" />
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                  Degraded
                </span>
              </div>
              <p className="font-display text-[28px] text-navy leading-none">
                {degradedCount}
              </p>
              <p className="text-[11px] text-muted mt-1">70–95% success</p>
            </div>
            <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
              <div className="flex items-center gap-2 mb-2">
                <XCircle size={14} className={downCount > 0 ? "text-danger" : "text-muted"} />
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                  Down
                </span>
              </div>
              <p
                className={`font-display text-[28px] leading-none ${
                  downCount > 0 ? "text-danger" : "text-navy"
                }`}
              >
                {downCount}
              </p>
              <p className="text-[11px] text-muted mt-1">&lt; 70% or 3 fails</p>
            </div>
          </div>

          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-display text-lg text-navy">By clinic</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-8 px-2 py-3" />
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Clinic
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">
                      PMS
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Success rate
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Avg sync
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Last sync
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clinics.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-muted">
                        No integration health data in the last {days} days. Run the pipeline for
                        connected clinics to populate.
                      </td>
                    </tr>
                  ) : (
                    clinics.map((clinic) => {
                      const primaryProvider = clinic.pmsProvider || Object.keys(clinic.integrations)[0];
                      const primaryStat: ProviderHealthStats | null = primaryProvider
                        ? clinic.integrations[primaryProvider] ?? null
                        : null;
                      const isExpanded = expandedClinicId === clinic.clinicId;

                      return (
                        <Fragment key={clinic.clinicId}>
                          <tr
                            className="border-b border-border/50 hover:bg-cloud-light/50 transition-colors"
                          >
                            <td className="px-2 py-3">
                              {Object.keys(clinic.integrations).length > 0 ? (
                                <button
                                  onClick={() =>
                                    setExpandedClinicId(isExpanded ? null : clinic.clinicId)
                                  }
                                  className="text-muted hover:text-navy p-0.5"
                                >
                                  {isExpanded ? (
                                    <ChevronDown size={14} />
                                  ) : (
                                    <ChevronRight size={14} />
                                  )}
                                </button>
                              ) : null}
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm font-medium text-navy">{clinic.clinicName}</p>
                              <p className="text-[11px] text-muted">{clinic.clinicId}</p>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-[11px] text-navy">
                                {primaryProvider ? formatProvider(primaryProvider) : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              {primaryStat ? statusBadge(primaryStat.status) : "—"}
                            </td>
                            <td className="px-4 py-4 text-[11px] text-navy font-medium">
                              {primaryStat
                                ? `${primaryStat.successRate}%`
                                : "—"}
                            </td>
                            <td className="px-4 py-4 text-[11px] text-navy">
                              {primaryStat
                                ? formatDuration(primaryStat.avgDurationMs)
                                : "—"}
                            </td>
                            <td className="px-4 py-4 text-[11px] text-muted">
                              {primaryStat
                                ? formatLastSync(
                                    primaryStat.lastSuccessAt,
                                    primaryStat.lastFailureAt
                                  )
                                : "—"}
                            </td>
                          </tr>
                          {isExpanded && primaryStat?.stages && primaryStat.stages.length > 0 && (
                            <tr key={`${clinic.clinicId}-expanded`} className="bg-cloud-light/30">
                              <td colSpan={7} className="px-6 py-4">
                                <div className="space-y-2 pl-6 border-l-2 border-border">
                                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
                                    Per-stage breakdown
                                  </p>
                                  {primaryStat.stages.map((s) => (
                                    <div
                                      key={s.stage}
                                      className="flex items-center gap-4 text-[11px]"
                                    >
                                      <span className="font-medium text-navy w-40">{s.stage}</span>
                                      {statusBadge(s.status)}
                                      <span className="text-muted">{s.successRate}%</span>
                                      <span className="text-muted">
                                        {formatDuration(s.avgDurationMs)} avg
                                      </span>
                                      {s.lastErrors.length > 0 && (
                                        <span className="text-danger truncate max-w-[200px]" title={s.lastErrors.join(" ")}>
                                          {s.lastErrors[0]}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
            <button
              onClick={() => setProviderSectionOpen(!providerSectionOpen)}
              className="w-full px-6 py-4 border-b border-border flex items-center justify-between text-left hover:bg-cloud-light/50 transition-colors"
            >
              <h3 className="font-display text-lg text-navy">Per-provider aggregate</h3>
              {providerSectionOpen ? (
                <ChevronDown size={18} className="text-muted" />
              ) : (
                <ChevronRight size={18} className="text-muted" />
              )}
            </button>
            {providerSectionOpen && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">
                        Provider
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">
                        Clinics
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">
                        Success rate
                      </th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">
                        Avg response
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(providerAggregate).map(([provider, agg]) => {
                      const rate =
                        agg.totalSyncs > 0
                          ? Math.round((agg.ok / agg.totalSyncs) * 1000) / 10
                          : 100;
                      const avgMs =
                        agg.totalSyncs > 0
                          ? Math.round(agg.totalDuration / agg.totalSyncs)
                          : 0;
                      const status: IntegrationHealthStatus =
                        rate >= 95 ? "healthy" : rate >= 70 ? "degraded" : "down";
                      return (
                        <tr
                          key={provider}
                          className="border-b border-border/50 hover:bg-cloud-light/30"
                        >
                          <td className="px-6 py-3 text-sm font-medium text-navy">
                            {formatProvider(provider)}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-navy">{agg.clinics}</td>
                          <td className="px-4 py-3">{statusBadge(status)}</td>
                          <td className="px-4 py-3 text-[11px] text-navy font-medium">
                            {rate}%
                          </td>
                          <td className="px-4 py-3 text-[11px] text-muted">
                            {formatDuration(avgMs)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {loading && !isDemo && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted" />
        </div>
      )}
    </div>
  );
}
