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
  FileText,
} from "lucide-react";
import dynamic from "next/dynamic";
import { LogoNav, MonolithMark } from "@/components/MonolithLogo";

const HelpPanel = dynamic(
  () => import("@/components/HelpPanel"),
  {
    loading: () => <div className="animate-pulse bg-navy/10 rounded-xl h-full w-[480px] fixed top-0 right-0" />,
    ssr: false,
  }
);
import { useTheme } from "@/components/ThemeProvider";
import { useWeeklyStats } from "@/hooks/useWeeklyStats";
import { useClinicianSummaryStats } from "@/hooks/useClinicianSummaryStats";
import { usePatients } from "@/hooks/usePatients";
import { computeAlerts, getInitials } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useInsightEvents } from "@/hooks/useInsightEvents";
import { useSidebar } from "@/context/SidebarContext";
import type { AlertFlagProps } from "@/types";
import type { ModuleKey } from "@/lib/billing";
import { brand } from "@/lib/brand";

type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  href: string;
  accent: string;
  moduleKey: ModuleKey | null;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: LayoutGrid, href: "/dashboard", accent: brand.blue, moduleKey: null },
  { label: "Clinicians", icon: Users, href: "/clinicians", accent: brand.blue, moduleKey: null },
  { label: "Pulse", icon: RefreshCw, href: "/continuity", accent: brand.teal, moduleKey: "pulse" },
  { label: "Ava", icon: Phone, href: "/receptionist", accent: brand.blue, moduleKey: "ava" },
  { label: "Intelligence", icon: BarChart3, href: "/intelligence", accent: brand.purple, moduleKey: "intelligence" },
];

