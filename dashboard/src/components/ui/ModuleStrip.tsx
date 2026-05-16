"use client";

import { useEffect, useState } from "react";
import { AvaIcon, PulseIcon, IntelligenceIcon } from "./ModuleIcons";

type Module = "ava" | "pulse" | "intelligence";

const CONFIG: Record<Module, {
  sub: string;
  color: string;
  glow: string;
  Icon: React.FC<{ color?: string; size?: number }>;
}> = {
  ava: {
    sub: "Voice receptionist · inbound calls",
    color: "#1C54F2",
    glow: "#4B8BF5",
    Icon: AvaIcon,
  },
  pulse: {
    sub: "Patient retention · continuity",
    color: "#0891B2",
    glow: "#22D3EE",
    Icon: PulseIcon,
  },
  intelligence: {
    sub: "Clinical performance · KPI tracking",
    color: "#8B5CF6",
    glow: "#A78BFA",
    Icon: IntelligenceIcon,
  },
};

// Always dark — this is a brand identity element, not a light/dark-mode component.
// Matches the marketing site's module card aesthetic exactly.
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
        padding: "11px 24px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        // Dark navy base, module-color ambient wash from left — ported from marketing site
        background: `radial-gradient(ellipse 70% 140% at -5% 50%, ${cfg.color}22, #0B2545 60%)`,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateX(0)" : "translateX(-12px)",
        transition: "opacity 0.45s cubic-bezier(0.16,1,0.3,1), transform 0.45s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* Ambient glow behind icon — matches marketing site radial orb */}
      <div aria-hidden style={{
        position: "absolute", top: -40, left: -20,
        width: 130, height: 130, borderRadius: "50%",
        background: `radial-gradient(circle, ${cfg.color}1a, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Glass specular — top edge highlight from marketing site */}
      <div aria-hidden style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        background: "linear-gradient(180deg, rgba(255,255,255,0.022) 0%, transparent 55%)",
        pointerEvents: "none",
      }} />

      {/* Module icon — same container spec as marketing site module card */}
      <div style={{
        position: "relative", zIndex: 1,
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: `linear-gradient(135deg, ${cfg.color}28, ${cfg.color}10)`,
        border: `1px solid ${cfg.color}32`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 14px ${cfg.color}20, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}>
        <cfg.Icon color={cfg.glow} size={16} />
      </div>

      {/* Tagline — no module name; page heading owns that */}
      <div style={{
        position: "relative", zIndex: 1,
        fontSize: 11,
        color: "rgba(255,255,255,0.44)",
        letterSpacing: "0.015em",
        fontFamily: "'Outfit', sans-serif",
      }}>
        {cfg.sub}
      </div>

      {/* LIVE badge */}
      <div style={{ marginLeft: "auto", position: "relative", zIndex: 1 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 10px", borderRadius: 50,
          background: `${cfg.color}18`,
          border: `1px solid ${cfg.color}28`,
          fontSize: 10, fontWeight: 700,
          letterSpacing: "0.12em", textTransform: "uppercase" as const,
          color: cfg.glow,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: cfg.glow,
            boxShadow: `0 0 6px ${cfg.glow}`,
            animation: "stryde-live-pulse 2s ease-in-out infinite",
            display: "inline-block",
          }} />
          LIVE
        </span>
      </div>
    </div>
  );
}
