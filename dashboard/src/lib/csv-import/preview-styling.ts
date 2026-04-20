/**
 * Pure styling helpers for the CSV failure preview component.
 *
 * Kept in /lib (not /components) so the rules are unit-testable without
 * jsdom. The preview component imports these and applies them to JSX.
 *
 * The column tint palette uses Tailwind classes tuned against the StrydeOS
 * token palette — navy, blue, teal, purple — so the Rainbow-CSV feel still
 * reads as StrydeOS, not a dev tool.
 */

import type { ColumnSnapshot } from "./failure-snapshot";

const COLUMN_TINTS = [
  "bg-blue/[0.04]",
  "bg-teal/[0.05]",
  "bg-purple/[0.04]",
  "bg-warn/[0.04]",
  "bg-success/[0.04]",
  "bg-navy/[0.03]",
] as const;

export function columnTintClass(index: number): string {
  return COLUMN_TINTS[index % COLUMN_TINTS.length];
}

export function columnStatusClass(col: ColumnSnapshot): string {
  if (!col.mapped) return "bg-warn/10 text-warn border-warn/20";
  if (col.isRequired) return "bg-success/10 text-success border-success/20";
  return "bg-blue/10 text-blue border-blue/20";
}

export function columnStatusLabel(col: ColumnSnapshot): string {
  if (!col.mapped) return "unmapped";
  if (col.isRequired) return `${col.canonicalField} · required`;
  return col.canonicalField ?? "mapped";
}
