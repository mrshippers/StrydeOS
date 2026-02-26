"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid,
  Users,
  RefreshCw,
  Phone,
  BarChart3,
  Settings,
  Menu,
  X,
  Bell,
  ChevronUp,
  LogOut,
  UserCircle,
  ExternalLink,
  Shield,
  CheckCheck,
  Command,
} from "lucide-react";
import { getDemoLatestWeekStats } from "@/hooks/useDemoData";
import { useWeeklyStats } from "@/hooks/useWeeklyStats";
import { computeAlerts, getInitials } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { AlertFlagProps } from "@/types";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutGrid, href: "/dashboard", accent: undefined },
  { label: "Clinicians", icon: Users, href: "/clinicians", accent: undefined },
  { label: "Continuity", icon: RefreshCw, href: "/continuity", accent: "#0891B2" },
  { label: "Receptionist", icon: Phone, href: "/receptionist", accent: "#1A5CDB" },
  { label: "Intelligence", icon: BarChart3, href: "/intelligence", accent: "#8B5CF6" },
];

const SYSTEM_ITEMS = [
  { label: "Settings", icon: Settings, href: "/settings" },
];

const READ_ALERTS_KEY = "strydeos_read_alerts";

function alertHash(clinicianName: string, alert: AlertFlagProps): string {
  return `${clinicianName}:${alert.metric}:${alert.current}`;
}

