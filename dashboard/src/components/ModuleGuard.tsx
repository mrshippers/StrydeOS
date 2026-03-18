"use client";

/**
 * ModuleGuard — wraps a module page/layout and blocks access if the clinic
 * has not subscribed to that module and is not in an active trial.
 *
 * On access denied: renders the actual page content faded out behind a
 * floating lock overlay — the user sees a preview of what they'd get.
 * While loading: shows a spinner.
 */

import Link from "next/link";
import { Loader2, Lock, Check } from "lucide-react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { MODULE_DISPLAY } from "@/lib/billing";
import type { ModuleKey } from "@/lib/billing";
import { brand } from "@/lib/brand";

// ─── Per-module benefit bullets ───────────────────────────────────────────────

const MODULE_BENEFITS: Record<ModuleKey, string[]> = {
  intelligence: [
    "Revenue breakdown by clinician",
    "DNA rate analysis by day and time slot",
    "Outcome measure trends (NPRS, QuickDASH, ODI and more)",
  ],
  pulse: [
    "Automated rebooking and HEP reminder sequences",
    "Churn risk detection for at-risk patients",
    "Full comms log with open and click tracking",
  ],
  ava: [
    "24/7 AI inbound call handling via Retell AI",
    "Automatically books appointments into your PMS",
    "Full call log with outcomes and recording links",
  ],
};

interface Props {
  module: ModuleKey;
  children: React.ReactNode;
}

export default function ModuleGuard({ module, children }: Props) {
  const { hasModule, loading } = useEntitlements();

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0B2545" }}
      >
        <Loader2 size={28} className="animate-spin text-white/50" />
      </div>
    );
  }

  if (!hasModule(module)) {
    const { name, color } = MODULE_DISPLAY[module];
    const benefits = MODULE_BENEFITS[module];

    return (
      <div className="relative min-h-[calc(100vh-120px)] overflow-hidden">
        {/* Faded page content — visible but non-interactive */}
        <div
          className="pointer-events-none select-none"
          style={{
            opacity: 0.15,
            filter: "blur(2px) grayscale(0.4)",
          }}
          aria-hidden="true"
        >
          {children}
        </div>

        {/* Lock overlay — centered floating card */}
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          {/* Soft radial backdrop wash */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse 80% 60% at 50% 40%, ${brand.navy}ee 0%, ${brand.navy}cc 50%, ${brand.navy}99 100%)`,
            }}
          />

          {/* Frosted card */}
          <div
            className="relative z-10 flex flex-col items-center text-center max-w-md w-full mx-6 px-8 py-10"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: `1px solid ${color}28`,
              borderRadius: 24,
              boxShadow: `0 0 80px ${color}12, 0 2px 40px rgba(11,37,69,0.5)`,
            }}
          >
            {/* Glowing lock icon */}
            <div className="relative mb-6">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{
                  background: `${color}18`,
                  border: `1px solid ${color}35`,
                  boxShadow: `0 0 24px ${color}30`,
                }}
              >
                <Lock size={22} style={{ color }} strokeWidth={1.5} />
              </div>
              <div
                className="absolute inset-0 rounded-2xl"
                style={{
                  boxShadow: `0 0 32px ${color}20`,
                  animation: "dotPulse 3s ease-in-out infinite",
                }}
              />
            </div>

            {/* Title */}
            <h2 className="font-display text-[28px] text-white mb-2 leading-tight">
              {name}
            </h2>

            {/* Subtitle */}
            <p className="text-[14px] text-white/40 leading-relaxed mb-1">
              {name} isn&apos;t part of your current plan.
            </p>
            <p className="text-[13px] text-white/30 leading-relaxed mb-7">
              Subscribe to unlock full access.
            </p>

            {/* Benefits */}
            <ul className="w-full text-left space-y-2.5 mb-8">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2.5">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${color}20` }}
                  >
                    <Check size={9} style={{ color }} strokeWidth={2.5} />
                  </div>
                  <span className="text-[13px] text-white/55 leading-snug">
                    {benefit}
                  </span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Link
              href="/billing"
              className="w-full flex items-center justify-center py-3 rounded-xl text-[14px] font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
              style={{
                background: color,
                boxShadow: `0 4px 20px ${color}40`,
              }}
            >
              Unlock {name}
            </Link>

            <p className="mt-4 text-[11px] text-white/25">
              Manage your plan on the{" "}
              <Link
                href="/billing"
                className="underline underline-offset-2 hover:text-white/45 transition-colors"
              >
                billing page
              </Link>
            </p>
          </div>
        </div>

        {/* Keyframe animation */}
        <style>{`
          @keyframes dotPulse {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.08); }
          }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
}
