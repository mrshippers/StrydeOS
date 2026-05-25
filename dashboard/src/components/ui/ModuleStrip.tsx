"use client";

import { useEffect, useState, type CSSProperties } from "react";
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

/**
 * Sleek mode-aware module strip rendered above each module page.
 *
 * Layout: rounded floating card. Per-module tint surfaces as a soft left
 * radial wash + matching pill icon container + LIVE badge.
 * Styling lives in globals.css under `.module-strip` (light + dark variants).
 * Component just sets the tint colour via CSS vars and renders semantic markup.
 */
export default function ModuleStrip({ module }: { module: Module }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  const cfg = CONFIG[module];

  const cssVars = {
    "--strip-tint": cfg.color,
    "--strip-glow": cfg.glow,
  } as CSSProperties;

  return (
    <div
      className={`module-strip module-strip--${module} ${mounted ? "module-strip--mounted" : ""}`}
      style={cssVars}
      data-module={module}
    >
      <span className="module-strip__icon">
        <cfg.Icon color={cfg.glow} size={16} />
      </span>

      <span className="module-strip__sub">{cfg.sub}</span>

      <span className="module-strip__live">
        <span className="module-strip__dot" />
        Live
      </span>
    </div>
  );
}
