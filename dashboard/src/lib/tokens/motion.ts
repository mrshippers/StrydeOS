/**
 * Motion tokens. Canonical easing + duration map + per-variant lift values.
 * All portal animations use these constants - no inline curves.
 *
 * One easing curve app-wide: the "PS5" ease the dashboard mount stagger uses
 * (cubic-bezier(0.22, 1, 0.36, 1)). `easingArray` is the same curve in the
 * 4-tuple form Motion's `ease` prop expects, so framer transitions and CSS
 * `transition` strings stay on a single source of truth - no second system.
 */
export const easingArray = [0.22, 1, 0.36, 1] as const;

export const motion = {
  easing: `cubic-bezier(${easingArray.join(", ")})`,
  easingArray,
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
