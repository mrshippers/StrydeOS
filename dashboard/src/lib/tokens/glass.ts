import type { CSSProperties } from "react";

/**
 * Six-layer PS5 glass system.
 * Lifted verbatim from website/ava-conversation-card.jsx:647-695.
 * Each entry is the CSS for one absolutely-positioned layer inside GlassCard.
 * Parent must set `overflow: hidden`. All layers are `pointer-events: none`.
 *
 * Geometry assumes a 24px outer border-radius (the canonical card radius).
 * GlassCard hard-codes that radius on its root; callers that need a different
 * radius must opt out of glass layers via the `row` variant.
 */
export const glass = {
  L1: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 110,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.2) 25%, rgba(255,255,255,0.06) 50%, transparent 100%)",
    borderRadius: "24px 24px 0 0",
    pointerEvents: "none",
  } as CSSProperties,

  L2: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.12) 20%, rgba(255,255,255,0) 45%, rgba(255,255,255,0) 55%, rgba(255,255,255,0.06) 80%, rgba(255,255,255,0.15) 100%)",
    borderRadius: 24,
    pointerEvents: "none",
  } as CSSProperties,

  L3: {
    position: "absolute",
    top: -40,
    left: -40,
    width: 280,
    height: 280,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(255,255,255,0.2), transparent 65%)",
    pointerEvents: "none",
  } as CSSProperties,

  L4: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    background:
      "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
    pointerEvents: "none",
  } as CSSProperties,

  L5: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: 1,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0.15), transparent)",
    pointerEvents: "none",
  } as CSSProperties,

  L6: {
    position: "absolute",
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: 23,
    border: "1px solid rgba(255,255,255,0.25)",
    pointerEvents: "none",
  } as CSSProperties,

  /**
   * Ambient drift-glow alpha per variant.
   * Hero glows visibly; primary glows subtly; standard and row do not glow.
   */
  ambientAlpha: { hero: 0.045, primary: 0.025, standard: 0, row: 0 },
} as const;

export type GlassLayer = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
