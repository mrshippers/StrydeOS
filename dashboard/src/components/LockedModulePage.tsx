"use client";

/**
 * LockedModulePage — shown in-place by ModuleGuard when a module isn't subscribed.
 * Soft, glowy aesthetic using the module's brand colour. No redirect.
 */

import Link from "next/link";
import { Lock, Check } from "lucide-react";
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
    "24/7 AI inbound call handling via ElevenLabs",
    "Automatically books appointments into your PMS",
    "Full call log with outcomes and recording links",
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  module: ModuleKey;
}

export default function LockedModulePage({ module }: Props) {
  const { name, description, color } = MODULE_DISPLAY[module];
  const benefits = MODULE_BENEFITS[module];

  return (
    <div
      className="relative min-h-[calc(100vh-120px)] flex items-center justify-center overflow-hidden"
      style={{ background: brand.navy }}
    >
      {/* Radial glow — breathing animation */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 55% at 50% 45%, ${color}22 0%, transparent 70%)`,
          animation: "glowPulse 4s ease-in-out infinite",
        }}
      />

      {/* Secondary softer glow ring */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 40% 35% at 50% 45%, ${color}18 0%, transparent 60%)`,
          animation: "glowPulse 4s ease-in-out infinite 2s",
        }}
      />

      {/* Frosted glass card */}
      <div
        className="relative z-10 flex flex-col items-center text-center max-w-md w-full mx-6 px-8 py-10"
        style={{
          background: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: `1px solid ${color}28`,
          borderRadius: 24,
          boxShadow: `0 0 60px ${color}14, 0 2px 32px rgba(11,37,69,0.4)`,
        }}
      >
        {/* Glowing dot + lock */}
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
          {/* Outer glow ring on dot */}
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              boxShadow: `0 0 32px ${color}20`,
              animation: "dotPulse 3s ease-in-out infinite",
            }}
          />
        </div>

        {/* Module name */}
        <h2
          className="font-display text-[28px] text-white mb-3 leading-tight"
        >
          {name}
        </h2>

        {/* Description */}
        <p className="text-[13px] text-white/45 leading-relaxed mb-7">
          {description}
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
              <span className="text-[13px] text-white/60 leading-snug">{benefit}</span>
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
          <Link href="/billing" className="underline underline-offset-2 hover:text-white/45 transition-colors">
            billing page
          </Link>
        </p>
      </div>

      {/* Keyframe animations via inline style tag */}
      <style>{`
        @keyframes glowPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
