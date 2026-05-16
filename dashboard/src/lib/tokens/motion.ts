/**
 * Motion tokens. Canonical easing + duration map + per-variant lift values.
 * All portal animations use these constants - no inline curves.
 * Easing lifted from website/ModulePricingBanner.jsx:103, :139, :150.
 */
export const motion = {
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  duration: {
    mount: 500,
    hover: 300,
    pill: 400,
    morphOut: 150,
    morphIn: 30,
    subtitleDelay: 30,
  },
  hoverLift: {
    hero: "translateY(-6px) scale(1.015)",
    primary: "translateY(-6px) scale(1.015)",
    standard: "translateY(-2px)",
    row: "none",
  },
  borderOpacity: { rest: 0.07, hover: 0.6 },
} as const;

export type MotionEasing = typeof motion.easing;
export type Variant = keyof typeof motion.hoverLift;
