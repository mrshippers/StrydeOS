"use client";

import { useState, useEffect } from "react";

interface BrightnessStackToggleProps {
  size?: number;
  isDark?: boolean;
  onToggle?: (dark: boolean) => void;
  className?: string;
}

export default function BrightnessStackToggle({
  size = 32,
  isDark: controlledDark,
  onToggle,
  className = "",
}: BrightnessStackToggleProps) {
  const [internalDark, setInternalDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const isDark = controlledDark !== undefined ? controlledDark : internalDark;

  useEffect(() => {
    if (controlledDark !== undefined) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setInternalDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [controlledDark]);

  const toggle = () => {
    const next = !isDark;
    if (controlledDark === undefined) setInternalDark(next);
    onToggle?.(next);
  };

  const padding = size * 0.18;
  const innerW = size - padding * 2;
  const innerH = size - padding * 2;
  const barCount = 4;
  const gap = innerH * 0.1;
  const barH = (innerH - gap * (barCount - 1)) / barCount;
  const barR = barH / 2;

  const lightOpacities = [0.15, 0.35, 0.65, 1.0];
  const darkOpacities = [1.0, 0.65, 0.35, 0.15];
  const lightWidths = [0.6, 0.75, 0.88, 1.0];
  const darkWidths = [1.0, 0.88, 0.75, 0.6];

  const opacities = isDark ? darkOpacities : lightOpacities;
  const widths = isDark ? darkWidths : lightWidths;

  const t = "0.4s cubic-bezier(0.4, 0, 0.2, 1)";
  const fg = "#4B8BF5";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={className}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        margin: 0,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "inherit",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        {Array.from({ length: barCount }).map((_, i) => {
          const y = padding + i * (barH + gap);
          const w = innerW * widths[i];
          const x = padding + (innerW - w) / 2;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={barH}
              rx={barR}
              fill={fg}
              opacity={opacities[i]}
              style={{
                transition: `opacity ${t}, width ${t}, x ${t}`,
              }}
            />
          );
        })}
      </svg>
    </button>
  );
}
