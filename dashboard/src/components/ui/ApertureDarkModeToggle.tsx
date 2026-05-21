"use client";

import { useState, useEffect } from "react";

interface ApertureDarkModeToggleProps {
  size?: number;
  isDark?: boolean;
  onToggle?: (dark: boolean) => void;
  className?: string;
}

export default function ApertureDarkModeToggle({
  size = 32,
  isDark: controlledDark,
  onToggle,
  className = "",
}: ApertureDarkModeToggleProps) {
  const [internalDark, setInternalDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [pressing, setPressing] = useState(false);

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

  const half = size / 2;
  const outerR = half * 0.88;
  // Pupil: large (closed iris / dark) vs small (open iris / light)
  const pupilR = isDark ? outerR * 0.70 : outerR * 0.32;
  const strokeW = Math.max(1.2, size * 0.05);
  const bladeW = Math.max(1, size * 0.04);

  // 3 blade pairs (each blade is a full chord across the circle)
  const blades = [0, 60, 120].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const reach = outerR * 0.95;
    return {
      x1: half + cos * reach,
      y1: half - sin * reach,
      x2: half - cos * reach,
      y2: half + sin * reach,
    };
  });

  // Blade rotation: 60deg when dark (almost fully closed), 0 when light
  const bladeRotation = isDark ? 60 : 0;
  const bladeOpacity = isDark ? 0.08 : 1;

  // Easing: spring-like for open, ease-in for close
  const ease = "cubic-bezier(0.34, 1.56, 0.64, 1)";
  const easeClose = "cubic-bezier(0.4, 0, 0.2, 1)";
  const duration = "0.42s";
  const t = `${duration} ${isDark ? easeClose : ease}`;

  // Subtle ring glow in dark mode
  const ringColor = isDark ? "rgba(75,139,245,0.85)" : "currentColor";
  const ringFilter = isDark ? `drop-shadow(0 0 ${size * 0.06}px rgba(75,139,245,0.5))` : "none";

  const scale = pressing ? 0.88 : 1;

  return (
    <button
      type="button"
      onClick={toggle}
      onMouseDown={() => setPressing(true)}
      onMouseUp={() => setPressing(false)}
      onMouseLeave={() => setPressing(false)}
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
        willChange: "transform",
        transform: `scale(${scale})`,
        transition: `transform 0.12s ${easeClose}`,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{
          display: "block",
          overflow: "visible",
          filter: ringFilter,
          transition: `filter ${duration} ${easeClose}`,
        }}
      >
        {/* Outer ring */}
        <circle
          cx={half}
          cy={half}
          r={outerR}
          stroke={ringColor}
          strokeWidth={strokeW}
          fill="none"
          style={{ transition: `stroke ${duration} ${easeClose}` }}
        />

        {/* Aperture blades — rotate and fade as iris closes/opens */}
        <g
          style={{
            transformOrigin: `${half}px ${half}px`,
            transform: `rotate(${bladeRotation}deg)`,
            transition: `transform ${t}, opacity ${t}`,
            opacity: bladeOpacity,
          }}
        >
          {blades.map((b, i) => (
            <line
              key={i}
              x1={b.x1}
              y1={b.y1}
              x2={b.x2}
              y2={b.y2}
              stroke={ringColor}
              strokeWidth={bladeW}
              strokeLinecap="round"
              style={{ transition: `stroke ${duration} ${easeClose}` }}
            />
          ))}
        </g>

        {/* Centre pupil — grows to fill iris in dark mode */}
        <circle
          cx={half}
          cy={half}
          r={pupilR}
          fill={ringColor}
          style={{
            transition: `r ${duration} ${isDark ? easeClose : ease}, fill ${duration} ${easeClose}`,
          }}
        />
      </svg>
    </button>
  );
}
