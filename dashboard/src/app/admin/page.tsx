"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import PageHeader from "@/components/ui/PageHeader";
import Link from "next/link";
import {
  Shield,
  AlertTriangle,
  Clock,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Wifi,
  WifiOff,
  Eye,
  BookOpen,
  Activity,
} from "lucide-react";
import type { ClinicProfile, StripeSubscriptionStatus } from "@/types";

function hoursSince(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60));
}

function subStatusBadge(status: StripeSubscriptionStatus | null | undefined): { label: string; bg: string; text: string } {
  switch (status) {
    case "active":              return { label: "Active",      bg: "bg-success/10", text: "text-success" };
    case "trialing":            return { label: "Trial",       bg: "bg-blue/10",    text: "text-blue" };
    case "past_due":            return { label: "Past Due",    bg: "bg-warn/10",    text: "text-warn" };
    case "canceled":            return { label: "Canceled",    bg: "bg-danger/10",  text: "text-danger" };
    case "paused":              return { label: "Paused",      bg: "bg-muted/10",   text: "text-muted" };
    case "incomplete":          return { label: "Incomplete",  bg: "bg-warn/10",    text: "text-warn" };
    case "incomplete_expired":  return { label: "Expired",     bg: "bg-danger/10",  text: "text-danger" };
    case "unpaid":              return { label: "Unpaid",      bg: "bg-danger/10",  text: "text-danger" };
    default:                    return { label: "No sub",      bg: "bg-border",     text: "text-muted" };
  }
}

const DEMO_CLINICS: ClinicProfile[] = [
  {
    id: "clinic-spires",
    name: "Spires MSK Physiotherapy",
    timezone: "Europe/London",
    ownerEmail: "admin@spiresmsk.com",
    status: "live",
    pmsType: "writeupp",
    pmsLastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    trialStartedAt: null,
    featureFlags: { intelligence: true, continuity: true, receptionist: false },
    targets: { followUpRate: 4.0, hepRate: 95, utilisationRate: 75, dnaRate: 6, courseCompletionTarget: 80 },
    brandConfig: {},
    onboarding: { pmsConnected: true, cliniciansConfirmed: true, targetsSet: true },
    billing: { stripeCustomerId: "cus_demo1", subscriptionId: "sub_demo1", subscriptionStatus: "active", currentPeriodEnd: "2026-04-01T00:00:00Z" },
    createdAt: "2025-10-01T00:00:00Z",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "clinic-summit",
    name: "Summit Physio Clinic",
    timezone: "Europe/London",
    ownerEmail: "hello@summitphysio.co.uk",
    status: "onboarding",
    pmsType: "cliniko",
    pmsLastSyncAt: null,
    trialStartedAt: "2026-02-15T00:00:00Z",
    featureFlags: { intelligence: true, continuity: true, receptionist: false },
    targets: { followUpRate: 2.5, hepRate: 90, utilisationRate: 80, dnaRate: 5, courseCompletionTarget: 80 },
    brandConfig: {},
    onboarding: { pmsConnected: false, cliniciansConfirmed: true, targetsSet: false },
    billing: { stripeCustomerId: "cus_demo2", subscriptionId: "sub_demo2", subscriptionStatus: "trialing", currentPeriodEnd: "2026-03-31T00:00:00Z" },
    createdAt: "2026-02-15T00:00:00Z",
    updatedAt: "2026-02-20T00:00:00Z",
  },
  {
    id: "clinic-peak",
    name: "Peak Performance Rehab",
    timezone: "America/New_York",
    ownerEmail: "info@peakrehab.com",
    status: "live",
    pmsType: "writeupp",
    pmsLastSyncAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    trialStartedAt: null,
    featureFlags: { intelligence: true, continuity: true, receptionist: false },
    targets: { followUpRate: 3.0, hepRate: 92, utilisationRate: 80, dnaRate: 5, courseCompletionTarget: 80 },
    brandConfig: {},
    onboarding: { pmsConnected: true, cliniciansConfirmed: true, targetsSet: true },
    billing: { stripeCustomerId: "cus_demo3", subscriptionId: "sub_demo3", subscriptionStatus: "past_due", currentPeriodEnd: null },
    createdAt: "2025-08-20T00:00:00Z",
    updatedAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "clinic-move",
    name: "Move Well Studios",
    timezone: "Australia/Sydney",
    ownerEmail: "team@movewell.com.au",
    status: "paused",
    pmsType: null,
    pmsLastSyncAt: null,
    trialStartedAt: null,
    featureFlags: { intelligence: true, continuity: true, receptionist: false },
    targets: { followUpRate: 2.8, hepRate: 90, utilisationRate: 85, dnaRate: 5, courseCompletionTarget: 80 },
    brandConfig: {},
    onboarding: { pmsConnected: true, cliniciansConfirmed: true, targetsSet: true },
    billing: { stripeCustomerId: "cus_demo4", subscriptionId: null, subscriptionStatus: "canceled", currentPeriodEnd: null },
    createdAt: "2025-06-01T00:00:00Z",
    updatedAt: "2026-01-10T00:00:00Z",
  },
];

