import { useState, useEffect } from "react";

/**
 * BrightnessStackToggle
 *
 * A Stripe-inspired dark mode toggle for StrydeOS.
 * Four horizontal bars with ascending opacity — the stack inverts
 * direction when toggled, and the bars animate width to feel alive.
 *
 * Props:
 *   size       — icon bounding box in px (default: 32)
 *   isDark     — controlled mode (optional, uses system pref if omitted)
 *   onToggle   — callback receiving the new isDark boolean
 *   className  — extra classes on the outer button
 *
 * Drop into your header next to the existing nav icons.
 */

export default function BrightnessStackToggle({
  size = 32,
  isDark: controlledDark,
  onToggle,
  className = "",
}) {
  // ── State ──────────────────────────────────────────────────
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

  // ── Layout math ────────────────────────────────────────────
  const padding = size * 0.18;
  const innerW = size - padding * 2;
  const innerH = size - padding * 2;
  const barCount = 4;
  const gap = innerH * 0.1;
  const barH = (innerH - gap * (barCount - 1)) / barCount;
  const barR = barH / 2;

  // Light mode: bars go dim→bright top→bottom (brightness ascending)
  // Dark mode: bars go bright→dim top→bottom (brightness descending)
  const lightOpacities = [0.15, 0.35, 0.65, 1.0];
  const darkOpacities = [1.0, 0.65, 0.35, 0.15];

  // Subtle width variation gives it life during transition
  const lightWidths = [0.6, 0.75, 0.88, 1.0];
  const darkWidths = [1.0, 0.88, 0.75, 0.6];

  const opacities = isDark ? darkOpacities : lightOpacities;
  const widths = isDark ? darkWidths : lightWidths;

  // ── Transition ─────────────────────────────────────────────
  const t = "0.4s cubic-bezier(0.4, 0, 0.2, 1)";
  const fg = "currentColor";

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
        style={{ display: "block" }}
      >
        {Array.from({ length: barCount }).map((_, i) => {
          const y = padding + i * (barH + gap);
          const w = innerW * widths[i];
          const x = padding + (innerW - w) / 2; // centred
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