function useAlerts() {
  const { stats, usedDemo } = useWeeklyStats("all");

  const rows = useMemo(() => {
    if (usedDemo || stats.length === 0) return getDemoLatestWeekStats();
    const latest = stats[stats.length - 1];
    return [{ clinicianName: latest.clinicianName, stats: latest }];
  }, [usedDemo, stats]);

  const allAlerts = useMemo(() => {
    return rows.flatMap(({ clinicianName, stats }) =>
      computeAlerts(stats).map((alert) => ({
        ...alert,
        clinicianName,
        hash: alertHash(clinicianName, alert),
      }))
    );
  }, [rows]);

  const [readHashes, setReadHashes] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(READ_ALERTS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const unreadCount = useMemo(
    () => allAlerts.filter((a) => !readHashes.has(a.hash)).length,
    [allAlerts, readHashes]
  );

  const markAllRead = useCallback(() => {
    const hashes = new Set(allAlerts.map((a) => a.hash));
    setReadHashes(hashes);
    try {
      localStorage.setItem(READ_ALERTS_KEY, JSON.stringify([...hashes]));
    } catch {
      // localStorage unavailable
    }
  }, [allAlerts]);

  return { allAlerts, unreadCount, readHashes, markAllRead, rows };
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const { allAlerts, unreadCount, readHashes, markAllRead } = useAlerts();

  const clinicName = user?.clinicProfile?.name ?? "My Clinic";
  const clinicStatus = user?.clinicProfile?.status ?? "live";
  const clinicInitials = clinicName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const isSuperAdmin = user?.role === "superadmin";

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleSignOut() {
    setProfileOpen(false);
    await signOut();
    router.replace("/login");
  }

  const statusLabel =
    clinicStatus === "live"
      ? "Live"
      : clinicStatus === "onboarding"
        ? "Onboarding"
        : clinicStatus === "paused"
          ? "Paused"
          : "Inactive";

  const statusColorClass =
    clinicStatus === "live"
      ? "bg-success text-success"
      : clinicStatus === "onboarding"
        ? "bg-blue text-blue"
        : "bg-muted text-muted";

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden rounded-xl p-2.5 shadow-md border border-white/10"
        style={{ background: "#0B2545" }}
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X size={18} color="white" /> : <Menu size={18} color="white" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-full w-60 flex flex-col transition-transform duration-200 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        style={{ background: "#0B2545" }}
      >
        {/* Logo + notification bell row */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="h-9 w-9 rounded-[10px] flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #0B2545, #1A5CDB)" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 13L8 3l5 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 9h5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-[16px] font-bold tracking-tight text-white">
              Stryde<span style={{ color: "#3B90FF" }}>OS</span>
            </span>
          </div>

          {/* Notification bell */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
              aria-label="Notifications"
            >
              <Bell size={15} className="text-white/50 hover:text-white/80 transition-colors" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: "#DC2626" }}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute left-0 top-full mt-2 w-72 rounded-xl shadow-[var(--shadow-elevated)] overflow-hidden z-50 animate-fade-in"
                style={{ background: "#132D5E", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
                    Alerts this week
                  </p>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-[10px] font-semibold text-white/30 hover:text-white/60 transition-colors"
                    >
                      <CheckCheck size={10} />
                      Mark all read
                    </button>
                  )}
                </div>
                {allAlerts.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-white/35 italic">
                    All metrics on target.
                  </div>
                ) : (
                  <div className="py-1 max-h-72 overflow-y-auto">
                    {allAlerts.map((alert) => {
                      const isUnread = !readHashes.has(alert.hash);
                      return (
                        <Link
                          key={alert.hash}
                          href="/dashboard"
                          onClick={() => { setNotifOpen(false); setMobileOpen(false); }}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                        >
                          <div className="relative mt-1.5 shrink-0">
                            <div
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: alert.severity === "danger" ? "#DC2626" : "#F59E0B" }}
                            />
                            {isUnread && (
                              <div
                                className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                                style={{ background: "#3B90FF" }}
                              />
                            )}
                          </div>
                          <div>
                            <p className={`text-[12px] leading-tight ${isUnread ? "font-semibold text-white" : "font-medium text-white/60"}`}>
                              {alert.clinicianName}
                            </p>
                            <p className={`text-[11px] mt-0.5 ${isUnread ? "text-white/50" : "text-white/30"}`}>
                              {alert.metric} — {alert.current < 1 ? `${Math.round(alert.current * 100)}%` : alert.current.toFixed(1)} vs target {alert.target < 1 ? `${Math.round(alert.target * 100)}%` : alert.target.toFixed(1)}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
                <div className="px-4 py-2.5 border-t border-white/8">
                  <Link
                    href="/dashboard"
                    onClick={() => { setNotifOpen(false); setMobileOpen(false); }}
                    className="text-[11px] font-semibold hover:text-white transition-colors flex items-center gap-1"
                    style={{ color: "#3B90FF" }}
                  >
                    View all on dashboard <ExternalLink size={10} />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 overflow-y-auto">
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/25">
            Navigation
          </p>
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href === "/dashboard" && pathname === "/");
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                    isActive
                      ? "bg-blue/15 text-white"
                      : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  }`}
                >
                  <item.icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                  {item.label}
                  {item.accent && (
                    <div
                      className="w-1.5 h-1.5 rounded-full ml-auto"
                      style={{ backgroundColor: item.accent }}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          <div className="mt-6">
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/25">
              System
            </p>
            <div className="space-y-0.5">
              {SYSTEM_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-blue/15 text-white"
                        : "text-white/40 hover:text-white/70 hover:bg-white/5"
                    }`}
                  >
                    <item.icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                    {item.label}
                  </Link>
                );
              })}
              {isSuperAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                    pathname === "/admin"
                      ? "bg-blue/15 text-white"
                      : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  }`}
                >
                  <Shield size={16} strokeWidth={pathname === "/admin" ? 2 : 1.5} />
                  Stryde Super User
                </Link>
              )}
            </div>
          </div>

          {/* Quick search hint */}
          <div className="mt-4 px-3">
            <button
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-white/25 hover:text-white/40 hover:bg-white/5 transition-colors"
            >
              <Command size={12} />
              <span className="flex-1 text-left">Quick search</span>
              <kbd className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/8 border border-white/10">
                {"\u2318"}K
              </kbd>
            </button>
          </div>
        </nav>

        {/* Bottom — profile menu */}
        <div className="px-3 py-3 border-t border-white/8" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <div className="h-8 w-8 rounded-full bg-navy-mid flex items-center justify-center text-[10px] font-bold text-white/60 shrink-0">
              {clinicInitials}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[12px] font-medium text-white/70 truncate">{clinicName}</p>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${statusColorClass.split(" ")[0]}`} />
                <span className={`text-[10px] font-semibold ${statusColorClass.split(" ")[1]}`}>
                  {statusLabel}
                </span>
              </div>
            </div>
            <ChevronUp
              size={14}
              className={`text-white/30 transition-transform ${profileOpen ? "rotate-0" : "rotate-180"}`}
            />
          </button>

          {profileOpen && (
            <div
              className="mt-1 rounded-xl overflow-hidden animate-fade-in"
              style={{ background: "#132D5E", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="px-4 py-3 border-b border-white/8">
                <p className="text-[12px] font-semibold text-white">{clinicName}</p>
                <p className="text-[11px] text-white/40 mt-0.5">{user?.email}</p>
              </div>
              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => { setProfileOpen(false); setMobileOpen(false); }}
                  className="flex items-center gap-3 px-4 py-2.5 text-[12px] text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <UserCircle size={14} />
                  Account settings
                </Link>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] text-white/40 hover:text-danger hover:bg-white/5 transition-colors"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