const SYSTEM_ITEMS = [
  { label: "Settings", icon: Settings, href: "/settings" },
  { label: "Billing", icon: CreditCard, href: "/billing" },
  { label: "API Docs", icon: FileText, href: "/api-docs" },
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
  const { activeEvents: allInsightEvents, markAsRead: markInsightRead } = useInsightEvents();
  // Bell only shows critical/warning — positive events don't belong in alerts
  const insightEvents = allInsightEvents.filter((e) => e.severity !== "positive");
  const insightUnreadCount = insightEvents.filter((e) => !e.readAt).length;
  const pulseBadge = usePulseBadge();
  const totalBellCount = unreadCount + insightUnreadCount;

  // ─── Collapsible sidebar state (shared via context for layout sync) ────────
  const { collapsed, setCollapsed } = useSidebar();
  const autoCollapseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(false);
  const initialMountRef = useRef(true);

  // Desktop detection — motion width only on lg+
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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

  // Auto-collapse sidebar after 4s on first session visit
  useEffect(() => {
    try {
      if (sessionStorage.getItem("strydeos-sidebar-seen") === "1") return;
    } catch {
      return;
    }
    autoCollapseRef.current = setTimeout(() => {
      if (!isHoveredRef.current) {
        setCollapsed(true);
      }
      try {
        sessionStorage.setItem("strydeos-sidebar-seen", "1");
      } catch { /* sessionStorage may be unavailable */ }
    }, 4000);
    return () => {
      if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current);
    };
  }, []);

  // Collapse sidebar on route change (skip initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (!isHoveredRef.current) {
      setCollapsed(true);
    }
  }, [pathname]);

  const handleSidebarEnter = useCallback(() => {
    isHoveredRef.current = true;
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current);
    setCollapsed(false);
  }, []);

  const handleSidebarLeave = useCallback(() => {
    isHoveredRef.current = false;
    leaveTimerRef.current = setTimeout(() => {
      setCollapsed(true);
    }, 400);
  }, []);

  const statusLabel =
    clinicStatus === "live"
      ? "Live"
      : clinicStatus === "onboarding"
        ? "Onboarding"
        : clinicStatus === "paused"
          ? "Paused"
          : "Inactive";

  const statusBg =
    clinicStatus === "live"
      ? "bg-success"
      : clinicStatus === "onboarding"
        ? "bg-blue"
        : "bg-muted";

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden rounded-xl p-2.5 shadow-md border border-white/10"
        style={{ background: brand.navy }}
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

      {/* Desktop: floating MonolithMark — visible when sidebar collapsed */}
      <motion.div
        className="fixed top-5 left-5 z-[35] hidden lg:flex cursor-pointer"
        animate={{
          opacity: collapsed ? 1 : 0,
          scale: collapsed ? 1 : 0.85,
          filter: collapsed ? "blur(0px)" : "blur(4px)",
        }}
        transition={{
          duration: collapsed ? 0.4 : 0.15,
          delay: collapsed ? 0.35 : 0,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{ pointerEvents: collapsed ? "auto" : "none" }}
        onMouseEnter={handleSidebarEnter}
        aria-hidden="true"
      >
        <MonolithMark size={32} />
      </motion.div>

      {/* Desktop: left-edge hover trigger strip when collapsed */}
      <motion.div
        className="fixed top-0 left-0 z-[36] hidden lg:block h-full"
        animate={{
          width: collapsed ? 14 : 0,
          opacity: collapsed ? 1 : 0,
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{ pointerEvents: collapsed ? "auto" : "none" }}
        onMouseEnter={handleSidebarEnter}
      >
        {/* Subtle glow line to invite hover */}
        <motion.div
          className="absolute top-0 right-0 w-[1px] h-full"
          animate={{
            opacity: collapsed ? [0, 0.15, 0] : 0,
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            background: `linear-gradient(to bottom, transparent 10%, ${brand.blueGlow} 50%, transparent 90%)`,
          }}
        />
      </motion.div>

      {/* Sidebar — desktop uses width animation (inline), mobile uses translate (overlay) */}
      <motion.aside
        role="navigation"
        aria-label="Main navigation"
        onMouseEnter={handleSidebarEnter}
        onMouseLeave={handleSidebarLeave}
        className={`fixed top-0 left-0 z-40 h-full overflow-hidden
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
          transition-transform duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)]`}
        animate={isDesktop ? { width: collapsed ? 0 : 240 } : { width: 240 }}
        transition={{
          duration: 0.55,
          ease: [0.22, 1, 0.36, 1],
          delay: collapsed ? 0.12 : 0,
        }}
        style={{ background: brand.navy }}
      >
      <motion.div
        className="w-60 min-w-[240px] h-full flex flex-col"
        animate={isDesktop ? {
          opacity: collapsed ? 0 : 1,
          x: collapsed ? -8 : 0,
          filter: collapsed ? "blur(2px)" : "blur(0px)",
        } : { opacity: 1, x: 0, filter: "blur(0px)" }}
        transition={{
          duration: collapsed ? 0.18 : 0.35,
          delay: collapsed ? 0 : 0.28,
          ease: collapsed ? "easeIn" : [0.22, 1, 0.36, 1],
        }}
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
              {totalBellCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: brand.danger }}
                >
                  {totalBellCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute left-0 top-full mt-2 w-72 rounded-xl shadow-[var(--shadow-elevated)] overflow-hidden z-50 animate-fade-in"
                style={{ background: brand.navyMid, border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-white/45 uppercase tracking-widest">
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
                              style={{ background: alert.severity === "danger" ? brand.danger : brand.warning }}
                            />
                            {isUnread && (
                              <div
                                className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                                style={{ background: brand.blueGlow }}
                              />
                            )}
                          </div>
                          <div>
                            <p className={`text-[13px] leading-tight ${isUnread ? "font-semibold text-white" : "font-medium text-white/65"}`}>
                              {alert.clinicianName}
                            </p>
                            <p className={`text-[12px] mt-0.5 ${isUnread ? "text-white/55" : "text-white/35"}`}>
                              {alert.metric} — {alert.current < 1 ? `${Math.round(alert.current * 100)}%` : alert.current.toFixed(1)} vs target {alert.target < 1 ? `${Math.round(alert.target * 100)}%` : alert.target.toFixed(1)}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
                {/* Intelligence insight events */}
                {insightEvents.length > 0 && (
                  <>
                    <div className="px-4 py-2.5 border-t border-white/8">
                      <p className="text-[11px] font-semibold text-white/45 uppercase tracking-widest">
                        Intelligence
                      </p>
                    </div>
                    <div className="py-1 max-h-48 overflow-y-auto">
                      {insightEvents.slice(0, 5).map((event) => {
                        const isUnread = !event.readAt;
                        const sevColor =
                          event.severity === "critical" ? brand.danger :
                          event.severity === "positive" ? brand.success :
                          brand.warning;
                        return (
                          <Link
                            key={event.id}
                            href="/intelligence"
                            onClick={() => {
                              if (isUnread) markInsightRead(event.id);
                              setNotifOpen(false);
                              setMobileOpen(false);
                            }}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                          >
                            <div className="relative mt-1.5 shrink-0">
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: sevColor }}
                              />
                              {isUnread && (
                                <div
                                  className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                                  style={{ background: brand.purple }}
                                />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className={`text-[13px] leading-tight truncate ${isUnread ? "font-semibold text-white" : "font-medium text-white/65"}`}>
                                {event.title.length > 60 ? event.title.slice(0, 60) + "…" : event.title}
                              </p>
                              <p className={`text-[12px] mt-0.5 ${isUnread ? "text-white/55" : "text-white/35"}`}>
                                {event.suggestedAction.length > 50 ? event.suggestedAction.slice(0, 50) + "…" : event.suggestedAction}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}

                <div className="px-4 py-2.5 border-t border-white/8">
                  <Link
                    href={insightEvents.length > 0 ? "/intelligence" : "/dashboard"}
                    onClick={() => { setNotifOpen(false); setMobileOpen(false); }}
                    className="text-[11px] font-semibold hover:text-white transition-colors flex items-center gap-1"
                    style={{ color: brand.blueGlow }}
                  >
                    {insightEvents.length > 0 ? "View all insights" : "View all on dashboard"} <ExternalLink size={10} />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 overflow-y-auto" data-tour="sidebar-nav">
          <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/30">
            Navigation
          </p>
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href === "/dashboard" && pathname === "/");
              const badge = item.href === "/continuity" && pulseBadge > 0 ? pulseBadge : 0;
              const isLocked = item.moduleKey !== null && !hasModule(item.moduleKey);
              const href = item.href;

              return (
                <Link
                  key={item.label}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                    isLocked
                      ? "text-white/25 hover:text-white/40 hover:bg-white/[0.03]"
                      : isActive
                        ? "text-white"
                        : "text-white/50 hover:text-white/80 hover:bg-white/[0.05]"
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
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/30">
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
                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                      isActive
                        ? "text-white"
                        : "text-white/50 hover:text-white/80 hover:bg-white/[0.05]"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="system-active-indicator"
                        className="absolute inset-0 rounded-lg"
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          borderLeft: `3px solid ${brand.blue}`,
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
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                  helpOpen
                    ? "text-white"
                    : "text-white/50 hover:text-white/80 hover:bg-white/[0.05]"
                }`}
              >
                {helpOpen && (
                  <motion.div
                    layoutId="system-active-indicator"
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      borderLeft: `3px solid ${brand.blue}`,
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
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                    pathname?.startsWith("/admin")
                    ? "text-white"
                    : "text-white/50 hover:text-white/80 hover:bg-white/[0.05]"
                  }`}
                >
                  {pathname?.startsWith("/admin") && (
                    <motion.div
                      layoutId="system-active-indicator-admin"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: "rgba(255,255,255,0.08)",
                        borderLeft: `3px solid ${brand.blue}`,
                      }}
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <span className="relative z-[1] flex items-center gap-3">
                    <Shield size={16} strokeWidth={pathname?.startsWith("/admin") ? 2 : 1.5} />
                    Admin
                  </span>
                </Link>
              )}
            </div>
          </div>

        </nav>

        {/* Bottom utilities + profile */}
        <div className="px-3 pt-2 pb-3 border-t border-white/8">
          {/* Quick search hint */}
          <div className="mb-1" data-tour="command-palette">
            <button
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-white/30 hover:text-white/50 hover:bg-white/5 transition-all duration-200"
            >
              <Command size={12} />
              <span className="flex-1 text-left">Quick search</span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/8 border border-white/10">
                {typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘" : "Ctrl+"}K
              </kbd>
            </button>
          </div>

          {/* Dark mode toggle */}
          <div className="mb-2">
            <button
              onClick={(e) => toggleTheme(e)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-white/30 hover:text-white/50 hover:bg-white/5 transition-all duration-200"
            >
              {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
              <span className="flex-1 text-left">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/8 border border-white/10">
                {typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘" : "Ctrl+"}D
              </kbd>
            </button>
          </div>

          {/* Profile menu */}
          <div ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <div className="h-8 w-8 rounded-full bg-navy-mid flex items-center justify-center text-[11px] font-bold text-white/65 shrink-0">
              {clinicInitials}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-semibold text-white truncate">{clinicName}</p>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${statusBg}`} />
                <span className="text-[11px] font-medium text-white/40">
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
              style={{ background: brand.navyMid, border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="px-4 py-3 border-b border-white/8">
                <p className="text-[13px] font-semibold text-white">{clinicName}</p>
                <p className="text-[12px] text-white/45 mt-0.5">{user?.email}</p>
              </div>
              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => { setProfileOpen(false); setMobileOpen(false); }}
                  className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-white/65 hover:text-white hover:bg-white/5 transition-all duration-200"
                >
                  <UserCircle size={14} />
                  Account settings
                </Link>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-white/45 hover:text-danger hover:bg-white/5 transition-all duration-200"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </motion.div>
      </motion.aside>

      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
