/**
 * Brand tokens — single source of truth for all colour, typography, and spacing values.
 *
 * These mirror the CSS custom properties in globals.css but are available
 * for use in JS/TS where CSS vars can't reach (inline styles, SVG fills,
 * dynamic rgba derivations, etc.).
 *
 * Rule: Never hardcode hex values in components. Import from here.
 */

// ─── Colours ────────────────────────────────────────────────────────────────

export const colors = {
  // Primary brand
  blue: "#1C54F2",
  blueBright: "#2E6BFF",
  blueGlow: "#4B8BF5",
  navy: "#0B2545",
  navyMid: "#132D5E",
  teal: "#0891B2",
  purple: "#8B5CF6",

  // Surfaces
  cloudDancer: "#F2F1EE",
  cloudLight: "#F9F8F6",
  cloudDark: "#E8E6E0",
  cream: "#FAF9F7",

  // Text
  ink: "#111827",
  muted: "#6B7280",

  // Semantic
  success: "#059669",
  warn: "#F59E0B",
  danger: "#EF4444",

  // Borders
  border: "#E2DFDA",
} as const;

// ─── Module accent colours ──────────────────────────────────────────────────

export const moduleColors = {
  ava: colors.blue,
  pulse: colors.teal,
  intelligence: colors.purple,
  default: colors.blue,
} as const;

// ─── RAG (Red/Amber/Green) status colours ───────────────────────────────────

export const ragColors = {
  ok: { bg: `rgba(5,150,105,0.09)`, text: colors.success },
  warn: { bg: `rgba(245,158,11,0.09)`, text: colors.warn },
  danger: { bg: `rgba(239,68,68,0.09)`, text: colors.danger },
  neutral: { bg: `rgba(107,114,128,0.09)`, text: colors.muted },
} as const;

// ─── Status dot colours (StatCard) ──────────────────────────────────────────

export const statusColors = {
  ok: { dot: colors.success, glow: "rgba(5,150,105,0.45)" },
  warn: { dot: colors.warn, glow: "rgba(245,158,11,0.45)" },
  danger: { dot: colors.danger, glow: "rgba(239,68,68,0.45)" },
  neutral: { dot: colors.muted, glow: "rgba(107,114,128,0.2)" },
} as const;

// ─── Trend colours ──────────────────────────────────────────────────────────

export const trendColors = {
  up: colors.success,
  down: colors.danger,
  warn: colors.warn,
  flat: colors.muted,
} as const;

// ─── Typography ─────────────────────────────────────────────────────────────

export const fonts = {
  display: "'DM Serif Display', serif",
  body: "'Outfit', sans-serif",
} as const;

// ─── Spatial — border radii (px) ────────────────────────────────────────────

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 50,
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create an rgba colour from a hex value with the given opacity (0-1). */
export function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}
