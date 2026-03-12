"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
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
  Moon,
  Sun,
  Lock,
  CreditCard,
  HelpCircle,
} from "lucide-react";
import HelpPanel from "@/components/HelpPanel";
import { LogoNav } from "@/components/MonolithLogo";
import { useTheme } from "@/components/ThemeProvider";
import { useWeeklyStats } from "@/hooks/useWeeklyStats";
import { useClinicianSummaryStats } from "@/hooks/useClinicianSummaryStats";
import { usePatients } from "@/hooks/usePatients";
import { computeAlerts, getInitials } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import type { AlertFlagProps } from "@/types";
import type { ModuleKey } from "@/lib/billing";

type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  href: string;
  accent: string;
  moduleKey: ModuleKey | null;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: LayoutGrid, href: "/dashboard", accent: "#1C54F2", moduleKey: null },
  { label: "Clinicians", icon: Users, href: "/clinicians", accent: "#1C54F2", moduleKey: null },
  { label: "Pulse", icon: RefreshCw, href: "/continuity", accent: "#0891B2", moduleKey: "pulse" },
  { label: "Ava", icon: Phone, href: "/receptionist", accent: "#1C54F2", moduleKey: "ava" },
  { label: "Intelligence", icon: BarChart3, href: "/intelligence", accent: "#8B5CF6", moduleKey: "intelligence" },
];

const SYSTEM_ITEMS = [
  { label: "Settings", icon: Settings, href: "/settings" },
  { label: "Billing", icon: CreditCard, href: "/billing" },
];

const READ_ALERTS_KEY = "strydeos_read_alerts";

function alertHash(clinicianName: string, alert: AlertFlagProps): string {
  return `${clinicianName}:${alert.metric}:${alert.current}`;
}

function useAlerts() {
  const { stats } = useWeeklyStats("all");
  const { rows: summaryRows } = useClinicianSummaryStats();

  const rows = useMemo(() => {
    if (summaryRows.length > 0) return summaryRows;
    if (stats.length === 0) return [];
    const latest = stats[stats.length - 1];
    return [{ clinicianName: latest.clinicianName, stats: latest }];
  }, [summaryRows, stats]);

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

function usePulseBadge(): number {
  const { churnRisk } = usePatients();
  return churnRisk.length;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { hasModule } = useEntitlements();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const { allAlerts, unreadCount, readHashes, markAllRead } = useAlerts();
  const pulseBadge = usePulseBadge();

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
        style={{ background: theme === "dark" ? "#0D1F3C" : "#0B2545" }}
      >
        {/* Logo + notification bell row */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <Link
            href="/dashboard"
            onClick={(e) => {
              if (pathname === "/dashboard" || pathname === "/") {
                e.preventDefault();
                router.refresh();
              }
            }}
            className="group transition-all duration-200 hover:-translate-y-0.5"
          >
            <LogoNav theme="dark" />
          </Link>

          {/* Notification bell */}
          <div ref={notifRef} className="relative" data-tour="notification-bell">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
              aria-label="Notifications"
            >
              <Bell size={15} className="text-white/50 hover:text-white/80 transition-colors" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: "#EF4444" }}
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
                              style={{ background: alert.severity === "danger" ? "#EF4444" : "#F59E0B" }}
                            />
                            {isUnread && (
                              <div
                                className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                                style={{ background: "#4B8BF5" }}
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
                    style={{ color: "#4B8BF5" }}
                  >
                    View all on dashboard <ExternalLink size={10} />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 overflow-y-auto" data-tour="sidebar-nav">
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/25">
            Navigation
          </p>
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href === "/dashboard" && pathname === "/");
              const badge = item.href === "/continuity" && pulseBadge > 0 ? pulseBadge : 0;
              const isLocked = item.moduleKey !== null && !hasModule(item.moduleKey);
              const href = isLocked ? "/billing" : item.href;

              return (
                <Link
                  key={item.label}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
                    isLocked
                      ? "text-white/25 hover:text-white/40 hover:bg-white/[0.03]"
                      : isActive
                        ? "text-white"
                        : "text-white/45 hover:text-white/75 hover:bg-white/[0.04]"
                  }`}
                  title={isLocked ? `${item.label} — not included in your plan` : undefined}
                >
                  {!isLocked && isActive && (
                    <motion.div
                      layoutId="nav-active-indicator"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: "rgba(255,255,255,0.08)",
                        borderLeft: `3px solid ${item.accent}`,
                      }}
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <span className="relative z-[1] flex items-center gap-3 w-full">
                    <item.icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                    <span className="flex-1">{item.label}</span>
                    {isLocked ? (
                      <Lock size={11} className="text-white/20" />
                    ) : badge > 0 ? (
                      <span
                        className="min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ background: item.accent }}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="mt-6" data-tour="settings-link">
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
                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
                      isActive
                        ? "text-white"
                        : "text-white/45 hover:text-white/75 hover:bg-white/[0.04]"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="system-active-indicator"
                        className="absolute inset-0 rounded-lg"
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          borderLeft: "3px solid #1C54F2",
                        }}
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    <span className="relative z-[1] flex items-center gap-3">
                      <item.icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                      {item.label}
                    </span>
                  </Link>
                );
              })}
              <button
                onClick={() => setHelpOpen(true)}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
                  helpOpen
                    ? "text-white"
                    : "text-white/45 hover:text-white/75 hover:bg-white/[0.04]"
                }`}
              >
                {helpOpen && (
                  <motion.div
                    layoutId="system-active-indicator"
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      borderLeft: "3px solid #1C54F2",
                    }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <span className="relative z-[1] flex items-center gap-3">
                  <HelpCircle size={16} strokeWidth={helpOpen ? 2 : 1.5} />
                  Help
                </span>
              </button>
              {isSuperAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMobileOpen(false)}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
                    pathname === "/admin"
                      ? "text-white"
                      : "text-white/45 hover:text-white/75 hover:bg-white/[0.04]"
                  }`}
                >
                  {pathname === "/admin" && (
                    <motion.div
                      layoutId="system-active-indicator"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: "rgba(255,255,255,0.08)",
                        borderLeft: "3px solid #1C54F2",
                      }}
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <span className="relative z-[1] flex items-center gap-3">
                    <Shield size={16} strokeWidth={pathname === "/admin" ? 2 : 1.5} />
                    Stryde Super User
                  </span>
                </Link>
              )}
            </div>
          </div>

          {/* Quick search hint */}
          <div className="mt-4 px-3" data-tour="command-palette">
            <button
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-white/25 hover:text-white/40 hover:bg-white/5 transition-colors"
            >
              <Command size={12} />
              <span className="flex-1 text-left">Quick search</span>
              <kbd className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/8 border border-white/10">
                {typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘" : "Ctrl+"}K
              </kbd>
            </button>
          </div>

          {/* Dark mode toggle */}
          <div className="mt-2 px-3">
            <button
              onClick={(e) => toggleTheme(e)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-white/25 hover:text-white/40 hover:bg-white/5 transition-colors"
            >
              {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
              <span className="flex-1 text-left">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
              <kbd className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/8 border border-white/10">
                {typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘" : "Ctrl+"}D
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
              <p className="text-[13px] font-semibold text-white truncate">{clinicName}</p>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${statusColorClass.split(" ")[0]}`} />
                <span className="text-[10px] font-medium text-white/35">
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

      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
