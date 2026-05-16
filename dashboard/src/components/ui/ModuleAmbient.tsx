"use client";

import type { ReactNode } from "react";

type Module = "ava" | "pulse" | "intelligence";

const COLORS: Record<Module, string> = {
  ava:           "#1C54F2",
  pulse:         "#0891B2",
  intelligence:  "#8B5CF6",
};

export default function ModuleAmbient({ module, children }: { module: Module; children: ReactNode }) {
  const color = COLORS[module];

  return (
    <div style={{ position: "relative" }}>
      {/* Drifting orb — top left, slowly breathes */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 120,
          left: 280,
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}09, transparent 70%)`,
          pointerEvents: "none",
          zIndex: 0,
          animation: "stryde-drift-a 12s ease-in-out infinite",
        }}
      />
      {/* Drifting orb — bottom right, offset phase */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          bottom: 0,
          right: 0,
          width: 560,
          height: 560,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}06, transparent 70%)`,
          pointerEvents: "none",
          zIndex: 0,
          animation: "stryde-drift-b 15s ease-in-out 3s infinite",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}
