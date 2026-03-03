/**
 * StrydeOS Monolith Logo Component
 *
 * The mark: a glass pillar, diagonal cut top-face (catch-light), 3 ascending
 * chevrons inside the bottom half. Royal blue (#1C54F2) container.
 *
 * Usage:
 *   import { MonolithMark, StrydeOSLogo } from '@/components/MonolithLogo'
 *
 *   <MonolithMark size={44} />                    // mark only
 *   <StrydeOSLogo size={44} />                    // mark + wordmark
 *   <StrydeOSLogo size={44} theme="light" />      // for light backgrounds
 *   <MonolithMark size={16} simplified />          // favicon / tiny sizes
 */

import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarkProps {
  /** Height (and width — always square). Default: 44 */
  size?: number;
  /** Use simplified variant at small sizes (≤24px). Auto-detected if not set. */
  simplified?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

interface LogoProps extends MarkProps {
  /** "dark" = white wordmark (default), "light" = navy wordmark */
  theme?: "dark" | "light";
  /** Gap between mark and wordmark in px. Default: 10 */
  gap?: number;
  /** Font size override. Defaults to size * 0.42 */
  fontSize?: number;
}

// ─── Unique ID generator (avoids SVG gradient conflicts when used multiple times) ─

let _idCounter = 0;
const uid = (prefix: string) => `${prefix}-${++_idCounter}`;

// ─── Monolith Mark ────────────────────────────────────────────────────────────

export const MonolithMark: React.FC<MarkProps> = ({
  size = 44,
  simplified,
  className,
  style,
}) => {
  const isSimplified = simplified ?? size <= 24;
  const id = uid("m");

  // IDs for gradients — must be unique per instance
  const gCont    = `${id}-cont`;
  const gRad     = `${id}-rad`;
  const gTopface = `${id}-topface`;
  const gRim     = `${id}-rim`;
  const gBorder  = `${id}-border`;
  const cPillar  = `${id}-pc`;
  const cAbove   = `${id}-ac`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label="StrydeOS"
    >
      <defs>
        {/* Container gradient — deep navy-to-blue glass */}
        <linearGradient id={gCont} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0%"   stopColor="#2E6BFF" stopOpacity="0.58" />
          <stop offset="100%" stopColor="#091D3E" stopOpacity="0.72" />
        </linearGradient>

        {/* Radial light source */}
        <radialGradient id={gRad} cx="28%" cy="24%" r="60%">
          <stop offset="0%"   stopColor="#6AABFF" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#1C54F2" stopOpacity="0"    />
        </radialGradient>

        {/* Top-face catch-light */}
        <linearGradient id={gTopface} x1="0.05" y1="1" x2="0.35" y2="0">
          <stop offset="0%"   stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0.97" />
        </linearGradient>

        {/* Top arc rim highlight */}
        <linearGradient id={gRim} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="white" stopOpacity="0"    />
          <stop offset="28%"  stopColor="white" stopOpacity="0.60" />
          <stop offset="65%"  stopColor="white" stopOpacity="0.12" />
          <stop offset="100%" stopColor="white" stopOpacity="0"    />
        </linearGradient>

        {/* Border gradient */}
        <linearGradient id={gBorder} x1="0.1" y1="0" x2="0.4" y2="1">
          <stop offset="0%"   stopColor="#7ABBFF" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#1C54F2" stopOpacity="0.06" />
        </linearGradient>

        {/* Clip pillar body */}
        <clipPath id={cPillar}>
          <rect x="35" y="20" width="22" height="60" rx="5" />
        </clipPath>

        {/* Clip top face (above diagonal cut) */}
        <clipPath id={cAbove}>
          <polygon points="35,52 57,40 57,20 35,20" />
        </clipPath>
      </defs>

      {/* Container */}
      <rect width="100" height="100" rx="24" fill={`url(#${gCont})`} />
      <rect width="100" height="100" rx="24" fill={`url(#${gRad})`} />
      <rect width="100" height="100" rx="24" fill="none" stroke={`url(#${gBorder})`} strokeWidth="1.2" />

      {!isSimplified && (
        /* Top arc rim — omit at tiny sizes */
        <path d="M 17 21 Q 50 12 83 21" stroke={`url(#${gRim})`} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      )}

      {/* Pillar body */}
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07" />
      {/* Shadow in lower half */}
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10" />

      {/* Three ascending chevrons (bottom→top, dimest→brightest) */}
      <g clipPath={`url(#${cPillar})`}>
        <polyline
          points="32,80 46,72 60,80"
          stroke="white" strokeOpacity="0.20"
          strokeWidth={isSimplified ? 3.0 : 2.0}
          strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
        <polyline
          points="32,72 46,64 60,72"
          stroke="white" strokeOpacity="0.42"
          strokeWidth={isSimplified ? 3.5 : 2.5}
          strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
        <polyline
          points="32,64 46,56 60,64"
          stroke="white" strokeOpacity="0.72"
          strokeWidth={isSimplified ? 4.2 : 3.2}
          strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
      </g>

      {/* Top face catch-light */}
      <rect
        x="35" y="20" width="22" height="60" rx="5"
        fill={`url(#${gTopface})`}
        clipPath={`url(#${cAbove})`}
      />

      {/* Diagonal cut edge line */}
      <line
        x1="33" y1="52" x2="59" y2="39"
        stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round"
      />
    </svg>
  );
};

// ─── Full Lockup (Mark + Wordmark) ────────────────────────────────────────────

export const StrydeOSLogo: React.FC<LogoProps> = ({
  size = 44,
  theme = "dark",
  gap = 10,
  fontSize,
  simplified,
  className,
  style,
}) => {
  const textColor     = theme === "dark"  ? "#FFFFFF"  : "#0B2545";
  const accentColor   = theme === "dark"  ? "#4B8BF5"  : "#1C54F2";
  const computedFontSize = fontSize ?? Math.round(size * 0.42);

  return (
    <div
      className={className}
      style={{
        display:    "inline-flex",
        alignItems: "center",
        gap,
        userSelect: "none",
        ...style,
      }}
    >
      <MonolithMark size={size} simplified={simplified} />
      <span
        style={{
          fontFamily:  "'Outfit', sans-serif",
          fontWeight:  700,
          fontSize:    computedFontSize,
          letterSpacing: "-0.02em",
          color:       textColor,
          lineHeight:  1,
        }}
      >
        Stryde<span style={{ color: accentColor }}>OS</span>
      </span>
    </div>
  );
};

// ─── Named size presets ───────────────────────────────────────────────────────

/** 16px — favicon / tiny watermark */
export const MonolithFavicon   = () => <MonolithMark size={16} simplified />;

/** 32px — footer watermark */
export const MonolithFooter    = () => <MonolithMark size={32} />;

/** 44px — nav bar (default) */
export const MonolithNav       = () => <MonolithMark size={44} />;

/** 96px — hero / large display */
export const MonolithHero      = () => <MonolithMark size={96} />;

/** Full logo presets */
export const LogoNav           = ({ theme }: { theme?: "dark" | "light" }) =>
  <StrydeOSLogo size={34} fontSize={17} theme={theme} gap={10} />;

export const LogoFooter        = ({ theme }: { theme?: "dark" | "light" }) =>
  <StrydeOSLogo size={28} fontSize={15} theme={theme} gap={8} />;

export const LogoHero          = ({ theme }: { theme?: "dark" | "light" }) =>
  <StrydeOSLogo size={64} theme={theme} gap={14} />;

// Default export — the mark alone
export default MonolithMark;
