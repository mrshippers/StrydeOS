"use client";

import { useEffect, useState } from "react";
import { AvaIcon, PulseIcon, IntelligenceIcon } from "./ModuleIcons";

type Module = "ava" | "pulse" | "intelligence";

const CONFIG: Record<Module, {
  name: string;
  sub: string;
  color: string;
  glow: string;
  bgGradient: string;
  borderColor: string;
  ambientBg: string;
  Icon: React.FC<{ color?: string; size?: number }>;
}> = {
  ava: {
    name: "Ava",
    sub: "Voice receptionist · inbound calls",
    color: "#1C54F2",
    glow: "#4B8BF5",
    bgGradient: "linear-gradient(135deg, rgba(28,84,242,0.18) 0%, rgba(11,37,69,0.0) 60%)",
    borderColor: "rgba(28,84,242,0.25)",
    ambientBg: "rgba(28,84,242,0.18)",
    Icon: AvaIcon,
  },
  pulse: {
    name: "Pulse",
    sub: "Patient retention · continuity",
    color: "#0891B2",
    glow: "#22D3EE",
    bgGradient: "linear-gradient(135deg, rgba(8,145,178,0.18) 0%, rgba(11,37,69,0.0) 60%)",
    borderColor: "rgba(8,145,178,0.25)",
    ambientBg: "rgba(8,145,178,0.18)",
    Icon: PulseIcon,
  },
  intelligence: {
    name: "Intelligence",
    sub: "Clinical performance · KPI tracking",
    color: "#8B5CF6",
    glow: "#A78BFA",
    bgGradient: "linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(11,37,69,0.0) 60%)",
    borderColor: "rgba(139,92,246,0.25)",
    ambientBg: "rgba(139,92,246,0.18)",
    Icon: IntelligenceIcon,
  },
};

export default function ModuleStrip({ module }: { module: Module }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  const cfg = CONFIG[module];

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: cfg.bgGradient,
        borderBottom: `1px solid ${cfg.borderColor}`,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateX(0)" : "translateX(-10px)",
        transition: "opacity 0.45s cubic-bezier(0.16,1,0.3,1), transform 0.45s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* Ambient glow behind icon */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -50,
          left: -30,
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${cfg.ambientBg}, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Module icon */}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          flexShrink: 0,
          background: `linear-gradient(135deg, ${cfg.color}88, rgba(11,37,69,0.8))`,
          border: `1px solid ${cfg.color}45`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 14px ${cfg.color}18`,
        }}
      >
        <cfg.Icon color={cfg.glow} size={18} />
      </div>

      {/* Name + subtitle */}
      <div>
        <div
          style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontSize: 16,
            lineHeight: 1.1,
            letterSpacing: "-0.01em",
            color: cfg.glow,
          }}
        >
          {cfg.name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.38)",
            marginTop: 2,
            letterSpacing: "0.01em",
          }}
        >
          {cfg.sub}
        </div>
      </div>

      {/* LIVE badge */}
      <div style={{ marginLeft: "auto" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 10px",
            borderRadius: 50,
            background: `${cfg.color}15`,
            border: `1px solid ${cfg.color}30`,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            color: cfg.glow,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: cfg.glow,
              boxShadow: `0 0 6px ${cfg.glow}`,
              animation: "stryde-live-pulse 2s ease-in-out infinite",
              display: "inline-block",
            }}
          />
          LIVE
        </span>
      </div>
    </div>
  );
}
