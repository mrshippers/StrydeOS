"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Loader2, Sparkles, UserPlus, X } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";
import {
  EXTRA_SEAT_PRICING,
  TIER_LABELS,
  TIER_SEAT_LIMITS,
  formatGBP,
  type TierKey,
} from "@/lib/billing";

export interface SeatLimitInfo {
  currentCount: number;
  limit: number;
  tierLimit: number;
  extraSeats: number;
  canPurchaseSeat?: boolean;
  tier?: TierKey;
}

export interface SeatLimitPending {
  name: string;
  email: string;
  role: string;
  authRole: "clinician" | "admin";
}

interface SeatLimitModalProps {
  open: boolean;
  seatInfo: SeatLimitInfo | null;
  pending: SeatLimitPending | null;
  /** Only users whose billing role can purchase (owner/admin). */
  canBuy: boolean;
  /** Owner/admin tokens needed to hit /api/billing/seats. */
  onPurchaseSeat: () => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}

export default function SeatLimitModal({
  open,
  seatInfo,
  pending,
  canBuy,
  onPurchaseSeat,
  onClose,
}: SeatLimitModalProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useModalFocusTrap(dialogRef, {
    open,
    onEscape: onClose,
    escapeEnabled: !purchasing,
  });

  // Reset transient state when modal closes
  useEffect(() => {
    if (!open) {
      setPurchasing(false);
      setError(null);
    }
  }, [open]);

  const handleUpgrade = useCallback(() => {
    onClose();
    router.push("/billing?reason=seat-limit");
  }, [onClose, router]);

  const handleBuySeat = useCallback(async () => {
    setPurchasing(true);
    setError(null);
    const res = await onPurchaseSeat();
    setPurchasing(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't add the seat. Try again or contact support.");
      return;
    }
    onClose();
  }, [onPurchaseSeat, onClose]);

  if (!seatInfo) return null;

  const { currentCount, limit, tierLimit, extraSeats, tier } = seatInfo;
  const tierLabel = tier
    ? TIER_LABELS[tier].label
    : tierLimit === 1
      ? "Solo"
      : tierLimit <= 4
        ? "Studio"
        : "Clinic";
  const nextTierLabel = tier
    ? tier === "solo"
      ? TIER_LABELS.studio.label
      : tier === "studio"
        ? TIER_LABELS.clinic.label
        : null
    : tierLabel === "Solo"
      ? "Studio"
      : tierLabel === "Studio"
        ? "Clinic"
        : null;
  const nextTierSeatCount =
    nextTierLabel === TIER_LABELS.clinic.label
      ? TIER_SEAT_LIMITS.clinic
      : nextTierLabel === TIER_LABELS.studio.label
        ? TIER_SEAT_LIMITS.studio
        : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          style={{ background: "rgba(11, 37, 69, 0.6)", backdropFilter: "blur(6px)" }}
          role="presentation"
          onClick={purchasing ? undefined : onClose}
        >
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.35, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="seat-limit-title"
            className="w-full max-w-md rounded-2xl overflow-hidden bg-cream"
            style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="relative px-8 pt-7 pb-6"
              style={{
                background: "linear-gradient(135deg, #0B2545 0%, #132D5E 55%, #1C54F2 100%)",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={purchasing}
                aria-label="Close"
                className="absolute top-4 right-4 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                <X size={15} />
              </button>

              <div className="flex items-center gap-3.5 mb-3">
                <div
                  className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255,255,255,0.10)" }}
                >
                  <UserPlus size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-0.5">
                    Seat limit reached
                  </p>
                  <h2
                    id="seat-limit-title"
                    className="font-display text-[20px] text-white leading-tight"
                  >
                    You&rsquo;re at {currentCount} of {limit} clinicians
                  </h2>
                </div>
              </div>

              <p className="text-[13px] text-white/65 leading-relaxed">
                Your <span className="text-white font-semibold">{tierLabel}</span> plan includes{" "}
                {tierLimit} seat{tierLimit === 1 ? "" : "s"}
                {extraSeats > 0 ? ` plus ${extraSeats} extra` : ""}. Add another seat or upgrade
                your plan to bring {pending?.name ?? "a new clinician"} on.
              </p>
            </div>

            {/* Pending clinician card */}
            {pending && (
              <div className="mx-8 mt-5 px-4 py-3 rounded-xl border border-border bg-white flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ background: "#0B2545" }}
                >
                  {getInitials(pending.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-navy truncate">{pending.name}</p>
                  <p className="text-[11px] text-muted truncate">
                    {pending.role}
                    <span className="mx-1.5 text-muted/60">·</span>
                    {pending.email}
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-blue/10 text-blue">
                  Pending
                </span>
              </div>
            )}

            {/* Options */}
            <div className="px-8 pt-5 pb-4 space-y-2.5">
              {canBuy && (
                <button
                  type="button"
                  data-autofocus
                  onClick={handleBuySeat}
                  disabled={purchasing}
                  className="w-full group flex items-center justify-between gap-3 rounded-xl border border-blue/30 bg-blue/5 hover:bg-blue/10 px-4 py-3.5 text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-navy">Add 1 extra seat</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      {formatGBP(EXTRA_SEAT_PRICING.month)}/mo added to your current plan. Takes effect immediately.
                    </p>
                  </div>
                  {purchasing ? (
                    <Loader2 size={16} className="text-blue animate-spin shrink-0" />
                  ) : (
                    <ArrowRight
                      size={16}
                      className="text-blue shrink-0 transition-transform group-hover:translate-x-0.5"
                    />
                  )}
                </button>
              )}

              {nextTierLabel && (
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={purchasing}
                  className="w-full group flex items-center justify-between gap-3 rounded-xl border border-border bg-white hover:bg-cloud-light/60 px-4 py-3.5 text-left transition-colors disabled:opacity-60"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <Sparkles size={15} className="text-purple shrink-0" />
                    <div>
                      <p className="text-[13px] font-semibold text-navy">
                        Upgrade to {nextTierLabel}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        Higher seat cap
                        {nextTierSeatCount !== null ? ` (${nextTierSeatCount} seats)` : ""} and better
                        per-seat pricing.
                      </p>
                    </div>
                  </div>
                  <ArrowRight
                    size={16}
                    className="text-muted shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-navy"
                  />
                </button>
              )}

              {!canBuy && (
                <button
                  type="button"
                  data-autofocus
                  onClick={handleUpgrade}
                  className="btn-primary w-full justify-center"
                >
                  Go to billing
                  <ArrowRight size={14} />
                </button>
              )}

              {error && (
                <p className="text-[11px] text-danger pt-1" role="alert">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-8 pb-6">
              <button
                type="button"
                onClick={onClose}
                disabled={purchasing}
                className="w-full py-2 text-[12px] text-muted hover:text-navy transition-colors disabled:opacity-40"
              >
                Not right now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
