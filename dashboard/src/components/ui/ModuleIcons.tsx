"use client";

// Animated module icons ported from the marketing site (strydeOS-website.jsx)
// ArchAvaIcon → AvaIcon, ArchPulseIcon → PulseIcon, ArchIntelIcon → IntelligenceIcon

export function AvaIcon({ color = "#1C54F2", size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3,4 L15,4 C16,4 17,5 17,6 L17,12 C17,13 16,14 15,14 L8,14 L5,17 L5,14 L4,14 C3,14 2,13 2,12 L2,6 C2,5 3,4 3,4 Z"
        stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.08"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.7"
      />
      <rect x="5.5" y="8" width="1.2" height="4" rx="0.6" fill={color} opacity="0.5">
        <animate attributeName="height" values="4;2;4" dur="0.8s" repeatCount="indefinite" />
        <animate attributeName="y" values="8;9;8" dur="0.8s" repeatCount="indefinite" />
      </rect>
      <rect x="8" y="6.5" width="1.2" height="7" rx="0.6" fill={color} opacity="0.75">
        <animate attributeName="height" values="7;3;7" dur="0.8s" begin="0.15s" repeatCount="indefinite" />
        <animate attributeName="y" values="6.5;8.5;6.5" dur="0.8s" begin="0.15s" repeatCount="indefinite" />
      </rect>
      <rect x="10.5" y="7" width="1.2" height="6" rx="0.6" fill={color} opacity="0.9">
        <animate attributeName="height" values="6;2;6" dur="0.8s" begin="0.3s" repeatCount="indefinite" />
        <animate attributeName="y" values="7;9;7" dur="0.8s" begin="0.3s" repeatCount="indefinite" />
      </rect>
      <rect x="13" y="8.5" width="1.2" height="3" rx="0.6" fill={color} opacity="0.5">
        <animate attributeName="height" values="3;5;3" dur="0.8s" begin="0.45s" repeatCount="indefinite" />
        <animate attributeName="y" values="8.5;7.5;8.5" dur="0.8s" begin="0.45s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

export function PulseIcon({ color = "#0891B2", size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M1,10 L4,10 L6,4 L8,16 L10,6 L12,12 L13,10 L19,10"
        stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
        fill="none" opacity="0.85" strokeDasharray="40" strokeDashoffset="40"
      >
        <animate attributeName="stroke-dashoffset" values="40;0" dur="1.5s" fill="freeze" repeatCount="indefinite" />
      </path>
      <path
        d="M1,10 L4,10 L6,4 L8,16 L10,6 L12,12 L13,10 L19,10"
        stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        fill="none" opacity="0.15" strokeDasharray="40" strokeDashoffset="40"
      >
        <animate attributeName="stroke-dashoffset" values="40;0" dur="1.5s" fill="freeze" repeatCount="indefinite" />
      </path>
      <circle r="1.5" fill={color} opacity="0.9">
        <animateMotion path="M1,10 L4,10 L6,4 L8,16 L10,6 L12,12 L13,10 L19,10" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export function IntelligenceIcon({ color = "#8B5CF6", size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M2,10 C4,5 8,3 10,3 C12,3 16,5 18,10 C16,15 12,17 10,17 C8,17 4,15 2,10 Z"
        stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.06"
        strokeLinecap="round" opacity="0.7"
      />
      <circle cx="10" cy="10" r="3.5" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.12" opacity="0.8" />
      <circle cx="10" cy="10" r="1.5" fill={color} opacity="0.9">
        <animate attributeName="r" values="1.5;2;1.5" dur="2s" repeatCount="indefinite" />
      </circle>
      <line x1="4" y1="10" x2="16" y2="10" stroke={color} strokeWidth="0.5" opacity="0.3">
        <animate attributeName="y1" values="10;7;13;10" dur="3s" repeatCount="indefinite" />
        <animate attributeName="y2" values="10;7;13;10" dur="3s" repeatCount="indefinite" />
      </line>
      <circle cx="5" cy="10" r="0.7" fill={color} opacity="0.4">
        <animate attributeName="opacity" values="0.4;0.8;0.4" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="15" cy="10" r="0.7" fill={color} opacity="0.4">
        <animate attributeName="opacity" values="0.4;0.8;0.4" dur="1.5s" begin="0.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
