"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  CheckCheck,
  AlertTriangle,
  Zap,
  ArrowRight,
  Bell,
} from "lucide-react";
import { brand } from "@/lib/brand";
import { usePortalTarget } from "@/hooks/usePortalTarget";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import type { AlertFlagProps } from "@/types";
import type { InsightEvent } from "@/types/insight-events";

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  allAlerts: Array<AlertFlagProps & { clinicianName: string; hash: string }>;
  readHashes: Set<string>;
  markAllRead: () => void;
  insightEvents: InsightEvent[];
  markInsightRead: (id: string) => Promise<void>;
}

export default function NotificationPanel({
  open,
  onClose,
  allAlerts,
  readHashes,
  markAllRead,
  insightEvents,
  markInsightRead,
}: NotificationPanelProps) {
  const portalTarget = usePortalTarget();
  useBodyScrollLock(open);

  // Escape key dismiss
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!portalTarget) return null;

  const unreadAlertCount = allAlerts.filter((a) => !readHashes.has(a.hash)).length;
  const unreadInsightCount = insightEvents.filter((e) => !e.readAt).length;
  const totalUnread = unreadAlertCount + unreadInsightCount;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — slow fade to match panel timing */}
          <motion.div
            key="notif-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="fixed inset-0 z-[60]"
            style={{ background: "rgba(11,37,69,0.45)", backdropFilter: "blur(3px)" }}
            onClick={onClose}
          />

          {/* Panel — slower slide, deliberate reveal (PS button hold feel) */}
          <motion.div
            key="notif-panel"
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{
              duration: 0.55,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="fixed top-0 right-0 h-full w-[360px] max-w-[90vw] z-[65] flex flex-col shadow-2xl"
            style={{
              background: brand.navy,
              borderLeft: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {/* ── Header ────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <Bell size={15} className="text-white/40" />
                <h2 className="text-[14px] font-semibold text-white">Notifications</h2>
                {totalUnread > 0 && (
                  <span
                    className="min-w-[18px] h-[18px] px-1.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ background: brand.danger }}
                  >
                    {totalUnread}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* ── Scrollable content ────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              {/* ─── Tier 1: Alerts ─────────────────────────────── */}
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={12} className="text-white/30" />
                    <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
                      Alerts
                    </p>
                  </div>
                  {unreadAlertCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-[10px] font-semibold text-white/25 hover:text-white/50 transition-colors"
                    >
                      <CheckCheck size={10} />
                      Mark all read
                    </button>
                  )}
                </div>

                {allAlerts.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-[12px] text-white/25 italic">
                      All metrics on target — nothing to flag.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {allAlerts.map((alert) => {
                      const isUnread = !readHashes.has(alert.hash);
                      return (
                        <motion.div
                          key={alert.hash}
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                          <Link
                            href="/dashboard"
                            onClick={onClose}
                            className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                          >
                            <div className="relative mt-1.5 shrink-0">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                  background: alert.severity === "danger" ? brand.danger : brand.warning,
                                  boxShadow: isUnread ? `0 0 6px ${alert.severity === "danger" ? brand.danger : brand.warning}60` : "none",
                                }}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-[13px] leading-tight ${isUnread ? "font-semibold text-white" : "font-medium text-white/55"}`}>
                                {alert.clinicianName}
                              </p>
                              <p className={`text-[12px] mt-0.5 ${isUnread ? "text-white/50" : "text-white/30"}`}>
                                {alert.metric} — {alert.current < 1 ? `${Math.round(alert.current * 100)}%` : alert.current.toFixed(1)} vs target {alert.target < 1 ? `${Math.round(alert.target * 100)}%` : alert.target.toFixed(1)}
                              </p>
                            </div>
                          </Link>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ─── Tier 2: Intelligence ───────────────────────── */}
              <div className="px-5 pt-3 pb-2 border-t border-white/6 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={12} className="text-purple/60" />
                  <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
                    Intelligence
                  </p>
                  {unreadInsightCount > 0 && (
                    <span
                      className="min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ background: brand.purple }}
                    >
                      {unreadInsightCount}
                    </span>
                  )}
                </div>

                {insightEvents.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-[12px] text-white/25 italic">
                      No insights yet — they&apos;ll appear as data flows in.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {insightEvents.slice(0, 8).map((event, i) => {
                      const isUnread = !event.readAt;
                      const sevColor =
                        event.severity === "critical" ? brand.danger :
                        event.severity === "positive" ? brand.success :
                        brand.warning;
                      return (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, ease: "easeOut", delay: i * 0.03 }}
                        >
                          <button
                            onClick={() => {
                              if (isUnread) void markInsightRead(event.id);
                            }}
                            className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                          >
                            <div className="relative mt-1.5 shrink-0">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                  background: sevColor,
                                  boxShadow: isUnread ? `0 0 6px ${sevColor}60` : "none",
                                }}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-[13px] leading-tight truncate ${isUnread ? "font-semibold text-white" : "font-medium text-white/55"}`}>
                                {event.title}
                              </p>
                              <p className={`text-[12px] mt-0.5 truncate ${isUnread ? "text-white/50" : "text-white/30"}`}>
                                {event.suggestedAction}
                              </p>
                            </div>
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ─── Tier 3: Quick Actions ──────────────────────── */}
              <div className="px-5 pt-3 pb-4 border-t border-white/6 mt-2">
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-3">
                  Quick Actions
                </p>
                <div className="space-y-1">
                  <Link
                    href="/intelligence"
                    onClick={onClose}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors group"
                  >
                    <span>View all insights</span>
                    <ArrowRight size={13} className="text-white/20 group-hover:text-white/50 transition-colors" />
                  </Link>
                  <Link
                    href="/continuity"
                    onClick={onClose}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors group"
                  >
                    <span>Check patient drop-off</span>
                    <ArrowRight size={13} className="text-white/20 group-hover:text-white/50 transition-colors" />
                  </Link>
                  <Link
                    href="/dashboard"
                    onClick={onClose}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors group"
                  >
                    <span>Go to dashboard</span>
                    <ArrowRight size={13} className="text-white/20 group-hover:text-white/50 transition-colors" />
                  </Link>
                </div>
              </div>
            </div>

            {/* ── Footer ────────────────────────────────────────── */}
            {totalUnread > 0 && (
              <div className="px-5 py-3 border-t border-white/8">
                <p className="text-[10px] text-white/20 text-center">
                  {totalUnread} unread notification{totalUnread !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    portalTarget
  );
}
