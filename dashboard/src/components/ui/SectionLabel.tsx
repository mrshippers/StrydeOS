import type { ElementType, ReactNode } from "react";

interface SectionLabelProps {
  children: ReactNode;
  /** Semantic element. Defaults to a paragraph; pass "h2"/"h3" for real headers. */
  as?: ElementType;
  /** Layout-only extras (margins, etc.). Avoid overriding type/colour here so
   *  the eyebrow stays consistent — that drift is exactly what this fixes. */
  className?: string;
}

/**
 * SectionLabel — the canonical uppercase "eyebrow" that sits above section
 * headers across the portal. Single source of truth for its size / weight /
 * tracking / tone so the pattern stops drifting (it was copy-pasted inline at
 * 0.12–0.22em tracking with varying muted tones). Tokens only, dark-mode aware.
 */
export default function SectionLabel({ children, as: Tag = "p", className = "" }: SectionLabelProps) {
  return (
    <Tag
      className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70 dark:text-white/40 ${className}`}
    >
      {children}
    </Tag>
  );
}
