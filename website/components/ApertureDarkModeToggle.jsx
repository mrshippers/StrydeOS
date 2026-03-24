import { useState, useEffect } from "react";

/**
 * ApertureDarkModeToggle
 *
 * A camera-iris-inspired dark mode toggle for StrydeOS.
 * Pupil dilates in dark mode, contracts in light — the aperture metaphor.
 * Blades rotate and fade during transition.
 *
 * Props:
 *   size       — icon diameter in px (default: 32)
 *   isDark     — controlled mode (optional, uses system pref if omitted)
 *   onToggle   — callback receiving the new isDark boolean
 *   className  — extra classes on the outer button
 *
 * Drop into your header next to the existing nav icons.
 */

export default function ApertureDarkModeToggle({
  size = 32,
  isDark: controlledDark,
  onToggle,
  className = "",
}) {
  // — State ———————————————————————————————————————————————
  const [internalDark, setInternalDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const isDark = controlledDark !== undefined ? controlledDark : internalDark;

  useEffect(() => {
    if (controlledDark !== undefined) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setInternalDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [controlledDark]);

  const toggle = () => {
    const next = !isDark;
    if (controlledDark === undefined) setInternalDark(next);
    onToggle?.(next);
  };

  // — Derived values ——————————————————————————————————————
  const half = size / 2;
  const outerR = half * 0.9;
  const pupilR = isDark ? outerR * 0.72 : outerR * 0.34;
  const strokeW = Math.max(1.2, size * 0.05);
  const bladeW = Math.max(1, size * 0.04);

  // Blade endpoints — 3 lines through centre at 0°, 60°, 120°
  const blades = [0, 60, 120].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const reach = outerR * 0.97;
    return {
      x1: half + cos * reach,
      y1: half - sin * reach,
      x2: half - cos * reach,
      y2: half + sin * reach,
    };
  });

  // — Colour tokens ——————————————————————————————————————
  const fg = "currentColor";

  // — Transition config ——————————————————————————————————
  const t = "0.35s cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={className}
      style={{
        background: "none",
        border: "none",
        padding: size * 0.15,
        margin: 0,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: size * 0.3,
        color: "inherit",
        WebkitTapHighlightColor: "transparent",
        transition: `background ${t}`,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background =
          "var(--color-background-secondary, rgba(128,128,128,0.08))")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Outer ring */}
        <circle
          cx={half}
          cy={half}
          r={outerR}
          stroke={fg}
          strokeWidth={strokeW}
          fill="none"
        />

        {/* Iris blades */}
        <g
          style={{
            transformOrigin: `${half}px ${half}px`,
            transform: isDark ? "rotate(30deg)" : "rotate(0deg)",
            transition: `transform ${t}, opacity ${t}`,
            opacity: isDark ? 0.12 : 1,
          }}
        >
          {blades.map((b, i) => (
            <line
              key={i}
              x1={b.x1}
              y1={b.y1}
              x2={b.x2}
              y2={b.y2}
              stroke={fg}
              strokeWidth={bladeW}
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* Pupil — dilates in dark, contracts in light */}
        <circle
          cx={half}
          cy={half}
          r={pupilR}
          fill={fg}
          style={{ transition: `r ${t}` }}
        />
      </svg>
    </button>
  );
}
