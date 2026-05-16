"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  brand,
  moduleColors,
  motion as motionTokens,
  shadows,
  glass,
} from "@/lib/tokens";
import { DURATION, EASING, useDoubleRAF } from "@/lib/motion";

export type GlassVariant = "hero" | "primary" | "standard" | "row";
export type GlassTint = "ava" | "pulse" | "intelligence" | "neutral";

interface GlassCardProps {
  /**
   * Visual emphasis tier. Drives hover lift, border opacity, and
   * default ambient glow. `row` opts out of the six-layer glass for
   * flat list-row consumers.
   */
  variant?: GlassVariant;
  /**
   * Module colour for ambient glow and hover border. Resolved to a
   * canonical hex via tokens/colors.ts so consumers never pass raw
   * colour values across module boundaries.
   */
  tint?: GlassTint;
  /**
   * Override the variant default for the drifting ambient glow.
   * Defaults to true for `hero`, false otherwise.
   */
  ambient?: boolean;
  /** Render as a semantic element other than `div`. */
  as?: "div" | "section" | "article" | "aside";
  /** Content padding and layout. Must not override depth tokens. */
  className?: string;
  /** Extra inline style. Merged AFTER baseline so consumers can adjust layout. */
  style?: CSSProperties;
  children: ReactNode;
}

function tintHex(tint: GlassTint): string {
  if (tint === "neutral") return brand.navy;
  return moduleColors[tint] ?? brand.navy;
}

function tintRgba(tint: GlassTint, alpha: number): string {
  const hex = tintHex(tint);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * GlassCard - canonical card wrapper for the StrydeOS portal.
 *
 * Bakes in:
 *   - Six-layer PS5 glass (L1-L6 from tokens/glass.ts)
 *   - Three-layer rest + hover shadow stacks (tokens/shadows.ts)
 *   - Per-variant hover lift (tokens/motion.ts hoverLift)
 *   - Mount fade via useDoubleRAF (Fix 7)
 *   - Optional drifting ambient glow for `hero` variant
 *
 * Motion that is content-level (value morph, sliding pill) stays as
 * separate hooks at @/lib/motion - consumers opt in per content.
 */
export function GlassCard({
  variant = "standard",
  tint = "neutral",
  ambient,
  as: As = "div",
  className,
  style,
  children,
}: GlassCardProps) {
  const mounted = useDoubleRAF();
  const [hovered, setHovered] = useState(false);

  // Row variant: flat, no glass layers, no hover lift, just the mount fade.
  if (variant === "row") {
    const Tag = As as "div";
    return (
      <Tag
        className={className}
        style={{
          position: "relative",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(12px)",
          transition: `all ${DURATION.mount}ms ${EASING}`,
          ...style,
        }}
      >
        {children}
      </Tag>
    );
  }

  const lift = hovered ? motionTokens.hoverLift[variant] : "translateY(0)";
  const mountedTransform = mounted ? lift : "translateY(12px)";

  const borderAlpha = hovered
    ? motionTokens.borderOpacity.hover
    : motionTokens.borderOpacity.rest;
  const borderColor =
    tint === "neutral"
      ? `rgba(255,255,255,${borderAlpha})`
      : tintRgba(tint, borderAlpha);

  const wantsAmbient = ambient ?? variant === "hero";
  const ambientAlpha = wantsAmbient ? glass.ambientAlpha[variant] : 0;

  const Tag = As as "div";
  return (
    <Tag
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 24,
        border: `1px solid ${borderColor}`,
        boxShadow: hovered ? shadows.hover : shadows.rest,
        transform: mountedTransform,
        opacity: mounted ? 1 : 0,
        transition: `all ${DURATION.mount}ms ${EASING}`,
        willChange: "transform, box-shadow, opacity",
        ...style,
      }}
    >
      {/* Six-layer PS5 glass - tokens/glass.ts */}
      <div style={glass.L1} />
      <div style={glass.L2} />
      <div style={glass.L3} />
      <div style={glass.L4} />
      <div style={glass.L5} />
      <div style={glass.L6} />

      {/* Ambient drift glow - hero default-on, others off unless overridden */}
      {ambientAlpha > 0 && (
        <>
          <div
            className="drift-glow"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 24,
              background: `radial-gradient(ellipse 60% 100% at 30% 30%, ${tintRgba(tint, ambientAlpha)}, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
          <div
            className="drift-glow-b"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 24,
              background: `radial-gradient(ellipse 50% 80% at 75% 70%, ${tintRgba(tint, ambientAlpha * 0.85)}, transparent 65%)`,
              pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* Content slot - sits above glass layers via z-index */}
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </Tag>
  );
}
