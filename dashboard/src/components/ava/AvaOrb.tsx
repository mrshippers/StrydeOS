"use client";

/**
 * AvaOrb — the live-pulsing freeform spherical presence that represents Ava.
 *
 * Pure CSS: layered conic + radial gradients with rotation + breathing
 * animations. GPU-only properties (transform / opacity). Respects
 * `prefers-reduced-motion` (stops all animation, sphere remains static).
 *
 * Visual stack (back → front):
 *   halo   — soft outer glow, breathes
 *   core   — rotating conic swirl (blue → indigo → purple)
 *   drift  — second slow counter-rotating overlay, screen-blended
 *   inner  — inset shadows for marble depth
 *   shine  — top-left specular highlight, pulses
 *   bolt   — optional lightning badge (Ava signature)
 *
 * Usage:
 *   <AvaOrb size={64} />                 // header hero
 *   <AvaOrb size={20} showBolt={false} /> // sidebar nav mark
 */

import { Zap } from "lucide-react";

interface AvaOrbProps {
  /** Outer diameter in px. Default 56. */
  size?: number;
  /** Render the lightning-bolt badge in the top-right. Default true. */
  showBolt?: boolean;
  /** Additional classes (positioning, margin, etc.). */
  className?: string;
}

export default function AvaOrb({
  size = 56,
  showBolt = true,
  className,
}: AvaOrbProps) {
  const boltSize = Math.round(size * 0.18);
  return (
    <div
      className={`ava-orb ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="ava-orb__halo" />
      <span className="ava-orb__core" />
      <span className="ava-orb__drift" />
      <span className="ava-orb__inner" />
      <span className="ava-orb__shine" />
      {showBolt && (
        <span className="ava-orb__bolt">
          <Zap size={boltSize} strokeWidth={2.5} />
        </span>
      )}
    </div>
  );
}
