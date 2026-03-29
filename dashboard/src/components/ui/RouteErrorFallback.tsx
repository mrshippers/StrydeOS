"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { brand } from "@/lib/brand";
import { MonolithMark } from "@/components/MonolithLogo";
import { RotateCcw } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
  moduleName?: string;
  accentColor?: string;
}

const MODULE_MESSAGES: Record<string, { heading: string; subtext: string }> = {
  Dashboard: {
    heading: "Dashboard took an unscheduled break",
    subtext: "Your data is untouched — this is a display hiccup, not a data one. Hit retry and we'll get your metrics back.",
  },
  Intelligence: {
    heading: "Intelligence needs a moment",
    subtext: "The analytics engine stumbled. Your data is safe — give it another go.",
  },
  Pulse: {
    heading: "Pulse skipped a beat",
    subtext: "Patient continuity data hit a snag loading. Nothing's lost — try again.",
  },
  Ava: {
    heading: "Ava's taking a breather",
    subtext: "The call dashboard couldn't load this time. Your call logs and config are safe.",
  },
  Billing: {
    heading: "Billing page didn't load",
    subtext: "Don't worry — no charges were affected. Retry or refresh to get back on track.",
  },
  Settings: {
    heading: "Settings couldn't load",
    subtext: "Your configuration is safe. This is just a display issue — try again.",
  },
  Clinicians: {
    heading: "Clinician view hit a wall",
    subtext: "The clinician data didn't load properly. Everything's still intact — retry below.",
  },
  Admin: {
    heading: "Admin panel couldn't load",
    subtext: "This is a rendering issue, not a permissions one. Try again.",
  },
};

const DEFAULT_MESSAGE = {
  heading: "This section hit a snag",
  subtext: "Something went wrong loading this page. Your data is safe — try again or refresh.",
};

export default function RouteErrorFallback({
  error,
  reset,
  moduleName = "This page",
  accentColor = brand.blue,
}: Props) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const msg = MODULE_MESSAGES[moduleName] ?? DEFAULT_MESSAGE;

  return (
    <div className="flex items-center justify-center py-20 px-6 animate-fade-in">
      <div className="text-center max-w-md">
        {/* Monolith mark with accent glow */}
        <div className="relative mx-auto mb-6 w-16 h-16 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-2xl opacity-[0.08]"
            style={{ background: accentColor }}
          />
          <MonolithMark size={36} />
        </div>

        <h2 className="font-display text-xl text-navy mb-2">
          {msg.heading}
        </h2>
        <p className="text-sm text-muted leading-relaxed mb-6">
          {msg.subtext}
        </p>

        {error.digest && (
          <p className="text-[10px] text-muted/40 font-mono mb-5 select-all">
            ref: {error.digest}
          </p>
        )}

        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
          style={{
            background: accentColor,
            boxShadow: `0 4px 16px ${accentColor}30`,
          }}
        >
          <RotateCcw size={13} />
          Try again
        </button>
      </div>
    </div>
  );
}
