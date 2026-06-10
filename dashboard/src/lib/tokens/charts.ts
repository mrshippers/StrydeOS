/**
 * Chart theme tokens — Recharts styling primitives shared across every
 * dashboard chart so grids, ticks and lines stay identical between modules.
 *
 * Colours route through CSS custom properties (--chart-grid / --chart-tick,
 * defined in globals.css with html.dark overrides) so charts re-skin with the
 * theme without re-rendering. Never hand-roll #E2DFDA / #6B7280 in a chart —
 * beige is a light-mode border token, not a chart colour.
 */
export const chartTheme = {
  /** CartesianGrid props: hairline dotted grid, horizontal only by convention. */
  grid: {
    stroke: "var(--chart-grid, rgba(11,37,69,0.06))",
    strokeDasharray: "2 4",
  },
  /** Axis tick style — terminal-grade micro labels. */
  tick: {
    fontSize: 10,
    letterSpacing: "0.04em",
    fill: "var(--chart-tick, #6B7280)",
  },
  /** Axis lines are off everywhere; the grid carries the structure. */
  axisLine: false as const,
  /** Line series defaults. */
  line: {
    strokeWidth: 1.5,
  },
  /** Active (hover) dot radius for line series. */
  activeDot: {
    r: 3,
  },
} as const;

export type ChartTheme = typeof chartTheme;
