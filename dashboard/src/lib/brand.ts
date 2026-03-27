/**
 * Brand palette — single source of truth.
 * All values from BRAND ASSETS/brand-identity-sheet.html :root.
 * Do not add colors not in the sheet.
 *
 * WCAG AA: ink/white on navy, blue on navy, and cloud surfaces meet contrast.
 * Muted (#5C6370) on cloud-dancer: ~5.0:1 — passes AA for all text sizes.
 * MutedStrong (#3F4752) on cloud-dancer: ~7.8:1 — passes AAA.
 */
export const brand = {
  navy: "#0B2545",
  navyMid: "#132D5E",
  blue: "#1C54F2",
  blueBright: "#2E6BFF",
  blueGlow: "#4B8BF5",
  teal: "#0891B2",
  purple: "#8B5CF6",
  cloud: "#F2F1EE",
  cloudLight: "#F9F8F6",
  cloudDark: "#E8E6E0",
  cream: "#FAF9F7",
  ink: "#111827",
  muted: "#5C6370",
  mutedStrong: "#3F4752",
  border: "#E2DFDA",
  success: "#059669",
  warning: "#F59E0B",
  danger: "#EF4444",
} as const;

export type BrandColor = keyof typeof brand;

export const moduleColors: Record<string, string> = {
  ava: brand.blue,
  pulse: brand.teal,
  intelligence: brand.purple,
  default: brand.navy,
};

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
