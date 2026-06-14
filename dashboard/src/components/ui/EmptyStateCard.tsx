"use client";

import { isValidElement, type ElementType, type ReactNode } from "react";
import Link from "next/link";
import { moduleColors, hexToRgba } from "@/lib/brand";

const MODULES = ["ava", "pulse", "intelligence", "default"] as const;

const MODULE_BG: Record<string, string> = Object.fromEntries(
  MODULES.map((m) => [m, hexToRgba(moduleColors[m], 0.05)])
);

const MODULE_BORDER: Record<string, string> = Object.fromEntries(
  MODULES.map((m) => [m, hexToRgba(moduleColors[m], 0.12)])
);

const MODULE_ICON_BG: Record<string, string> = Object.fromEntries(
  MODULES.map((m) => [m, hexToRgba(moduleColors[m], 0.10)])
);

/** Render the hero: a ReactNode passes straight through; an ElementType (lucide) keeps the legacy treatment. */
function renderHero(icon: ReactNode | ElementType, accentColor: string): ReactNode {
  if (isValidElement(icon) || icon == null || typeof icon === "string" || typeof icon === "number" || typeof icon === "boolean") {
    return icon as ReactNode;
  }
  const Icon = icon as ElementType;
  return <Icon size={22} style={{ color: accentColor }} strokeWidth={1.5} />;
}

interface EmptyStateCardProps {
  /**
   * Hero slot. Prefer a rendered ReactNode (an animated module mark from
   * ModuleIcons); a lucide ElementType is still accepted for back-compat.
   */
  icon: ReactNode | ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  module?: "ava" | "pulse" | "intelligence" | "default";
}

export default function EmptyStateCard({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  module = "default",
}: EmptyStateCardProps) {
  const bg = MODULE_BG[module];
  const border = MODULE_BORDER[module];
  const iconBg = MODULE_ICON_BG[module];
  const accentColor = moduleColors[module];

  return (
    <div
      className="group rounded-[var(--radius-card)] p-8 flex flex-col items-center text-center transition-all duration-200 hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div
        className="w-12 h-12 rounded-[var(--radius-inner)] flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-110"
        style={{ background: iconBg }}
      >
        {renderHero(icon, accentColor)}
      </div>

      <h3 className="font-display text-xl text-navy mb-2">{title}</h3>
      <p className="text-sm text-muted max-w-xs leading-relaxed mb-5">{description}</p>

      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
          style={{
            background: accentColor,
            color: "white",
          }}
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}
