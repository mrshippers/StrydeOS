"use client";

import { useEffect, useState } from "react";
import { AvaIcon, PulseIcon, IntelligenceIcon } from "./ModuleIcons";

type Module = "ava" | "pulse" | "intelligence";

const CONFIG: Record<Module, {
  sub: string;
  color: string;
  glow: string;
  bgDark: string;
  bgLight: string;
  borderDark: string;
  borderLight: string;
  ambientBg: string;
  Icon: React.FC<{ color?: string; size?: number }>;
}> = {
  ava: {
    sub: "Voice receptionist · inbound calls",
    color: "#1C54F2",
    glow: "#4B8BF5",
    bgDark:    "linear-gradient(135deg, rgba(28,84,242,0.18) 0%, rgba(11,37,69,0.0) 60%)",
    bgLight:   "linear-gradient(135deg, rgba(28,84,242,0.07) 0%, transparent 60%)",
    borderDark:  "rgba(28,84,242,0.25)",
    borderLight: "rgba(28,84,242,0.14)",
    ambientBg: "rgba(28,84,242,0.18)",
    Icon: AvaIcon,
  },
  pulse: {
    sub: "Patient retention · continuity",
    color: "#0891B2",
    glow: "#22D3EE",
    bgDark:    "linear-gradient(135deg, rgba(8,145,178,0.18) 0%, rgba(11,37,69,0.0) 60%)",
    bgLight:   "linear-gradient(135deg, rgba(8,145,178,0.07) 0%, transparent 60%)",
    borderDark:  "rgba(8,145,178,0.25)",
    borderLight: "rgba(8,145,178,0.14)",
    ambientBg: "rgba(8,145,178,0.18)",
    Icon: PulseIcon,
  },
  intelligence: {
    sub: "Clinical performance · KPI tracking",
    color: "#8B5CF6",
    glow: "#A78BFA",
    bgDark:    "linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(11,37,69,0.0) 60%)",
    bgLight:   "linear-gradient(135deg, rgba(139,92,246,0.07) 0%, transparent 60%)",
    borderDark:  "rgba(139,92,246,0.25)",
    borderLight: "rgba(139,92,246,0.14)",
    ambientBg: "rgba(139,92,246,0.18)",
    Icon: IntelligenceIcon,
  },
};

export default function ModuleStrip({ module }: { module: Module }) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const cfg = CONFIG[module];
  const iconColor = isDark ? cfg.glow : cfg.color;
  const subtitleColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.45)";
  const badgeColor = isDark ? cfg.glow : cfg.color;

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: isDark ? cfg.bgDark : cfg.bgLight,
        borderBottom: `1px solid ${isDark ? cfg.borderDark : cfg.borderLight}`,
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
          width: 30,
          height: 30,
          borderRadius: 8,
          flexShrink: 0,
          background: isDark
            ? `linear-gradient(135deg, ${cfg.color}88, rgba(11,37,69,0.8))`
            : `linear-gradient(135deg, ${cfg.color}18, ${cfg.color}0a)`,
          border: `1px solid ${cfg.color}${isDark ? "45" : "28"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 12px ${cfg.color}14`,
        }}
      >
        <cfg.Icon color={iconColor} size={16} />
      </div>

      {/* Tagline only — page already has its own heading */}
      <div
        style={{
          fontSize: 11,
          color: subtitleColor,
          letterSpacing: "0.01em",
        }}
      >
        {cfg.sub}
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
            background: `${cfg.color}${isDark ? "15" : "0d"}`,
            border: `1px solid ${cfg.color}${isDark ? "30" : "20"}`,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            color: badgeColor,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: badgeColor,
              boxShadow: `0 0 6px ${badgeColor}`,
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