export default function AdminPage() {
  const { user, loading: authLoading, startImpersonation, impersonating, stopImpersonation } = useAuth();
  const router = useRouter();
  const [clinics, setClinics] = useState<ClinicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [usedDemo, setUsedDemo] = useState(false);

  const isSuperadmin = user?.role === "superadmin";

  useEffect(() => {
    if (!authLoading && user && !isSuperadmin) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router, isSuperadmin]);

  useEffect(() => {
    const isDemo = user?.uid === "demo";

    if (isDemo) {
      setClinics(DEMO_CLINICS);
      setUsedDemo(true);
      setLoading(false);
      return () => {};
    }

    if (!db || !isFirebaseConfigured) {
      setClinics([]);
      setUsedDemo(false);
      setLoading(false);
      return () => {};
    }
    const q = query(collection(db, "clinics"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ClinicProfile, "id">),
        }));
        setClinics(data);
        setUsedDemo(false);
        setLoading(false);
      },
      (err) => {
        console.error("[AdminPage]", err);
        setClinics([]);
        setUsedDemo(false);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user?.uid]);

  const liveCount = clinics.filter((c) => c.status === "live").length;
  const onboardingCount = clinics.filter((c) => c.status === "onboarding").length;
  const staleCount = clinics.filter((c) => {
    const hrs = hoursSince(c.pmsLastSyncAt ?? undefined);
    return c.onboarding?.pmsConnected && hrs !== null && hrs > 1;
  }).length;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Admin"
          subtitle="Monitor all clinics in real time"
        />
        <Link
          href="/admin/integration-health"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-blue hover:bg-blue/10 border border-blue/20 transition-colors"
        >
          <Activity size={14} />
          Integration Health
        </Link>
      </div>

      {usedDemo && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-warn/10 border border-warn/20 text-sm text-warn">
          <AlertTriangle size={14} />
          Showing demo clinic data — no Firestore clinics found.
        </div>
      )}

      {/* Internal resources */}
      <div className="flex items-center gap-3">
        <a
          href="https://wild-jaw-b99.notion.site/StrydeOS-Setup-Guide-8d119c6ab90a43d7b6456845c23bb534"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-medium text-[#059669] hover:bg-[#059669]/10 border border-[#059669]/20 transition-colors"
        >
          <BookOpen size={13} />
          Client Setup Guide
          <ExternalLink size={10} className="opacity-60" />
        </a>
        <a
          href="https://www.notion.so/Client-Journey-Discovery-to-Delivery-f69242cf223d46779c1639db322280fc"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-medium text-purple hover:bg-purple/10 border border-purple/20 transition-colors"
        >
          <BookOpen size={13} />
          Client Journey Playbook
          <ExternalLink size={10} className="opacity-60" />
        </a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className="text-blue" />
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Total</span>
          </div>
          <p className="font-display text-[28px] text-navy leading-none">{clinics.length}</p>
          <p className="text-[11px] text-muted mt-1">clinics</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={14} className="text-success" />
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Live</span>
          </div>
          <p className="font-display text-[28px] text-navy leading-none">{liveCount}</p>
          <p className="text-[11px] text-muted mt-1">active</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-blue" />
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Onboarding</span>
          </div>
          <p className="font-display text-[28px] text-navy leading-none">{onboardingCount}</p>
          <p className="text-[11px] text-muted mt-1">setting up</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className={staleCount > 0 ? "text-danger" : "text-muted"} />
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Stale Sync</span>
          </div>
          <p className={`font-display text-[28px] leading-none ${staleCount > 0 ? "text-danger" : "text-navy"}`}>
            {staleCount}
          </p>
          <p className="text-[11px] text-muted mt-1">&gt; 1h since sync</p>
        </div>
      </div>

        {/* Clinics table */}
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display text-lg text-navy">All Clinics</h3>
          {impersonating && (
            <button
              onClick={() => { stopImpersonation(); }}
              className="text-[11px] font-semibold text-warn hover:text-danger transition-colors"
            >
              Stop impersonation
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-6 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">Clinic</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">Billing</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">PMS</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">Last Sync</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider">Onboarding</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-muted uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {clinics.map((clinic) => {
                const syncHours = hoursSince(clinic.pmsLastSyncAt ?? undefined);
                const isStale = clinic.onboarding?.pmsConnected && syncHours !== null && syncHours > 1;
                const obSteps = clinic.onboarding
                  ? [clinic.onboarding.pmsConnected, clinic.onboarding.cliniciansConfirmed, clinic.onboarding.targetsSet].filter(Boolean).length
                  : 0;
                const subBadge = subStatusBadge(clinic.billing?.subscriptionStatus);

                return (
                  <tr key={clinic.id} className="border-b border-border/50 hover:bg-cloud-light/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-navy">{clinic.name}</p>
                      <p className="text-[11px] text-muted">{clinic.ownerEmail}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                          clinic.status === "live"
                            ? "bg-success/10 text-success"
                            : clinic.status === "onboarding"
                              ? "bg-blue/10 text-blue"
                              : clinic.status === "paused"
                                ? "bg-warn/10 text-warn"
                                : "bg-muted/10 text-muted"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          clinic.status === "live" ? "bg-success" :
                          clinic.status === "onboarding" ? "bg-blue" :
                          clinic.status === "paused" ? "bg-warn" : "bg-muted"
                        }`} />
                        {clinic.status.charAt(0).toUpperCase() + clinic.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-1 rounded-full ${subBadge.bg} ${subBadge.text}`}>
                        {subBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {clinic.onboarding?.pmsConnected ? (
                        <div className="flex items-center gap-1.5">
                          <Wifi size={12} className={isStale ? "text-danger" : "text-success"} />
                          <span className="text-[11px] text-navy">
                            {clinic.pmsType === "writeupp" ? "WriteUpp" : clinic.pmsType === "cliniko" ? "Cliniko" : "—"}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-muted">
                          <WifiOff size={12} />
                          <span className="text-[11px]">Not connected</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {syncHours !== null ? (
                        <span className={`text-[11px] font-medium ${isStale ? "text-danger" : "text-navy"}`}>
                          {syncHours < 1 ? "< 1h ago" : `${syncHours}h ago`}
                          {isStale && <AlertTriangle size={10} className="inline ml-1 -mt-0.5" />}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className={`w-2 h-2 rounded-full ${
                              i < obSteps ? "bg-success" : "bg-border"
                            }`}
                          />
                        ))}
                        <span className="text-[10px] text-muted ml-1">{obSteps}/3</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => {
                          startImpersonation(clinic);
                          router.push("/dashboard");
                        }}
                        className="flex items-center gap-1 text-[11px] font-semibold text-blue hover:text-blue-bright transition-colors"
                      >
                        <Eye size={11} />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
